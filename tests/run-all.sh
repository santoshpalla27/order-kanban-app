#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Kanban App — Full Test Runner
# Runs all four test layers in Docker and exports results to tests/results/
#
# Usage:
#   ./run-all.sh                   # run all: api + k6(smoke) + security
#   ./run-all.sh --api             # API tests only
#   ./run-all.sh --load smoke      # k6 smoke only
#   ./run-all.sh --load load       # k6 load test (30-50 VUs)
#   ./run-all.sh --security        # security scripts only
#   ./run-all.sh --peak-vus 50     # override VU count for load test
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

banner()  { echo -e "\n${BLUE}${BOLD}══ $1 ══${NC}"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
failure() { echo -e "${RED}✗${NC} $1"; }
info()    { echo -e "${YELLOW}→${NC} $1"; }

# ── Parse arguments ───────────────────────────────────────────────────────────
RUN_API=true; RUN_LOAD=true; RUN_SECURITY=true
K6_SCENARIO="${K6_SCENARIO:-smoke}"
PEAK_VUS="${K6_PEAK_VUS:-30}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api)       RUN_API=true;  RUN_LOAD=false; RUN_SECURITY=false ;;
    --load)      RUN_API=false; RUN_LOAD=true;  RUN_SECURITY=false
                 K6_SCENARIO="${2:-smoke}"; shift ;;
    --security)  RUN_API=false; RUN_LOAD=false; RUN_SECURITY=true ;;
    --peak-vus)  PEAK_VUS="$2"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

export K6_SCENARIO PEAK_VUS K6_PEAK_VUS="$PEAK_VUS"

# ── Results directory ─────────────────────────────────────────────────────────
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
RESULTS_DIR="$SCRIPT_DIR/results/$TIMESTAMP"
mkdir -p "$RESULTS_DIR"
export RESULTS_DIR

# Symlink latest → this run
ln -sfn "$RESULTS_DIR" "$SCRIPT_DIR/results/latest"

banner "Kanban App Test Suite — $TIMESTAMP"
info "Results: $RESULTS_DIR"

# ── Load env file (.env.test or .env, whichever exists) ──────────────────────
if [ -f ".env.test" ]; then
  ENV_FILE=".env.test"
elif [ -f ".env" ]; then
  ENV_FILE=".env"
else
  echo -e "${RED}ERROR: No env file found. Expected .env.test or .env in tests/${NC}"
  exit 1
fi
info "Using env file: $ENV_FILE"
# shellcheck disable=SC1090
source "$ENV_FILE"

# HOST_API_URL is for host-level health check (through Traefik/load-balancer).
# Falls back to localhost/api (Traefik) then localhost:8080/api (direct).
HOST_CHECK="${HOST_API_URL:-http://localhost/api}"

info "Checking app health at $HOST_CHECK/health ..."
if ! curl -sf --max-time 5 "$HOST_CHECK/health" > /dev/null 2>&1; then
  echo -e "\n${RED}ERROR: Backend is not reachable at $HOST_CHECK${NC}"
  echo ""
  echo "  Possible fixes:"
  echo "  1. Start the app:          docker compose up -d"
  echo "  2. Check HOST_API_URL in $ENV_FILE"
  echo "     — Use http://localhost/api   if behind Traefik (port 80)"
  echo "     — Use http://localhost:8080/api  if backend port is mapped directly"
  exit 1
fi
success "Backend is healthy"

# ── Detect Docker network (handles prefix from compose project name) ──────────
DOCKER_NETWORK=$(docker network ls --format '{{.Name}}' | grep 'kanban-net' | head -1)
if [ -z "$DOCKER_NETWORK" ]; then
  echo -e "\n${RED}ERROR: No Docker network matching 'kanban-net' found${NC}"
  echo "  The app must be running via docker compose."
  echo "  Available networks:"
  docker network ls --format '  {{.Name}}'
  exit 1
fi
export DOCKER_NETWORK
success "Docker network found: $DOCKER_NETWORK"

# ── Track results ─────────────────────────────────────────────────────────────
declare -A EXIT_CODES
declare -A DURATIONS

run_service() {
  local name="$1"; local service="$2"
  banner "$name"
  local start; start="$(date +%s)"

  docker compose \
    --env-file "$ENV_FILE" \
    -f docker-compose.yml \
    run --rm \
    -v "$RESULTS_DIR:/results" \
    "$service" 2>&1 | tee "$RESULTS_DIR/${service}.log"

  EXIT_CODES["$service"]="${PIPESTATUS[0]}"
  local end; end="$(date +%s)"
  DURATIONS["$service"]="$((end - start))s"

  if [ "${EXIT_CODES[$service]}" -eq 0 ]; then
    success "$name passed (${DURATIONS[$service]})"
  else
    failure "$name failed (${DURATIONS[$service]})"
  fi
}

# ── Run selected test suites ──────────────────────────────────────────────────

# Always start wait-for-backend first
docker compose --env-file "$ENV_FILE" -f docker-compose.yml run --rm wait-for-backend 2>&1

[ "$RUN_API"      = true ] && run_service "API Tests (Newman)"     "newman"
[ "$RUN_LOAD"     = true ] && run_service "Load Test (k6 $K6_SCENARIO)" "k6"
[ "$RUN_SECURITY" = true ] && run_service "Security Tests"         "security"

# ── Parse result files for detailed stats ─────────────────────────────────────

# Helper: run python3 snippet, return stdout or fallback
py3() { python3 -c "$1" 2>/dev/null || echo "${2:--}"; }

# Newman: assertions passed/failed
parse_newman() {
  py3 "
import json, sys
d = json.load(open('$RESULTS_DIR/api-results.json'))
a = d.get('run',{}).get('stats',{}).get('assertions',{})
total  = a.get('total',  0)
failed = a.get('failed', 0)
passed = total - failed
req    = d.get('run',{}).get('stats',{}).get('requests',{}).get('total', 0)
print(f'{passed}/{total} assertions  ({req} requests)')
" "?"
}


# k6: thresholds passed/failed
parse_k6() {
  py3 "
import json, sys
d = json.load(open('$RESULTS_DIR/k6-summary.json'))
metrics = d.get('metrics', {})
total_thr = 0; pass_thr = 0
for m in metrics.values():
    for thresh, result in (m.get('thresholds') or {}).items():
        total_thr += 1
        if result.get('ok', False):
            pass_thr += 1
failed_thr = total_thr - pass_thr
p95 = metrics.get('http_req_duration',{}).get('values',{}).get('p(95)',0)
rps = round(metrics.get('http_reqs',{}).get('values',{}).get('rate',0),1)
print(f'{pass_thr}/{total_thr} thresholds  (p95={p95:.0f}ms  {rps} req/s)')
" "?"
}

# Security: count PASS / FAIL lines across all logs
parse_security() {
  local log="$RESULTS_DIR/security-all.log"
  if [ ! -f "$log" ]; then echo "?"; return; fi
  local p f
  p=$(grep -c '✓ PASS' "$log" 2>/dev/null || echo 0)
  f=$(grep -c '✗ FAIL' "$log" 2>/dev/null || echo 0)
  local total=$((p + f))
  echo "${p}/${total} checks"
}

# ── Build summary table ────────────────────────────────────────────────────────
banner "Summary Report"

TOTAL_PASS=0; TOTAL_FAIL=0
REPORT="$RESULTS_DIR/summary.md"

# Column widths
W1=22; W2=8; W3=34; W4=10

pad()  { printf "%-${1}s" "$2"; }
padr() { printf "%${1}s"  "$2"; }

hline() { printf '─%.0s' $(seq 1 $((W1+W2+W3+W4+7))); echo; }
dline() { printf '═%.0s' $(seq 1 $((W1+W2+W3+W4+7))); echo; }

echo ""
dline
echo -e "${BOLD} TEST RUN SUMMARY  —  $TIMESTAMP${NC}"
echo -e " API: $HOST_CHECK"
dline
printf " ${BOLD}%-${W1}s  %-${W2}s  %-${W3}s  %-${W4}s${NC}\n" "Suite" "Status" "Details" "Duration"
hline

declare -A DETAILS
DETAILS["newman"]="$(parse_newman)"
DETAILS["k6"]="$(parse_k6)"
DETAILS["security"]="$(parse_security)"

SUITE_NAMES=("newman:API (Newman)" "k6:Load (k6 $K6_SCENARIO)" "security:Security")

for entry in "${SUITE_NAMES[@]}"; do
  svc="${entry%%:*}"; label="${entry#*:}"
  [[ -v EXIT_CODES[$svc] ]] || continue

  code="${EXIT_CODES[$svc]}"
  dur="${DURATIONS[$svc]}"
  det="${DETAILS[$svc]}"

  if [ "$code" -eq 0 ]; then
    status="${GREEN}✅ PASS${NC}"
    ((TOTAL_PASS++))
  else
    status="${RED}❌ FAIL${NC}"
    ((TOTAL_FAIL++))
  fi

  printf " %-${W1}s  " "$label"
  echo -ne "$status"
  printf "  %-${W3}s  %-${W4}s\n" "$det" "$dur"
done

hline

if [ "$TOTAL_FAIL" -eq 0 ]; then
  echo -e " ${GREEN}${BOLD}RESULT: ALL $TOTAL_PASS SUITE(S) PASSED${NC}"
else
  echo -e " ${RED}${BOLD}RESULT: $TOTAL_FAIL FAILED  /  $TOTAL_PASS PASSED${NC}"
fi
dline
echo ""

# ── Write markdown summary ────────────────────────────────────────────────────
{
  echo "# Test Run Summary"
  echo ""
  echo "**Date:** $TIMESTAMP  |  **API:** $HOST_CHECK"
  echo ""
  echo "| Suite | Status | Details | Duration |"
  echo "|-------|--------|---------|----------|"

  for entry in "${SUITE_NAMES[@]}"; do
    svc="${entry%%:*}"; label="${entry#*:}"
    [[ -v EXIT_CODES[$svc] ]] || continue
    code="${EXIT_CODES[$svc]}"
    icon=$([ "$code" -eq 0 ] && echo "✅ PASS" || echo "❌ FAIL")
    echo "| $label | $icon | ${DETAILS[$svc]} | ${DURATIONS[$svc]} |"
  done

  echo ""
  echo "---"
  echo "**Total: $TOTAL_PASS passed, $TOTAL_FAIL failed**"
  echo ""
  echo "## Result Files"
  echo ""
  echo "| File | Description |"
  echo "|------|-------------|"
  echo "| \`api-results.html\` | Newman HTML report (open in browser) |"
  echo "| \`api-results.json\` | Newman JSON (CI-parseable) |"
  echo "| \`k6-results.json\` | k6 per-request metrics |"
  echo "| \`k6-summary.json\` | k6 threshold summary |"
  echo "| \`security-all.log\` | Combined security output |"
} > "$REPORT"

# ── Print file tree ───────────────────────────────────────────────────────────
info "Results saved to: $RESULTS_DIR"
ls -lh "$RESULTS_DIR" 2>/dev/null || true
echo ""

# ── Final exit code ───────────────────────────────────────────────────────────
if [ "$TOTAL_FAIL" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All test suites passed!${NC}"
  exit 0
else
  echo -e "${RED}${BOLD}$TOTAL_FAIL suite(s) failed. Check $RESULTS_DIR for details.${NC}"
  exit 1
fi
