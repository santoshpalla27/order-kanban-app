/**
 * Smoke Test — 1 VU, 2 minutes.
 * Fastest sanity check: are all endpoints responding correctly?
 * Run this before any load test.
 *
 * Usage: k6 run smoke.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('error_rate');
const authDuration = new Trend('auth_duration', true);
const productDuration = new Trend('product_duration', true);

export const options = {
  vus: 1,
  duration: '2m',
  thresholds: {
    http_req_failed:   ['rate<0.01'],  // <1% failures
    http_req_duration: ['p(95)<1000'], // 95% under 1s
    error_rate:        ['rate<0.01'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:8080/api';
const ADMIN_EMAIL    = __ENV.ADMIN_EMAIL    || 'admin@test.com';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'password123';

export function setup() {
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, { 'setup login 200': (r) => r.status === 200 });
  if (res.status !== 200) {
    throw new Error(`Setup login failed: ${res.status} — ${res.body}`);
  }

  return {
    token: res.json('access_token'),
    refreshToken: res.json('refresh_token'),
  };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };

  // ── Health
  group('Health', () => {
    const r = http.get(`${BASE}/health`);
    check(r, { 'health 200': (res) => res.status === 200 });
    errorRate.add(r.status !== 200);
  });

  sleep(0.3);

  // ── Auth: get me
  group('Auth', () => {
    const start = Date.now();
    const r = http.get(`${BASE}/auth/me`, { headers });
    authDuration.add(Date.now() - start);
    check(r, {
      'get-me 200': (res) => res.status === 200,
      'returns user id': (res) => res.json('id') > 0,
    });
    errorRate.add(r.status !== 200);
  });

  sleep(0.3);

  // ── Products: list
  group('Products', () => {
    const start = Date.now();
    const r = http.get(`${BASE}/products?limit=20`, { headers });
    productDuration.add(Date.now() - start);
    check(r, {
      'products list 200': (res) => res.status === 200,
      'has data array': (res) => Array.isArray(res.json('data')),
    });
    errorRate.add(r.status !== 200);

    // Get single product if available
    const items = r.json('data');
    if (items && items.length > 0) {
      const detailRes = http.get(`${BASE}/products/${items[0].id}`, { headers });
      check(detailRes, { 'product detail 200': (res) => res.status === 200 });
      errorRate.add(detailRes.status !== 200);
    }
  });

  sleep(0.3);

  // ── Notifications
  group('Notifications', () => {
    const r = http.get(`${BASE}/notifications/unread-count`, { headers });
    check(r, {
      'unread count 200': (res) => res.status === 200,
      'count is number': (res) => typeof res.json('count') === 'number',
    });
    errorRate.add(r.status !== 200);
  });

  sleep(0.3);

  // ── Chat
  group('Chat', () => {
    const r = http.get(`${BASE}/chat/messages?limit=20`, { headers });
    check(r, { 'chat messages 200': (res) => res.status === 200 });
    errorRate.add(r.status !== 200);
  });

  sleep(1);
}

export function teardown(data) {
  if (data.refreshToken) {
    http.post(
      `${BASE}/auth/logout`,
      JSON.stringify({ refresh_token: data.refreshToken }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
}
