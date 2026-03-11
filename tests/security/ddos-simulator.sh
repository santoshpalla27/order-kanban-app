#!/usr/bin/env bash
# DDoS & Hacking Simulator Tests
# Tests: Slowloris, oversized payloads, malformed JSON, URL traversal
# Usage: ./ddos-simulator.sh [BASE_URL]

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

# We don't need authentication for most of these as they attack the parser/router itself

# ─── 1. Malformed JSON Body (Parser Crash Test) ──────────────────────────────
section "Malformed JSON Body (Parser Crash)"

# Sending half a JSON array to see if the server panics (500) or gracefully rejects (400)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com", "password": "pass')

if [ "$STATUS" = "400" ]; then
  pass "Server gracefully rejects malformed JSON (HTTP 400)"
elif [ "$STATUS" = "500" ]; then
  fail "Server panicked on malformed JSON (HTTP 500)!"
else
  fail "Unexpected response for malformed JSON (Got $STATUS, expected 400)"
fi

# ─── 2. Oversized Header/URL (Buffer Overflow Test) ──────────────────────────
section "Oversized URL & Headers"

# Construct a very long URL (8KB)
LONG_URL="${BASE}/auth/login?q=$(python3 -c "print('A' * 8000)")"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$LONG_URL")

# Usually servers reject URLs > 4KB-8KB with 414 URI Too Long
if [ "$STATUS" = "414" ] || [ "$STATUS" = "431" ] || [ "$STATUS" = "400" ] || [ "$STATUS" = "404" ]; then
  pass "Server handles massive URLs safely without crashing (HTTP $STATUS)"
else
  fail "Server accepted a massive URL or crashed (Got $STATUS)"
fi

# ─── 3. Directory Traversal / Path Confusion ─────────────────────────────────
section "Path Confusion / Directory Traversal"

# Try to trick the router into serving /etc/passwd or similar
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/../../../etc/passwd")

if [ "$STATUS" = "404" ] || [ "$STATUS" = "400" ]; then
  pass "Server router is immune to basic path traversal (HTTP $STATUS)"
else
  fail "Server might be vulnerable to path traversal (Got $STATUS)"
fi

# ─── 4. Null Byte Injection (%00) ─────────────────────────────────────────────
section "Null Byte Injection"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/auth/login%00")

if [ "$STATUS" = "404" ] || [ "$STATUS" = "400" ]; then
  pass "Server safely rejects Null Byte strings (HTTP $STATUS)"
else
  fail "Server accepted Null Byte string (Got $STATUS)"
fi


# ─── 5. Slowloris (Slow Body Transmission) ────────────────────────────────────
section "Slowloris (Slow Body Attack)"

# We simulate a Slowloris attack by trickling 1 byte per second.
# A resistant server will kill the connection (timeout) within 5-15s.
# We use Python to open a raw socket and trickle the payload.

python3 -c "
import socket, time, sys
from urllib.parse import urlparse

url = sys.argv[1]
parsed = urlparse(url)
host = parsed.hostname
port = parsed.port or (443 if parsed.scheme == 'https' else 80)

try:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(15) # We wait max 15s to see if server kills it
    s.connect((host, port))
    
    # Send headers
    req = f'POST {parsed.path} HTTP/1.1\r\nHost: {host}\r\nContent-Length: 500\r\n\r\n'
    s.sendall(req.encode())
    
    # Trickle body
    for i in range(10):
        s.sendall(b'A')
        time.sleep(1)
        
    print('FAIL')
except (socket.timeout, socket.error, ConnectionResetError, BrokenPipeError):
    # If the socket dies/times out, the server successfully dropped the slow connection
    print('PASS')
finally:
    s.close()
" "$BASE/auth/login" > .slowloris_result || true

RES=$(cat .slowloris_result 2>/dev/null || echo "FAIL")
rm -f .slowloris_result

if [ "$RES" = "PASS" ]; then
    pass "Server automatically cuts off slowloris connection drops (Read/Write Timeouts enforced)"
else
    fail "Server kept the slow connection alive for >10s (Vulnerable to Slowloris connection exhaustion)"
fi

# ─── 6. HTTP Method Tampering ─────────────────────────────────────────────────
section "Method Tampering"

# Send a bizarre HTTP method like "HACK"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X HACK "$BASE/products")

if [ "$STATUS" = "405" ] || [ "$STATUS" = "400" ] || [ "$STATUS" = "404" ]; then
  pass "Server rejects invalid HTTP methods (HTTP $STATUS)"
else
  fail "Server accepted invalid HTTP method (Got $STATUS)"
fi


# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
[ "$FAIL" -eq 0 ] && echo -e "${GREEN}All Anti-Hacking Tests passed!${NC}" || echo -e "${RED}Some tests failed.${NC}"
