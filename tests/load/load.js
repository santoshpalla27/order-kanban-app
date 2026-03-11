/**
 * Load Test — 30 to 50 concurrent virtual users, 5 minutes.
 * Simulates realistic production traffic with mixed read/write operations.
 * Models kanban board usage: mostly reads, some status changes and comments.
 *
 * Usage: k6 run load.js
 * Usage (custom users): k6 run --env PEAK_VUS=40 load.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Custom metrics
const errorRate      = new Rate('error_rate');
const productReads   = new Counter('product_reads');
const statusChanges  = new Counter('status_changes');
const commentCreates = new Counter('comment_creates');
const p99Duration    = new Trend('p99_req_duration', true);

const PEAK_VUS = parseInt(__ENV.PEAK_VUS || '50', 10);

export const options = {
  stages: [
    { duration: '30s', target: 10        }, // warm up
    { duration: '1m',  target: 30        }, // ramp to 30
    { duration: '2m',  target: PEAK_VUS  }, // hold at peak (30-50)
    { duration: '1m',  target: 30        }, // step down
    { duration: '30s', target: 0         }, // cool down
  ],
  thresholds: {
    http_req_duration:         ['p(95)<500', 'p(99)<1000'],
    http_req_failed:           ['rate<0.01'],
    error_rate:                ['rate<0.02'],
    'http_req_duration{type:read}':  ['p(95)<400'],
    'http_req_duration{type:write}': ['p(95)<800'],
  },
};

const BASE            = __ENV.BASE_URL       || 'http://localhost:8080/api';
const ADMIN_EMAIL     = __ENV.ADMIN_EMAIL    || 'admin@test.com';
const ADMIN_PASSWORD  = __ENV.ADMIN_PASSWORD || 'password123';

export function setup() {
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(res, { 'setup login ok': (r) => r.status === 200 });

  // Get some product IDs and a product with comments for realistic tests
  const token = res.json('access_token');
  const products = http.get(`${BASE}/products?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const productList = products.json('data') || [];

  return {
    token,
    refreshToken: res.json('refresh_token'),
    productIds: productList.map((p) => p.id).slice(0, 20),
  };
}

export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };
  const productIds = data.productIds || [];

  // Weighted scenario mix:
  // 55% — read product list (kanban board refresh)
  // 20% — read single product detail
  // 10% — status change (drag-drop simulation)
  // 10% — read notifications
  //  5% — post comment

  const roll = randomIntBetween(1, 100);

  if (roll <= 55) {
    // ── Read product list (Kanban column query)
    group('product_list', () => {
      const statuses = ['yet_to_start', 'working', 'review', 'done'];
      const status = statuses[randomIntBetween(0, 3)];
      const start = Date.now();
      const r = http.get(`${BASE}/products?status=${status}&limit=20`, {
        headers,
        tags: { type: 'read' },
      });
      p99Duration.add(Date.now() - start);
      check(r, { 'product list 200': (res) => res.status === 200 });
      errorRate.add(r.status !== 200);
      productReads.add(1);
    });
    sleep(randomIntBetween(1, 3));

  } else if (roll <= 75) {
    // ── Read single product detail
    group('product_detail', () => {
      if (productIds.length === 0) return;
      const id = productIds[randomIntBetween(0, productIds.length - 1)];
      const start = Date.now();
      const r = http.get(`${BASE}/products/${id}`, {
        headers,
        tags: { type: 'read' },
      });
      p99Duration.add(Date.now() - start);
      check(r, {
        'product detail 200': (res) => res.status === 200,
        'has creator': (res) => !!res.json('creator'),
      });
      errorRate.add(r.status !== 200);
      productReads.add(1);
    });
    sleep(randomIntBetween(2, 5));

  } else if (roll <= 85) {
    // ── Status change (simulates drag-drop)
    group('status_change', () => {
      if (productIds.length === 0) return;
      const id = productIds[randomIntBetween(0, productIds.length - 1)];
      const statuses = ['yet_to_start', 'working', 'review', 'done'];
      const newStatus = statuses[randomIntBetween(0, 3)];
      const start = Date.now();
      const r = http.patch(
        `${BASE}/products/${id}/status`,
        JSON.stringify({ status: newStatus }),
        { headers, tags: { type: 'write' } }
      );
      p99Duration.add(Date.now() - start);
      check(r, { 'status change 200': (res) => res.status === 200 });
      errorRate.add(r.status !== 200);
      statusChanges.add(1);
    });
    sleep(randomIntBetween(1, 3));

  } else if (roll <= 95) {
    // ── Read notifications
    group('notifications', () => {
      const r = http.get(`${BASE}/notifications/unread-count`, {
        headers,
        tags: { type: 'read' },
      });
      check(r, { 'unread count 200': (res) => res.status === 200 });
      errorRate.add(r.status !== 200);
    });
    sleep(randomIntBetween(1, 2));

  } else {
    // ── Post a comment
    group('create_comment', () => {
      if (productIds.length === 0) return;
      const id = productIds[randomIntBetween(0, productIds.length - 1)];
      const start = Date.now();
      const r = http.post(
        `${BASE}/products/${id}/comments`,
        JSON.stringify({ message: `Load test comment ${Date.now()}` }),
        { headers, tags: { type: 'write' } }
      );
      p99Duration.add(Date.now() - start);
      check(r, { 'comment created 201': (res) => res.status === 201 });
      errorRate.add(r.status !== 201);
      commentCreates.add(1);
    });
    sleep(randomIntBetween(2, 4));
  }
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
