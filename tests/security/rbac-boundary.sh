#!/usr/bin/env bash
# RBAC Boundary Tests
# Tests: all role×endpoint combinations to ensure no escalation paths exist
#
# Usage: ./rbac-boundary.sh [BASE_URL]
# Requires: 5 test accounts (one per role) precreated in the DB

set -euo pipefail

BASE="${1:-http://localhost:8080/api}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0; FAIL=0

pass() { echo -e "${GREEN}✓ PASS${NC} — $1"; ((PASS++)) || true; }
fail() { echo -e "${RED}✗ FAIL${NC} — $1"; ((FAIL++)) || true; }
section() { echo -e "\n${YELLOW}▶ $1${NC}"; }

login() {
  local email="$1" pass="$2"
  curl -sf -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo ""
}

check_status() {
  local label="$1" expected="$2" actual="$3"
  [ "$actual" = "$expected" ] && pass "$label" || fail "$label → got $actual expected $expected"
}

# ─── Login as each role ───────────────────────────────────────────────────────
section "Authenticating as each role"

ADMIN_TOKEN=$(login "${ADMIN_EMAIL:-admin@test.com}"         "${ADMIN_PASSWORD:-password123}")
MANAGER_TOKEN=$(login "${MANAGER_EMAIL:-manager@test.com}"   "${MANAGER_PASSWORD:-password123}")
ORGANISER_TOKEN=$(login "${ORGANISER_EMAIL:-organiser@test.com}" "${ORGANISER_PASSWORD:-password123}")
EMPLOYEE_TOKEN=$(login "${EMPLOYEE_EMAIL:-employee@test.com}" "${EMPLOYEE_PASSWORD:-password123}")
VIEWONLY_TOKEN=$(login "${VIEWONLY_EMAIL:-viewonly@test.com}" "${VIEWONLY_PASSWORD:-password123}")

[ -n "$ADMIN_TOKEN" ]    && pass "Admin login"     || { fail "Admin login — check credentials"; exit 1; }
[ -n "$MANAGER_TOKEN" ]  && pass "Manager login"   || fail "Manager login"
[ -n "$ORGANISER_TOKEN" ] && pass "Organiser login" || fail "Organiser login"
[ -n "$EMPLOYEE_TOKEN" ] && pass "Employee login"  || fail "Employee login"
[ -n "$VIEWONLY_TOKEN" ] && pass "View Only login"  || fail "View Only login"

# ─── Get a product ID for testing ─────────────────────────────────────────────
PRODUCT_ID=$(curl -sf "$BASE/products?limit=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(d[0]['id'] if d else '')" 2>/dev/null || echo "")

if [ -z "$PRODUCT_ID" ]; then
  # Create one
  PRODUCT_ID=$(curl -sf -X POST "$BASE/products" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"product_id":"RBAC-SEC-TEST","customer_name":"RBAC Test"}' \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
fi

# ─── Create product ───────────────────────────────────────────────────────────
section "POST /products — who can create?"

TS=$(date +%s%3N)   # millisecond timestamp — unique per run inside Docker
for role in admin manager organiser; do
  eval "TOKEN=\${${role^^}_TOKEN}"
  PID="RBAC-CRE-${role}-${TS}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/products" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"product_id\":\"$PID\",\"customer_name\":\"RBAC test\"}")
  check_status "$role can create product" "201" "$STATUS"
  # Cleanup created product
  if [ "$STATUS" = "201" ]; then
    NEW_ID=$(curl -sf "$BASE/products?limit=1" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(d[0]['id'] if d else '')" 2>/dev/null || echo "")
    [ -n "$NEW_ID" ] && curl -sf -X DELETE "$BASE/products/$NEW_ID" \
      -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null 2>&1 || true
  fi
  TS=$((TS + 1))   # ensure each ID is unique even if loop is fast
done

for role in employee viewonly; do
  eval "TOKEN=\${${role^^}_TOKEN}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/products" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"product_id":"RBAC-DENY","customer_name":"test"}')
  check_status "$role CANNOT create product" "403" "$STATUS"
done

# ─── Delete product ───────────────────────────────────────────────────────────
section "DELETE /products/:id — admin + manager only"

for role in organiser employee viewonly; do
  eval "TOKEN=\${${role^^}_TOKEN}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/products/$PRODUCT_ID" \
    -H "Authorization: Bearer $TOKEN")
  check_status "$role CANNOT delete product" "403" "$STATUS"
done

for role in admin manager; do
  eval "TOKEN=\${${role^^}_TOKEN}"
  # Create a temp product for deletion test
  TMP_ID=$(curl -sf -X POST "$BASE/products" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"product_id\":\"RBAC-DEL-${role}-$$\",\"customer_name\":\"del test\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  if [ -n "$TMP_ID" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/products/$TMP_ID" \
      -H "Authorization: Bearer $TOKEN")
    check_status "$role can delete product" "200" "$STATUS"
  fi
done

# ─── Trash access ─────────────────────────────────────────────────────────────
section "GET /products/deleted — admin + manager only"

for role in organiser employee viewonly; do
  eval "TOKEN=\${${role^^}_TOKEN}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/products/deleted" \
    -H "Authorization: Bearer $TOKEN")
  check_status "$role CANNOT access trash" "403" "$STATUS"
done

for role in admin manager; do
  eval "TOKEN=\${${role^^}_TOKEN}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/products/deleted" \
    -H "Authorization: Bearer $TOKEN")
  check_status "$role can access trash" "200" "$STATUS"
done

# ─── User management — admin only ─────────────────────────────────────────────
section "GET /users — admin only"

for role in manager organiser employee viewonly; do
  eval "TOKEN=\${${role^^}_TOKEN}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/users" \
    -H "Authorization: Bearer $TOKEN")
  check_status "$role CANNOT list users" "403" "$STATUS"
done

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
check_status "admin can list users" "200" "$STATUS"

section "PATCH /users/:id/role — admin only"

for role in manager organiser employee viewonly; do
  eval "TOKEN=\${${role^^}_TOKEN}"
  # Try to promote self or change someone else's role
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE/users/1/role" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"role_id":1}')
  check_status "$role CANNOT change user role" "403" "$STATUS"
done

# ─── Comment creation — employee+ ─────────────────────────────────────────────
section "POST /products/:id/comments — employee and above"

for role in admin manager organiser employee; do
  eval "TOKEN=\${${role^^}_TOKEN}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/products/$PRODUCT_ID/comments" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"message":"rbac test comment"}')
  check_status "$role can create comment" "201" "$STATUS"
done

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/products/$PRODUCT_ID/comments" \
  -H "Authorization: Bearer $VIEWONLY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"should fail"}')
check_status "viewonly CANNOT create comment" "403" "$STATUS"

# ─── Horizontal privilege escalation ─────────────────────────────────────────
section "Horizontal privilege escalation (ownership)"

# Create a comment as organiser
COMMENT_ID=$(curl -sf -X POST "$BASE/products/$PRODUCT_ID/comments" \
  -H "Authorization: Bearer $ORGANISER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"organiser comment for ownership test"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")

if [ -n "$COMMENT_ID" ]; then
  # Employee tries to delete organiser's comment
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/comments/$COMMENT_ID" \
    -H "Authorization: Bearer $EMPLOYEE_TOKEN")
  check_status "employee CANNOT delete organiser's comment" "403" "$STATUS"

  # Admin CAN delete any comment
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/comments/$COMMENT_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  check_status "admin can delete any comment" "200" "$STATUS"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
[ "$FAIL" -eq 0 ] && echo -e "${GREEN}All RBAC boundary tests passed!${NC}" || echo -e "${RED}Some tests failed.${NC}"
