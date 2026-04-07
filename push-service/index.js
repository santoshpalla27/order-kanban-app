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

const DEFAULT_PUSH_TYPES = [
  'status_change', 'comment', 'mention',
  'attachment', 'chat', 'product_created', 'product_deleted',
];


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
  // mention always goes through
  if (notifType === 'mention') return true;

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
          case 'comment_added': {
            // backend message: "admin commented on ABC123"
            const ref = orderRef(message);
            title = ref ? `💬 Comment on ${ref}` : '💬 New Comment';
            body  = sender && content ? trunc(`${sender}: ${content}`) : trunc(message);
            break;
          }

          case 'mention': {
            if (entity === 'chat') {
              // Chat mention — show the actual message
              title = '💬 Team Chat';
              body  = sender && content ? trunc(`${sender}: ${content}`) : trunc(message);
            } else {
              // Product mention: "admin mentioned you in ABC123"
              const ref = orderRef(message);
              title = ref ? `💬 Mentioned in ${ref}` : '💬 You were mentioned';
              body  = sender && content ? trunc(`${sender}: ${content}`) : trunc(message);
            }
            break;
          }

          case 'attachment_uploaded': {
            // backend message: "admin uploaded 'filename.pdf' on ORD-001"
            const ref = orderRef(message);
            title = ref ? `📎 Attachment on ${ref}` : '📎 New Attachment';
            body  = trunc(message || (sender ? `${sender} uploaded an attachment` : 'New attachment'));
            break;
          }

          case 'customer_comment_added': {
            const ref = orderRef(message);
            title = ref ? `💬 Customer Message on ${ref}` : '💬 New Customer Message';
            body  = content ? trunc(content) : trunc(message || 'Customer sent a message');
            break;
          }

          case 'customer_attachment_uploaded': {
            const ref = orderRef(message);
            title = ref ? `📎 Customer File on ${ref}` : '📎 Customer File';
            body  = trunc(message || 'Customer uploaded a file');
            break;
          }

          case 'chat_message': {
            title = '💬 Team Chat';
            body  = sender && content ? trunc(`${sender}: ${content}`) : trunc(message);
            break;
          }

          case 'status_change': {
            // Handled by broadcast_except (activity_updated) — skip to avoid duplicate push
            return;
          }

          case 'product_created': {
            title = '📦 New Order Assigned';
            body  = trunc(message || 'You have been assigned to a new order');
            break;
          }

          default: {
            title = sender ? `📦 ${sender}` : '📦 KanbanFlow';
            body  = trunc(message || 'You have a new notification');
          }
        }

        // Map the push service type to the prefs type key
        const prefsTypeMap = {
          comment_added:                'comment',
          mention:                      'mention',
          attachment_uploaded:          'attachment',
          customer_comment_added:       'comment',
          customer_attachment_uploaded: 'attachment',
          chat_message:                 'chat',
          assignment:                   'assignment',
          delivery_reminder:            'delivery_reminder',
        };
        const prefsType = prefsTypeMap[type] || type;

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

      // ── 2. Broadcast-except: activity events (status changes, order movements, etc.) ──
      if (event.event_type === 'broadcast_except') {
        const wsMsg = JSON.parse(event.ws_msg);
        if (wsMsg.type !== 'activity_updated') return;

        const p     = wsMsg.payload || {};
        const msg   = (p.message    || '').trim();
        const actor = p.actor_name  || 'Someone';

        // Skip comment/attachment activities — those go via targeted notification events.
        if (p.entity === 'comment' || p.entity === 'attachment') return;

        // Derive a descriptive title from the pre-formatted activity message.
        // Backend formats:
        //   "Order ABC moved from Yet to Start to Working"  → 🔄 Status Update
        //   "Order ABC created for customer X"              → 📦 New Order
        //   "Order ABC details updated (customer: X)"       → 📝 Order Updated
        //   "Order ABC moved to trash"                      → 🗑️ Order Deleted
        //   "Order ABC restored from trash"                 → ♻️ Order Restored
        let title;
        if (/moved from .+ to /i.test(msg)) {
          title = '🔄 Status Update';
        } else if (/created for customer/i.test(msg) || / created$/i.test(msg)) {
          title = '📦 New Order';
        } else if (/details updated/i.test(msg) || / updated/i.test(msg)) {
          title = '📝 Order Updated';
        } else if (/moved to trash/i.test(msg)) {
          title = '🗑️ Order Deleted';
        } else if (/restored from trash/i.test(msg)) {
          title = '♻️ Order Restored';
        } else {
          title = `📦 ${actor}`;
        }

        // Body: "Actor: full activity message" so recipient knows who did it
        const body = msg ? `${actor}: ${msg}` : 'Order activity updated';

        // Determine prefs type for this activity event
        // product_created is handled by targeted notification events — skip to avoid duplicate push
        if (/created for customer/i.test(msg) || / created$/i.test(msg)) return;

        let activityPrefsType = 'status_change';
        if (/moved to trash/i.test(msg)) activityPrefsType = 'product_deleted';
        else if (/restored from trash/i.test(msg)) activityPrefsType = 'product_deleted';

        await sendPushToAllExceptFiltered(
          event.exclude_id || 0,
          {
            title, body,
            data: { entityType: 'product', entityId: p.entity_id || 0, type: 'activity' },
            collapseKey: makeCollapseKey('product', p.entity_id || 0, activityPrefsType),
          },
          activityPrefsType,
          'product',
          p.entity_id || 0
        );
        return;
      }

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
