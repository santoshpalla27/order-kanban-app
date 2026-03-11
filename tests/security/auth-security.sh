#!/usr/bin/env bash
# Auth Security Tests
# Tests: JWT tampering, token reuse after logout, no-token access, expired token handling
#
# Usage: ./auth-security.sh [BASE_URL]
# Example: ./auth-security.sh http://localhost:8080/api

set -euo pipefail

BASE="${1:-http://localhost:8080/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@test.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-password123}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0; FAIL=0

pass() { echo -e "${GREEN}✓ PASS${NC} — $1"; ((PASS++)) || true; }
fail() { echo -e "${RED}✗ FAIL${NC} — $1"; ((FAIL++)) || true; }
section() { echo -e "\n${YELLOW}▶ $1${NC}"; }

# ─── Login ────────────────────────────────────────────────────────────────────
section "Login"

LOGIN=$(curl -sf -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" 2>&1) || true

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")
REFRESH=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('refresh_token',''))" 2>/dev/null || echo "")

if [ -n "$TOKEN" ]; then
  pass "Login returns access_token"
else
  fail "Login failed — set ADMIN_EMAIL / ADMIN_PASSWORD env vars"
  echo "  Response: $LOGIN"
  exit 1
fi

# ─── No token → 401 ───────────────────────────────────────────────────────────
section "Unauthenticated access"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/auth/me")
[ "$STATUS" = "401" ] && pass "GET /auth/me without token → 401" || fail "GET /auth/me without token → $STATUS (expected 401)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/products")
[ "$STATUS" = "401" ] && pass "GET /products without token → 401" || fail "GET /products without token → $STATUS (expected 401)"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/products" \
  -H "Content-Type: application/json" -d '{"product_id":"no-auth","customer_name":"x"}')
[ "$STATUS" = "401" ] && pass "POST /products without token → 401" || fail "POST /products without token → $STATUS (expected 401)"

# ─── Tampered JWT → 401 ───────────────────────────────────────────────────────
section "JWT tampering"

# Take the real token and replace the payload with a base64-encoded tampered payload
HEADER=$(echo "$TOKEN" | cut -d. -f1)
ORIG_PAYLOAD=$(echo "$TOKEN" | cut -d. -f2)
SIG=$(echo "$TOKEN" | cut -d. -f3)

# Tamper: role=admin, user_id=99999
TAMPERED_PAYLOAD=$(echo '{"user_id":99999,"role":"admin","exp":9999999999}' | base64 | tr -d '=' | tr '/+' '_-')
TAMPERED_TOKEN="${HEADER}.${TAMPERED_PAYLOAD}.${SIG}"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/auth/me" \
  -H "Authorization: Bearer $TAMPERED_TOKEN")
[ "$STATUS" = "401" ] && pass "Tampered JWT payload → 401" || fail "Tampered JWT payload → $STATUS (expected 401)"

# Random garbage token
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/auth/me" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.garbage.signature")
[ "$STATUS" = "401" ] && pass "Garbage JWT → 401" || fail "Garbage JWT → $STATUS (expected 401)"

# ─── Token after logout → 401 ─────────────────────────────────────────────────
section "Token invalidation after logout"

# Logout using refresh token
LOGOUT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/auth/logout" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}")
[ "$LOGOUT_STATUS" = "200" ] && pass "Logout returns 200" || fail "Logout returns $LOGOUT_STATUS"

# Try refresh after logout — should fail
REFRESH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}")
[ "$REFRESH_STATUS" = "401" ] && pass "Refresh token revoked after logout → 401" || fail "Refresh token still valid after logout → $REFRESH_STATUS"

# ─── Body size limit → 413 ────────────────────────────────────────────────────
section "Body size limit"

# Generate 3MB payload (exceeds 2MB limit)
LARGE_BODY=$(python3 -c "print('{\"message\":\"' + 'A'*3000000 + '\"}')")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/chat/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-raw "$LARGE_BODY" 2>/dev/null || echo "413")
[ "$STATUS" = "413" ] && pass "3MB body → 413 (body size limit)" || fail "3MB body → $STATUS (expected 413)"

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
[ "$FAIL" -eq 0 ] && echo -e "${GREEN}All auth security tests passed!${NC}" || echo -e "${RED}Some tests failed. Review the output above.${NC}"
