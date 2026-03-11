/**
 * Rate Limit Test — verifies /auth/login blocks at 10 req/min per IP.
 * Expects the 11th+ request to return 429.
 *
 * Usage: k6 run ratelimit.js
 */

import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 1,
  iterations: 15,  // 15 attempts; expect 11-15 to hit 429
  thresholds: {},  // no failure thresholds — we EXPECT 429s here
};

const BASE  = __ENV.BASE_URL       || 'http://localhost:8080/api';
const EMAIL = __ENV.ADMIN_EMAIL    || 'admin@test.com';

let attempt = 0;

export default function () {
  attempt++;

  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: EMAIL, password: 'wrong_password_intentional' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  console.log(`Attempt ${attempt}: HTTP ${res.status}`);

  if (attempt <= 10) {
    check(res, {
      [`attempt ${attempt}: not rate limited yet`]: (r) => r.status !== 429,
    });
  } else {
    check(res, {
      [`attempt ${attempt}: rate limited`]: (r) => r.status === 429,
    });
  }
}
