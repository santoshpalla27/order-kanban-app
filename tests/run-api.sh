#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# API Tests — Newman / Postman
#
# Usage:
#   ./run-api.sh              # run all API tests
#   ./run-api.sh --no-html    # skip HTML reporter (faster on slow machines)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

banner()  { echo -e "\n${BLUE}${BOLD}══ $1 ══${NC}"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
failure() { echo -e "${RED}✗${NC} $1"; }
info()    { echo -e "${YELLOW}→${NC} $1"; }

# ── Env file ──────────────────────────────────────────────────────────────────
if   [ -f ".env.test" ]; then ENV_FILE=".env.test"
elif [ -f ".env"      ]; then ENV_FILE=".env"
else echo -e "${RED}ERROR: No env file found (.env.test or .env)${NC}"; exit 1; fi
info "Env: $ENV_FILE"
# shellcheck disable=SC1090
source "$ENV_FILE"

# ── Health check ──────────────────────────────────────────────────────────────
HOST_CHECK="${HOST_API_URL:-http://localhost/api}"
info "Checking backend at $HOST_CHECK/health ..."
if ! curl -sf --max-time 5 "$HOST_CHECK/health" > /dev/null 2>&1; then
  echo -e "${RED}ERROR: Backend not reachable at $HOST_CHECK${NC}"
  exit 1
fi
success "Backend is healthy"

# ── Docker network ────────────────────────────────────────────────────────────
DOCKER_NETWORK=$(docker network ls --format '{{.Name}}' | grep 'kanban-net' | head -1)
if [ -z "$DOCKER_NETWORK" ]; then
  echo -e "${RED}ERROR: No Docker network matching 'kanban-net' found${NC}"
  docker network ls --format '  {{.Name}}'
  exit 1
fi
export DOCKER_NETWORK
success "Network: $DOCKER_NETWORK"

# ── Results dir ───────────────────────────────────────────────────────────────
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
RESULTS_DIR="$SCRIPT_DIR/results/$TIMESTAMP"
mkdir -p "$RESULTS_DIR"
ln -sfn "$RESULTS_DIR" "$SCRIPT_DIR/results/latest"

banner "API Tests (Newman) — $TIMESTAMP"
info "Results → $RESULTS_DIR"

# ── Wait for backend ──────────────────────────────────────────────────────────
docker compose --env-file "$ENV_FILE" -f docker-compose.yml run --rm wait-for-backend 2>&1

# ── Run Newman ────────────────────────────────────────────────────────────────
START=$(date +%s)
docker compose \
  --env-file "$ENV_FILE" \
  -f docker-compose.yml \
  run --rm \
  -v "$RESULTS_DIR:/results" \
  newman 2>&1 | tee "$RESULTS_DIR/newman.log"

CODE="${PIPESTATUS[0]}"
DURATION="$(($(date +%s) - START))s"

# ── Summary ───────────────────────────────────────────────────────────────────
banner "Results"

DETAILS=$(python3 -c "
import json
d = json.load(open('$RESULTS_DIR/api-results.json'))
a = d.get('run',{}).get('stats',{}).get('assertions',{})
total  = a.get('total',  0)
failed = a.get('failed', 0)
passed = total - failed
req    = d.get('run',{}).get('stats',{}).get('requests',{}).get('total', 0)
avg_ms = int(d.get('run',{}).get('timings',{}).get('responseAverage', 0))
print(f'{passed}/{total} assertions  •  {req} requests  •  avg {avg_ms}ms')
" 2>/dev/null || echo "—")

W1=20; W2=8; W3=42; W4=10
hline() { printf '─%.0s' $(seq 1 $((W1+W2+W3+W4+7))); echo; }
dline() { printf '═%.0s' $(seq 1 $((W1+W2+W3+W4+7))); echo; }

echo ""
dline
printf " ${BOLD}%-${W1}s  %-${W2}s  %-${W3}s  %-${W4}s${NC}\n" "Suite" "Status" "Details" "Duration"
hline

if [ "$CODE" -eq 0 ]; then
  printf " %-${W1}s  " "API (Newman)"
  echo -ne "${GREEN}✅ PASS${NC}"
  printf "  %-${W3}s  %-${W4}s\n" "$DETAILS" "$DURATION"
  hline
  echo -e " ${GREEN}${BOLD}PASSED${NC}"
else
  printf " %-${W1}s  " "API (Newman)"
  echo -ne "${RED}❌ FAIL${NC}"
  printf "  %-${W3}s  %-${W4}s\n" "$DETAILS" "$DURATION"
  hline
  echo -e " ${RED}${BOLD}FAILED — see $RESULTS_DIR/newman.log${NC}"

  # Print failures from JSON
  python3 -c "
import json
d = json.load(open('$RESULTS_DIR/api-results.json'))
fails = d.get('run',{}).get('failures',[])
if fails:
    print()
    for i, f in enumerate(fails, 1):
        src  = f.get('source',{}).get('name','?')
        err  = f.get('error',{})
        name = err.get('name','?')
        msg  = err.get('message','?')
        print(f'  [{i}] {src}')
        print(f'       {name}: {msg}')
" 2>/dev/null || true
fi

dline
echo ""
info "Files: $RESULTS_DIR/"
echo "       api-results.json  — machine-readable"
echo "       api-results.html  — open in browser"
echo ""

exit "$CODE"
