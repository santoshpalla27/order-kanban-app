/**
 * Spike Test — instant ramp to 100 users, hold 1 minute, drop back.
 * Tests system resilience to sudden traffic bursts (e.g. morning logins).
 *
 * Usage: k6 run spike.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('error_rate');

export const options = {
  stages: [
    { duration: '15s', target: 5   }, // baseline
    { duration: '30s', target: 100 }, // sudden spike
    { duration: '1m',  target: 100 }, // hold spike
    { duration: '15s', target: 5   }, // recover
    { duration: '15s', target: 0   },
  ],
  thresholds: {
    http_req_failed:   ['rate<0.05'],  // up to 5% allowed during spike
    http_req_duration: ['p(95)<2000'], // 95% under 2s during spike
    error_rate:        ['rate<0.05'],
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
  return { token: res.json('access_token') };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}` };

  // Simple board-level read — most common spike pattern is logins + board load
  const r = http.get(`${BASE}/products?status=yet_to_start&limit=20`, { headers });
  check(r, { 'products 200': (res) => res.status === 200 });
  errorRate.add(r.status !== 200);

  sleep(0.5);
}
