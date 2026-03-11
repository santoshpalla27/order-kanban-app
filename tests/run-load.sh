#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Load Tests — k6
#
# Usage:
#   ./run-load.sh                    # smoke test (1 VU, 2 min)
#   ./run-load.sh smoke              # same as above
#   ./run-load.sh load               # load test  (30-50 VUs, 5 min)
#   ./run-load.sh spike              # spike test (0→100→0 VUs)
#   ./run-load.sh soak               # soak test  (30 VUs, 30 min)
#   ./run-load.sh ratelimit          # rate-limit verification
#   ./run-load.sh load --peak-vus 80 # override VU ceiling
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

# ── Args ──────────────────────────────────────────────────────────────────────
SCENARIO="${1:-smoke}"
PEAK_VUS="${K6_PEAK_VUS:-30}"
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --peak-vus) PEAK_VUS="$2"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

VALID_SCENARIOS="smoke load spike soak ratelimit"
if ! echo "$VALID_SCENARIOS" | grep -qw "$SCENARIO"; then
  echo -e "${RED}ERROR: Unknown scenario '$SCENARIO'${NC}"
  echo "  Valid: $VALID_SCENARIOS"
  exit 1
fi

export K6_SCENARIO="$SCENARIO" K6_PEAK_VUS="$PEAK_VUS"

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

banner "Load Test — $SCENARIO  (peak VUs: $PEAK_VUS) — $TIMESTAMP"
info "Results → $RESULTS_DIR"

# ── Wait for backend ──────────────────────────────────────────────────────────
docker compose --env-file "$ENV_FILE" -f docker-compose.yml run --rm wait-for-backend 2>&1

# ── Run k6 ────────────────────────────────────────────────────────────────────
START=$(date +%s)
docker compose \
  --env-file "$ENV_FILE" \
  -f docker-compose.yml \
  run --rm \
  -v "$RESULTS_DIR:/results" \
  k6 2>&1 | tee "$RESULTS_DIR/k6.log"

CODE="${PIPESTATUS[0]}"
DURATION="$(($(date +%s) - START))s"

# ── Summary ───────────────────────────────────────────────────────────────────
banner "Results"

DETAILS=$(python3 -c "
import json
d = json.load(open('$RESULTS_DIR/k6-summary.json'))
metrics = d.get('metrics', {})
total_thr = 0; pass_thr = 0; fail_list = []
for name, m in metrics.items():
    for thresh, result in (m.get('thresholds') or {}).items():
        total_thr += 1
        if result.get('ok', False): pass_thr += 1
        else: fail_list.append(f'{thresh} ({name})')
p95  = metrics.get('http_req_duration',{}).get('values',{}).get('p(95)',0)
rps  = round(metrics.get('http_reqs',{}).get('values',{}).get('rate',0),1)
reqs = int(metrics.get('http_reqs',{}).get('values',{}).get('count',0))
fail_rate = metrics.get('http_req_failed',{}).get('values',{}).get('rate',0)
print(f'{pass_thr}/{total_thr} thresholds  •  {reqs} reqs  •  p95={p95:.0f}ms  •  {rps} req/s  •  {fail_rate*100:.1f}% err')
if fail_list:
    for f in fail_list: print(f'  ✗ {f}')
" 2>/dev/null || echo "—  (no summary file)")

W1=22; W2=8; W3=50; W4=10
hline() { printf '─%.0s' $(seq 1 $((W1+W2+W3+W4+7))); echo; }
dline() { printf '═%.0s' $(seq 1 $((W1+W2+W3+W4+7))); echo; }

echo ""
dline
printf " ${BOLD}%-${W1}s  %-${W2}s  %-${W3}s  %-${W4}s${NC}\n" "Suite" "Status" "Details" "Duration"
hline

LABEL="Load ($SCENARIO)"
if [ "$CODE" -eq 0 ]; then
  printf " %-${W1}s  " "$LABEL"
  echo -ne "${GREEN}✅ PASS${NC}"
  printf "  %-${W3}s  %-${W4}s\n" "$(echo "$DETAILS" | head -1)" "$DURATION"
  # print threshold breakdown if multi-line
  echo "$DETAILS" | tail -n +2 | while read -r line; do
    printf "   %-$((W1+W2+W3+W4+2))s\n" "$line"
  done
  hline
  echo -e " ${GREEN}${BOLD}PASSED${NC}"
else
  printf " %-${W1}s  " "$LABEL"
  echo -ne "${RED}❌ FAIL${NC}"
  printf "  %-${W3}s  %-${W4}s\n" "$(echo "$DETAILS" | head -1)" "$DURATION"
  echo "$DETAILS" | tail -n +2 | while read -r line; do
    printf "   ${RED}%-$((W1+W2+W3+W4+2))s${NC}\n" "$line"
  done
  hline
  echo -e " ${RED}${BOLD}FAILED — thresholds exceeded${NC}"
fi

dline
echo ""
info "Files: $RESULTS_DIR/"
echo "       k6-summary.json  — thresholds"
echo "       k6-results.json  — per-request metrics (import into Grafana)"
echo ""

exit "$CODE"
