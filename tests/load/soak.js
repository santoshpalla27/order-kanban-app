/**
 * Soak Test — 30 users, 30 minutes.
 * Detects memory leaks, connection pool exhaustion, and gradual degradation.
 *
 * Usage: k6 run soak.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const errorRate   = new Rate('error_rate');
const latencyTrend = new Trend('latency_over_time', true);

export const options = {
  stages: [
    { duration: '2m',  target: 30 }, // warm up
    { duration: '26m', target: 30 }, // hold — watch for degradation
    { duration: '2m',  target: 0  }, // cool down
  ],
  thresholds: {
    http_req_failed:   ['rate<0.01'],
    http_req_duration: ['p(95)<600'],  // tighter than spike — stable load
    error_rate:        ['rate<0.01'],
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

  const token = res.json('access_token');
  const products = http.get(`${BASE}/products?limit=30`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const productIds = (products.json('data') || []).map((p) => p.id).slice(0, 10);

  return { token, productIds };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' };
  const productIds = data.productIds || [];

  const start = Date.now();

  // 70% reads, 20% status changes, 10% comments — sustained activity
  const roll = randomIntBetween(1, 100);

  if (roll <= 70) {
    group('read', () => {
      const r = http.get(`${BASE}/products?limit=20`, { headers });
      check(r, { 'list 200': (res) => res.status === 200 });
      errorRate.add(r.status !== 200);
    });
  } else if (roll <= 90) {
    group('status_change', () => {
      if (!productIds.length) return;
      const id = productIds[randomIntBetween(0, productIds.length - 1)];
      const statuses = ['yet_to_start', 'working', 'review', 'done'];
      const r = http.patch(
        `${BASE}/products/${id}/status`,
        JSON.stringify({ status: statuses[randomIntBetween(0, 3)] }),
        { headers }
      );
      check(r, { 'status 200': (res) => res.status === 200 });
      errorRate.add(r.status !== 200);
    });
  } else {
    group('comment', () => {
      if (!productIds.length) return;
      const id = productIds[randomIntBetween(0, productIds.length - 1)];
      const r = http.post(
        `${BASE}/products/${id}/comments`,
        JSON.stringify({ message: `Soak test ${Date.now()}` }),
        { headers }
      );
      check(r, { 'comment 201': (res) => res.status === 201 });
      errorRate.add(r.status !== 201);
    });
  }

  latencyTrend.add(Date.now() - start);
  sleep(randomIntBetween(1, 3));
}
