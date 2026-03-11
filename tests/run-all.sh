#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Kanban App — Full Test Runner
# Runs all four test layers in Docker and exports results to tests/results/
#
# Usage:
#   ./run-all.sh                   # run all: api + e2e + k6(smoke) + security
#   ./run-all.sh --api             # API tests only
#   ./run-all.sh --e2e             # E2E tests only
#   ./run-all.sh --load smoke      # k6 smoke only
#   ./run-all.sh --load load       # k6 load test (30-50 VUs)
#   ./run-all.sh --security        # security scripts only
#   ./run-all.sh --skip-e2e        # all except E2E (faster CI run)
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
RUN_API=true; RUN_E2E=true; RUN_LOAD=true; RUN_SECURITY=true
K6_SCENARIO="${K6_SCENARIO:-smoke}"
PEAK_VUS="${K6_PEAK_VUS:-30}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api)       RUN_API=true;  RUN_E2E=false; RUN_LOAD=false; RUN_SECURITY=false ;;
    --e2e)       RUN_API=false; RUN_E2E=true;  RUN_LOAD=false; RUN_SECURITY=false ;;
    --load)      RUN_API=false; RUN_E2E=false; RUN_LOAD=true;  RUN_SECURITY=false
                 K6_SCENARIO="${2:-smoke}"; shift ;;
    --security)  RUN_API=false; RUN_E2E=false; RUN_LOAD=false; RUN_SECURITY=true ;;
    --skip-e2e)  RUN_E2E=false ;;
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

# ── Verify kanban-net Docker network exists ───────────────────────────────────
if ! docker network inspect kanban-net > /dev/null 2>&1; then
  echo -e "\n${RED}ERROR: Docker network 'kanban-net' not found${NC}"
  echo "  The app must be running via docker compose (creates kanban-net)"
  exit 1
fi
success "Docker network kanban-net found"

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
[ "$RUN_E2E"      = true ] && run_service "E2E Tests (Playwright)" "playwright"
[ "$RUN_LOAD"     = true ] && run_service "Load Test (k6 $K6_SCENARIO)" "k6"
[ "$RUN_SECURITY" = true ] && run_service "Security Tests"         "security"

# ── Generate summary report ───────────────────────────────────────────────────
banner "Summary Report"

TOTAL_PASS=0; TOTAL_FAIL=0
REPORT="$RESULTS_DIR/summary.md"

{
  echo "# Test Run Summary"
  echo ""
  echo "**Date:** $TIMESTAMP"
  echo "**API URL:** $HOST_CHECK"
  echo ""
  echo "| Suite | Status | Duration |"
  echo "|-------|--------|----------|"
} > "$REPORT"

for service in newman playwright k6 security; do
  if [[ -v EXIT_CODES[$service] ]]; then
    code="${EXIT_CODES[$service]}"
    dur="${DURATIONS[$service]}"
    if [ "$code" -eq 0 ]; then
      echo "| $service | ✅ PASS | $dur |" >> "$REPORT"
      ((TOTAL_PASS++))
    else
      echo "| $service | ❌ FAIL (exit $code) | $dur |" >> "$REPORT"
      ((TOTAL_FAIL++))
    fi
  fi
done

{
  echo ""
  echo "---"
  echo "**Total: $TOTAL_PASS passed, $TOTAL_FAIL failed**"
  echo ""
  echo "## Output Files"
  echo ""
  echo "| File | Description |"
  echo "|------|-------------|"
  echo "| api-results.html | Newman HTML report |"
  echo "| api-results.json | Newman JSON (CI-parseable) |"
  echo "| e2e-report/ | Playwright HTML report |"
  echo "| e2e-results.json | Playwright JSON |"
  echo "| k6-results.json | k6 metrics (per-request) |"
  echo "| k6-summary.json | k6 thresholds summary |"
  echo "| security-all.log | Combined security output |"
} >> "$REPORT"

cat "$REPORT"

# ── Print file tree ───────────────────────────────────────────────────────────
echo ""
info "Result files in $RESULTS_DIR:"
ls -lh "$RESULTS_DIR" 2>/dev/null || true

# ── Final exit code ───────────────────────────────────────────────────────────
echo ""
if [ "$TOTAL_FAIL" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}All test suites passed!${NC}"
  exit 0
else
  echo -e "${RED}${BOLD}$TOTAL_FAIL suite(s) failed. Check $RESULTS_DIR for details.${NC}"
  exit 1
fi
