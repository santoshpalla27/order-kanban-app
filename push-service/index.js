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

// Returns all user IDs that have registered push tokens, excluding excludeId.
async function getPushUserIdsExcept(excludeId) {
  const client = newClient();
  await client.connect();
  const { rows } = await client.query(
    `SELECT DISTINCT user_id FROM device_push_tokens WHERE user_id != $1`,
    [excludeId || 0]
  );
  await client.end();
  return rows.map(r => r.user_id);
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

// ─── Notification prefs helpers ───────────────────────────────────────────────

// Fetch a user's notification_prefs JSONB from the users table.
async function getUserPrefs(userId) {
  const client = newClient();
  await client.connect();
  const { rows } = await client.query(
    'SELECT notification_prefs FROM users WHERE id = $1',
    [userId]
  );
  await client.end();
  if (!rows.length) return null;
  const raw = rows[0].notification_prefs;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

// Push is only sent for actionable notification types — reduces noise significantly.
const DEFAULT_PUSH_TYPES = ['mention', 'assigned', 'customer_message', 'completed', 'chat'];


// Check if userId is assigned to productId via product_assignees.
async function isAssignedToProduct(userId, productId) {
  if (!productId) return false;
  const client = newClient();
  await client.connect();
  const { rows } = await client.query(
    'SELECT 1 FROM product_assignees WHERE user_id = $1 AND product_id = $2 LIMIT 1',
    [userId, productId]
  );
  await client.end();
  return rows.length > 0;
}

// Determine whether a push should be sent based on user prefs.
// notifType: one of the prefs type keys (e.g. "status_change", "comment", etc.)
// entityType: "product" | "chat" | other
// entityId: product ID (for assignment check), 0 otherwise
async function shouldSendPush(userId, notifType, entityType, entityId) {
  // All 4 actionable types + chat always go through without pref checks
  if (['mention', 'assigned', 'customer_message', 'completed', 'chat_message'].includes(notifType)) return true;

  const prefs = await getUserPrefs(userId);
  if (!prefs) return true; // no prefs → default allow

  if (entityType === 'chat') {
    const types = Array.isArray(prefs.custom_all_types) ? prefs.custom_all_types : DEFAULT_PUSH_TYPES;
    return types.includes(notifType);
  }

  if (entityType === 'product' && entityId) {
    const isAssigned = await isAssignedToProduct(userId, entityId);
    const types = isAssigned
      ? (Array.isArray(prefs.custom_my_types)  ? prefs.custom_my_types  : DEFAULT_PUSH_TYPES)
      : (Array.isArray(prefs.custom_all_types) ? prefs.custom_all_types : DEFAULT_PUSH_TYPES);
    return types.includes(notifType);
  }

  const types = Array.isArray(prefs.custom_all_types) ? prefs.custom_all_types : DEFAULT_PUSH_TYPES;
  return types.includes(notifType);
}

// Like sendPushToAllExcept but respects each user's notification prefs.
async function sendPushToAllExceptFiltered(excludeId, opts, notifType, entityType, entityId) {
  try {
    const userIds = await getPushUserIdsExcept(excludeId);
    if (!userIds.length) return;
    await Promise.all(userIds.map(async (uid) => {
      const allowed = await shouldSendPush(uid, notifType, entityType, entityId);
      if (allowed) await sendPushToUser(uid, opts);
    }));
  } catch (err) {
    console.error('sendPushToAllExceptFiltered error:', err.message);
  }
}

// Build a collapse key so multiple notifications of the same type on the same
// entity collapse into one banner instead of stacking.
// Returns null when entityId is missing — without a real entity ID we can't
// safely group, so each notification gets its own banner.
function makeCollapseKey(entityType, entityId, notifType) {
  if (!entityId) return null;
  return `${entityType}:${entityId}:${notifType}`;
}

// ─── Send push to a single user ───────────────────────────────────────────────
async function sendPushToUser(userId, { title, body, data, collapseKey }) {
  const tokens = await getTokensForUser(userId);
  if (!tokens.length) return;

  const messages = tokens.map(token => ({
    to:        token,
    sound:     'default',
    title,
    body,
    data:      data || {},
    priority:  'high',
    channelId: 'default',
    // Collapse same-entity same-type notifications into one on Android.
    // If a newer notification arrives with the same key it replaces the old one
    // instead of stacking — prevents 10 separate "New Comment" banners.
    ...(collapseKey ? { collapseKey } : {}),
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

// ─── Send push to all users with tokens, except one ──────────────────────────
async function sendPushToAllExcept(excludeId, opts) {
  try {
    const userIds = await getPushUserIdsExcept(excludeId);
    if (!userIds.length) return;
    await Promise.all(userIds.map(uid => sendPushToUser(uid, opts)));
  } catch (err) {
    console.error('sendPushToAllExcept error:', err.message);
  }
}

// ─── PostgreSQL LISTEN/NOTIFY ─────────────────────────────────────────────────
async function startListener() {
  const client = newClient();

  client.on('error', (err) => {
    console.error('PG listener connection error:', err.message);
    client.end().catch(() => {});
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

      // ── 1. User-targeted notifications (comments, mentions, attachments, chat) ──
      if (event.event_type === 'user' && event.user_id) {
        const wsMsg = JSON.parse(event.ws_msg);
        if (wsMsg.type !== 'notification') return;

        const p       = wsMsg.payload || {};
        const type    = p.notif_type  || '';
        const entity  = p.entity_type || '';
        const sender  = p.sender_name || '';
        const content = (p.content    || '').trim();
        const message = (p.message    || '').trim();

        // Truncate to fit push notification body limits (~100 chars)
        const trunc = (s, n = 100) => s.length > n ? s.slice(0, n - 1) + '…' : s;

        // Extract the order display-ID embedded in backend-formatted messages:
        //   "admin commented on ABC123"      → "ABC123"
        //   "admin mentioned you in ABC123"  → "ABC123"
        const orderRef = (msg) => {
          const m = msg.match(/ on (\S+)$/) || msg.match(/ in (\S+)$/) || msg.match(/^Order (\S+)/);
          return m ? m[1] : null;
        };

        let title, body;

        switch (type) {
          case 'mention': {
            if (entity === 'chat') {
              title = '💬 Team Chat';
              body  = sender && content ? trunc(`${sender}: ${content}`) : trunc(message);
            } else {
              const ref = orderRef(message);
              title = ref ? `💬 Mentioned in ${ref}` : '💬 You were mentioned';
              body  = sender && content ? trunc(`${sender}: ${content}`) : trunc(message);
            }
            break;
          }

          case 'assigned': {
            const ref = orderRef(message);
            title = ref ? `📦 Assigned to ${ref}` : '📦 New Order Assigned';
            body  = trunc(message || 'You have been assigned to an order');
            break;
          }

          case 'customer_message': {
            const ref = orderRef(message);
            title = ref ? `💬 Customer on ${ref}` : '💬 Customer Message';
            body  = content ? trunc(content) : trunc(message || 'Customer sent a message');
            break;
          }

          case 'completed': {
            const ref = orderRef(message);
            title = ref ? `✅ Order ${ref} completed` : '✅ Order Completed';
            body  = trunc(message || 'An order was marked as done');
            break;
          }

          case 'chat_message': {
            title = '💬 Team Chat';
            body  = sender && content ? trunc(`${sender}: ${content}`) : trunc(message);
            break;
          }

          default:
            // Skip all other notification types (comment_added, attachment_uploaded, status_change, etc.)
            return;
        }

        // type is used directly as the prefs key
        const prefsType = type;

        const allowed = await shouldSendPush(
          event.user_id, prefsType, entity, p.entity_id || 0
        );
        if (!allowed) return;

        await sendPushToUser(event.user_id, {
          title,
          body,
          data: { entityType: entity, entityId: p.entity_id || 0, type },
          collapseKey: makeCollapseKey(entity, p.entity_id || 0, type),
        });
        return;
      }

      // broadcast_except events (activity_updated, status changes) no longer generate push.
      // The timeline feed shows these events inline; targeted notifications handle completions.

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
