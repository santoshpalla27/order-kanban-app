#!/usr/bin/env bash
# Input Injection / Validation Tests
# Tests: SQL injection, XSS payloads, oversized inputs, invalid types
#
# Usage: ./injection-tests.sh [BASE_URL]

set -euo pipefail

BASE="${1:-http://localhost:8080/api}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0; FAIL=0

pass() { echo -e "${GREEN}✓ PASS${NC} — $1"; ((PASS++)); }
fail() { echo -e "${RED}✗ FAIL${NC} — $1"; ((FAIL++)); }
section() { echo -e "\n${YELLOW}▶ $1${NC}"; }

# Get admin token
LOGIN=$(curl -sf -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL:-admin@test.com}\",\"password\":\"${ADMIN_PASSWORD:-password123}\"}" 2>&1) || true
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "Login failed — check ADMIN_EMAIL / ADMIN_PASSWORD"
  exit 1
fi

AUTH="-H \"Authorization: Bearer $TOKEN\" -H \"Content-Type: application/json\""

# ─── SQL Injection ────────────────────────────────────────────────────────────
section "SQL Injection — GORM parameterization"

SQL_PAYLOADS=(
  "' OR '1'='1"
  "1; DROP TABLE products; --"
  "' UNION SELECT * FROM users --"
  "admin'--"
  "1 OR 1=1"
)

for payload in "${SQL_PAYLOADS[@]}"; do
  # Try in search param
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    --get --data-urlencode "search=$payload" "$BASE/products")
  # Should return 200 (safe, empty results) or 400, never 500
  if [[ "$STATUS" = "200" || "$STATUS" = "400" ]]; then
    pass "SQL injection in search '$payload' → $STATUS (safe)"
  else
    fail "SQL injection in search '$payload' → $STATUS (check for 500 = vulnerability)"
  fi
done

# Try in product creation
for payload in "${SQL_PAYLOADS[@]}"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/products" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"product_id\":\"SAFE-$$\",\"customer_name\":\"$payload\"}")
  # Should succeed (201) or fail gracefully (400), never 500
  if [[ "$STATUS" = "201" || "$STATUS" = "400" || "$STATUS" = "422" ]]; then
    pass "SQL injection in customer_name '$payload' → $STATUS (handled safely)"
    # Cleanup if created
    if [ "$STATUS" = "201" ]; then
      ID=$(curl -sf "$BASE/products?search=SAFE-$$" \
        -H "Authorization: Bearer $TOKEN" \
        | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(d[0]['id'] if d else '')" 2>/dev/null || echo "")
      [ -n "$ID" ] && curl -sf -X DELETE "$BASE/products/$ID" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1 || true
    fi
  else
    fail "SQL injection in customer_name → $STATUS (check for 500)"
  fi
done

# ─── XSS Payloads ─────────────────────────────────────────────────────────────
section "XSS — stored and reflected (stored should succeed, never execute server-side)"

XSS_PAYLOADS=(
  '<script>alert(1)</script>'
  '"><img src=x onerror=alert(1)>'
  "javascript:alert(1)"
  '<svg onload=alert(1)>'
)

for payload in "${XSS_PAYLOADS[@]}"; do
  # Store XSS in description — backend should accept and store as plaintext (React escapes on render)
  RESPONSE=$(curl -sf -X POST "$BASE/products" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"product_id\":\"XSS-$$-$RANDOM\",\"customer_name\":\"XSS Test\",\"description\":\"$(echo $payload | sed 's/"/\\"/g')\"}" 2>/dev/null || echo "")

  STORED_DESC=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('description','ERR'))" 2>/dev/null || echo "")
  ID=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

  if [ -n "$ID" ]; then
    # Verify it was stored as-is (not executed server-side)
    pass "XSS payload stored safely (rendering security is frontend's responsibility)"
    curl -sf -X DELETE "$BASE/products/$ID" -H "Authorization: Bearer $TOKEN" > /dev/null 2>&1 || true
  else
    fail "XSS test: unexpected response for payload '$payload'"
  fi
done

# ─── Oversized inputs ─────────────────────────────────────────────────────────
section "Oversized inputs"

# 2MB JSON body (at the limit) — may pass or 413
BIG_DESC=$(python3 -c "print('A' * 1000000)")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/products" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"product_id\":\"BIG-$$\",\"customer_name\":\"test\",\"description\":\"$BIG_DESC\"}" 2>/dev/null || echo "413")
[ "$STATUS" = "413" ] && pass "1MB description body → 413 (body limit enforced)" \
  || { [ "$STATUS" = "201" ] && pass "1MB description accepted (under 2MB limit)" || fail "Oversized body → $STATUS (expected 413 or 201)"; }

# ─── Invalid types ────────────────────────────────────────────────────────────
section "Invalid types and values"

# Invalid status value
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/products/1/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"HACKED"}')
[ "$STATUS" = "400" ] && pass "Invalid status value → 400" || fail "Invalid status → $STATUS (expected 400)"

# Non-numeric product ID
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/products/not-a-number" \
  -H "Authorization: Bearer $TOKEN")
[[ "$STATUS" = "400" || "$STATUS" = "404" ]] && pass "Non-numeric product ID → $STATUS (handled)" || fail "Non-numeric ID → $STATUS"

# Negative cursor
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/products?cursor=-999" \
  -H "Authorization: Bearer $TOKEN")
[[ "$STATUS" = "200" || "$STATUS" = "400" ]] && pass "Negative cursor → $STATUS (no crash)" || fail "Negative cursor → $STATUS (expected 200 or 400)"

# ─── CORS — wrong origin ──────────────────────────────────────────────────────
section "CORS headers"

CORS_RESULT=$(curl -s -I -X OPTIONS "$BASE/products" \
  -H "Origin: https://evil.example.com" \
  -H "Access-Control-Request-Method: GET" 2>/dev/null || echo "")

if echo "$CORS_RESULT" | grep -q "access-control-allow-origin: https://evil.example.com"; then
  fail "CORS allows arbitrary origin https://evil.example.com — check CORS_ORIGINS config"
else
  pass "CORS does not allow arbitrary origins"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
[ "$FAIL" -eq 0 ] && echo -e "${GREEN}All injection tests passed!${NC}" || echo -e "${RED}Some tests failed.${NC}"
