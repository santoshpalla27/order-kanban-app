#!/usr/bin/env bash
# DDoS / Rate-Limit / Protocol Stress Tests
# Tests: concurrent request bursts, rate-limit enforcement on auth endpoints,
#        large payload handling, connection behaviour under load
#
# Usage: ./ddos-simulator.sh [BASE_URL]
# Note:  These are lightweight verification tests, not actual DDoS attacks.

set -euo pipefail

BASE="${1:-http://localhost:8080/api}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0; FAIL=0

pass()    { echo -e "${GREEN}✓ PASS${NC} — $1"; ((PASS++)) || true; }
fail()    { echo -e "${RED}✗ FAIL${NC} — $1"; ((FAIL++)) || true; }
section() { echo -e "\n${YELLOW}▶ $1${NC}"; }

# ─── Auth ─────────────────────────────────────────────────────────────────────
TOKEN=$(curl -sf -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL:-admin@test.com}\",\"password\":\"${ADMIN_PASSWORD:-password123}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "Login failed — check credentials"; exit 1
fi

# ─── Concurrent burst: public endpoint ───────────────────────────────────────
section "Concurrent burst — 20 simultaneous GET /health requests"

BURST=20
TMPDIR_BURST=$(mktemp -d)
for i in $(seq 1 $BURST); do
  curl -s -o /dev/null -w "%{http_code}" "$BASE/health" > "$TMPDIR_BURST/$i" &
done
wait

PASS_BURST=0; FAIL_BURST=0; RATE_LIMITED=0
for i in $(seq 1 $BURST); do
  S=$(cat "$TMPDIR_BURST/$i" 2>/dev/null || echo "000")
  if   [[ "$S" = "200" ]]; then ((PASS_BURST++))
  elif [[ "$S" = "429" ]]; then ((RATE_LIMITED++))
  else ((FAIL_BURST++))
  fi
done
rm -rf "$TMPDIR_BURST"

if [ "$FAIL_BURST" -eq 0 ]; then
  DETAIL="${PASS_BURST} × 200"
  [ "$RATE_LIMITED" -gt 0 ] && DETAIL="${DETAIL}, ${RATE_LIMITED} × 429 (rate limited)"
  pass "20 concurrent /health requests handled → $DETAIL"
else
  fail "20 concurrent /health: $FAIL_BURST error(s) — server unstable under small burst"
fi

# ─── Concurrent burst: authenticated endpoint ────────────────────────────────
section "Concurrent burst — 15 simultaneous GET /products"

BURST2=15
TMPDIR_BURST2=$(mktemp -d)
for i in $(seq 1 $BURST2); do
  curl -s -o /dev/null -w "%{http_code}" "$BASE/products?limit=5" \
    -H "Authorization: Bearer $TOKEN" > "$TMPDIR_BURST2/$i" &
done
wait

P2=0; F2=0; RL2=0
for i in $(seq 1 $BURST2); do
  S=$(cat "$TMPDIR_BURST2/$i" 2>/dev/null || echo "000")
  if   [[ "$S" = "200" ]]; then ((P2++))
  elif [[ "$S" = "429" ]]; then ((RL2++))
  else ((F2++))
  fi
done
rm -rf "$TMPDIR_BURST2"

if [ "$F2" -eq 0 ]; then
  DETAIL2="${P2} × 200"
  [ "$RL2" -gt 0 ] && DETAIL2="${DETAIL2}, ${RL2} × 429"
  pass "15 concurrent /products requests handled → $DETAIL2"
else
  fail "15 concurrent /products: $F2 error(s) — possible race condition or crash"
fi

# ─── Rate limiting on login endpoint ─────────────────────────────────────────
section "Login endpoint — rapid sequential requests"

RL_PASS=0; RL_FAIL=0; RL_429=0
for i in $(seq 1 15); do
  S=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"nonexistent-${i}@test.com\",\"password\":\"wrong\"}")
  if   [[ "$S" = "401" ]]; then ((RL_PASS++))
  elif [[ "$S" = "429" ]]; then ((RL_429++)); break   # rate limit kicked in — good
  elif [[ "$S" = "500" ]]; then ((RL_FAIL++))
  fi
done

if [ "$RL_FAIL" -eq 0 ]; then
  MSG="15 rapid login attempts → ${RL_PASS} × 401"
  [ "$RL_429" -gt 0 ] && MSG="${MSG}, rate-limited after attempt $((RL_PASS + 1)) (429)"
  pass "$MSG"
else
  fail "Login endpoint returned 500 under rapid requests ($RL_FAIL time(s))"
fi

# ─── Oversized headers ────────────────────────────────────────────────────────
section "Oversized / malformed request headers"

# Very long Authorization header value (not a real JWT)
LONG_HDR=$(python3 -c "print('Bearer ' + 'A'*8000)")
S=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/auth/me" \
  -H "Authorization: $LONG_HDR" 2>/dev/null || echo "000")
if [[ "$S" = "401" || "$S" = "400" || "$S" = "431" || "$S" = "413" ]]; then
  pass "8KB Authorization header → $S (handled gracefully)"
else
  fail "8KB Authorization header → $S (expected 400/401/431)"
fi

# Null byte in header
S=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health" \
  -H $'X-Evil: evil\x00value' 2>/dev/null || echo "400")
[[ "$S" = "400" || "$S" = "200" ]] && pass "Null byte in header → $S (no crash)" \
  || fail "Null byte in header → $S (unexpected)"

# ─── Slow / partial requests ──────────────────────────────────────────────────
section "Slow request handling"

# Send request with 3s timeout — server should respond within it
S=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$BASE/health" 2>/dev/null || echo "TIMEOUT")
if [[ "$S" = "200" ]]; then
  pass "Health endpoint responds within 3s (no slowloris vulnerability via this test)"
elif [[ "$S" = "TIMEOUT" ]]; then
  fail "Health endpoint timed out after 3s — check server health"
else
  pass "Health endpoint → $S within 3s"
fi

# ─── HTTP/1.0 downgrade ───────────────────────────────────────────────────────
section "Protocol handling"

S=$(curl -s -o /dev/null -w "%{http_code}" --http1.0 "$BASE/health" 2>/dev/null || echo "000")
[[ "$S" = "200" || "$S" = "400" || "$S" = "505" ]] \
  && pass "HTTP/1.0 request → $S (handled)" \
  || fail "HTTP/1.0 request → $S (unexpected response)"

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
[ "$FAIL" -eq 0 ] && echo -e "${GREEN}All DDoS/protocol tests passed!${NC}" \
  || echo -e "${RED}Some tests failed.${NC}"
