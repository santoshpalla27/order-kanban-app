'use strict';

const { Client } = require('pg');
const { Expo }   = require('expo-server-sdk');
const express    = require('express');

// ─── Config ───────────────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
const PORT         = Number(process.env.PORT) || 4001;
const ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN || ''; // optional Expo access token

if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL env var is required');
  process.exit(1);
}

// ─── Expo SDK instance ────────────────────────────────────────────────────────
const expo = new Expo({ accessToken: ACCESS_TOKEN || undefined });

// ─── Express app (token registration) ────────────────────────────────────────
const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Register a push token for a user
// POST /push/register  { user_id, token, platform }
app.post('/push/register', async (req, res) => {
  const { user_id, token, platform } = req.body;
  if (!user_id || !token) {
    return res.status(400).json({ error: 'user_id and token required' });
  }
  if (!Expo.isExpoPushToken(token)) {
    return res.status(400).json({ error: 'Invalid Expo push token' });
  }
  try {
    const client = newClient();
    await client.connect();
    await client.query(
      `INSERT INTO device_push_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, token) DO UPDATE SET updated_at = NOW()`,
      [user_id, token, platform || 'unknown']
    );
    await client.end();
    res.json({ ok: true });
  } catch (err) {
    console.error('register error:', err.message);
    res.status(500).json({ error: 'Failed to register token' });
  }
});

// Unregister a push token (on logout)
// DELETE /push/unregister  { token }
app.delete('/push/unregister', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });
  try {
    const client = newClient();
    await client.connect();
    await client.query('DELETE FROM device_push_tokens WHERE token = $1', [token]);
    await client.end();
    res.json({ ok: true });
  } catch (err) {
    console.error('unregister error:', err.message);
    res.status(500).json({ error: 'Failed to unregister token' });
  }
});

// ─── DB helpers ───────────────────────────────────────────────────────────────
function newClient() {
  return new Client({ connectionString: DATABASE_URL });
}

async function ensureTable() {
  const client = newClient();
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS device_push_tokens (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      token      TEXT    NOT NULL,
      platform   TEXT    NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT device_push_tokens_user_token UNIQUE (user_id, token)
    )
  `);
  await client.end();
  console.log('Push service: device_push_tokens table ready');
}

async function getTokensForUser(userId) {
  const client = newClient();
  await client.connect();
  const { rows } = await client.query(
    'SELECT token FROM device_push_tokens WHERE user_id = $1',
    [userId]
  );
  await client.end();
  return rows.map(r => r.token).filter(t => Expo.isExpoPushToken(t));
}

async function deleteInvalidTokens(tokens) {
  if (!tokens.length) return;
  const client = newClient();
  await client.connect();
  await client.query(
    'DELETE FROM device_push_tokens WHERE token = ANY($1::text[])',
    [tokens]
  );
  await client.end();
}

// ─── Send push to a user ──────────────────────────────────────────────────────
async function sendPushToUser(userId, { title, body, data }) {
  const tokens = await getTokensForUser(userId);
  if (!tokens.length) return;

  const messages = tokens.map(token => ({
    to:    token,
    sound: 'default',
    title,
    body,
    data:  data || {},
    // Android: show heads-up notification even in foreground
    priority: 'high',
    channelId: 'default',
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const invalidTokens = [];

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (let i = 0; i < tickets.length; i++) {
        const t = tickets[i];
        if (t.status === 'error') {
          console.warn('Push ticket error:', t.message);
          // DeviceNotRegistered = stale token, remove it
          if (t.details?.error === 'DeviceNotRegistered') {
            invalidTokens.push(messages[i].to);
          }
        }
      }
    } catch (err) {
      console.error('sendPushNotificationsAsync error:', err.message);
    }
  }

  if (invalidTokens.length) await deleteInvalidTokens(invalidTokens);
}

// ─── PostgreSQL LISTEN/NOTIFY ─────────────────────────────────────────────────
async function startListener() {
  const client = newClient();

  client.on('error', (err) => {
    console.error('PG listener connection error:', err.message);
    client.end().catch(() => {});
    // Reconnect after 5s
    setTimeout(startListener, 5000);
  });

  try {
    await client.connect();
    await client.query('LISTEN kanban_realtime');
    console.log('Push service: LISTEN kanban_realtime');
  } catch (err) {
    console.error('PG listener connect failed, retrying in 5s:', err.message);
    await client.end().catch(() => {});
    setTimeout(startListener, 5000);
    return;
  }

  client.on('notification', async (msg) => {
    if (msg.channel !== 'kanban_realtime') return;
    try {
      const event = JSON.parse(msg.payload);

      // We only handle user-targeted events (EmitToUser calls)
      if (event.event_type !== 'user' || !event.user_id) return;

      const wsMsg = JSON.parse(event.ws_msg);

      // Only send push for "notification" type WS messages
      if (wsMsg.type !== 'notification') return;

      const p = wsMsg.payload || {};
      const title = p.sender_name ? `📦 ${p.sender_name}` : '📦 KanbanFlow';
      const body  = p.message || 'You have a new notification';

      await sendPushToUser(event.user_id, {
        title,
        body,
        data: {
          entityType: p.entity_type || '',
          entityId:   p.entity_id   || 0,
          type:       p.notif_type  || 'notification',
        },
      });
    } catch (err) {
      console.error('Notification handler error:', err.message);
    }
  });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
(async () => {
  try {
    await ensureTable();
    await startListener();
    app.listen(PORT, () => {
      console.log(`Push service listening on :${PORT}`);
    });
  } catch (err) {
    console.error('Push service startup error:', err);
    process.exit(1);
  }
})();
