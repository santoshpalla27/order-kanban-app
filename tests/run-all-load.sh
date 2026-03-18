#!/usr/bin/env bash
# =============================================================================
# run-all-load.sh — run every k6 load scenario in sequence and print a
#                   consolidated summary table.
#
# Scenarios (in order):  smoke  →  ratelimit  →  load  →  spike  →  soak
#
# Usage:
#   ./run-all-load.sh                       # all scenarios, default VUs
#   ./run-all-load.sh --peak-vus 60         # override VU ceiling
#   ./run-all-load.sh --skip soak           # skip one scenario (comma-separated)
#   ./run-all-load.sh --only smoke,load     # run only these scenarios
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

banner()  { echo -e "\n${BLUE}${BOLD}══ $1 ══${NC}"; }
info()    { echo -e "${YELLOW}→${NC} $1"; }

# ── Default scenario order ────────────────────────────────────────────────────
ALL_SCENARIOS=(smoke ratelimit load spike soak)

# ── Parse args ────────────────────────────────────────────────────────────────
PEAK_VUS="${K6_PEAK_VUS:-30}"
SKIP=()
ONLY=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --peak-vus)
      PEAK_VUS="$2"; shift ;;
    --skip)
      IFS=',' read -ra SKIP <<< "$2"; shift ;;
    --only)
      IFS=',' read -ra ONLY <<< "$2"; shift ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
  shift
done

# Build the list of scenarios to actually run
RUN_SCENARIOS=()
for s in "${ALL_SCENARIOS[@]}"; do
  # --only filter
  if [[ ${#ONLY[@]} -gt 0 ]]; then
    found=0
    for o in "${ONLY[@]}"; do [[ "$o" == "$s" ]] && found=1; done
    [[ $found -eq 0 ]] && continue
  fi
  # --skip filter
  skip=0
  for sk in "${SKIP[@]}"; do [[ "$sk" == "$s" ]] && skip=1; done
  [[ $skip -eq 1 ]] && continue
  RUN_SCENARIOS+=("$s")
done

if [[ ${#RUN_SCENARIOS[@]} -eq 0 ]]; then
  echo -e "${RED}No scenarios to run.${NC}"; exit 1
fi

# ── Shared results root for this run ─────────────────────────────────────────
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
RUN_DIR="$SCRIPT_DIR/results/all-load-$TIMESTAMP"
mkdir -p "$RUN_DIR"
ln -sfn "$RUN_DIR" "$SCRIPT_DIR/results/latest-all-load"

banner "All Load Tests  |  scenarios: ${RUN_SCENARIOS[*]}  |  peak VUs: $PEAK_VUS"
info "Results → $RUN_DIR"
echo ""

# ── Per-scenario tracking ─────────────────────────────────────────────────────
declare -A RESULT_CODE
declare -A RESULT_DURATION
declare -A RESULT_DETAILS

# ── Run each scenario ─────────────────────────────────────────────────────────
for SCENARIO in "${RUN_SCENARIOS[@]}"; do
  banner "Scenario: $SCENARIO"

  SCENARIO_DIR="$RUN_DIR/$SCENARIO"
  mkdir -p "$SCENARIO_DIR"

  START=$(date +%s)

  # Delegate to the existing run-load.sh; capture exit code without aborting
  set +e
  K6_PEAK_VUS="$PEAK_VUS" \
  bash "$SCRIPT_DIR/run-load.sh" "$SCENARIO" \
    2>&1 | tee "$SCENARIO_DIR/output.log"
  CODE=$?
  set -e

  DURATION="$(($(date +%s) - START))s"
  RESULT_CODE["$SCENARIO"]=$CODE
  RESULT_DURATION["$SCENARIO"]=$DURATION

  # Parse the k6 summary produced by run-load.sh (it writes to results/latest/)
  SUMMARY_FILE="$SCRIPT_DIR/results/latest/k6-summary.json"
  if [[ -f "$SUMMARY_FILE" ]]; then
    # Copy into our run dir
    cp "$SUMMARY_FILE" "$SCENARIO_DIR/k6-summary.json" 2>/dev/null || true
    cp "$SCRIPT_DIR/results/latest/k6-results.json" "$SCENARIO_DIR/k6-results.json" 2>/dev/null || true
    cp "$SCRIPT_DIR/results/latest/k6.log"          "$SCENARIO_DIR/k6.log"          2>/dev/null || true

    DETAILS=$(python3 -c "
import json, sys
try:
    d = json.load(open('$SCENARIO_DIR/k6-summary.json'))
    metrics = d.get('metrics', {})
    total_thr = 0; pass_thr = 0; fail_list = []
    for name, m in metrics.items():
        for thresh, result in (m.get('thresholds') or {}).items():
            total_thr += 1
            if result.get('ok', False): pass_thr += 1
            else: fail_list.append(thresh)
    p95      = metrics.get('http_req_duration',{}).get('values',{}).get('p(95)',0)
    rps      = round(metrics.get('http_reqs',{}).get('values',{}).get('rate',0),1)
    reqs     = int(metrics.get('http_reqs',{}).get('values',{}).get('count',0))
    fail_rt  = metrics.get('http_req_failed',{}).get('values',{}).get('rate',0)
    print(f'{pass_thr}/{total_thr} thresholds | {reqs} reqs | p95={p95:.0f}ms | {rps} req/s | {fail_rt*100:.1f}% err')
except Exception as e:
    print(f'parse error: {e}')
" 2>/dev/null || echo "—")
  else
    DETAILS="no summary"
  fi

  RESULT_DETAILS["$SCENARIO"]="$DETAILS"

  if [[ $CODE -eq 0 ]]; then
    echo -e "\n${GREEN}✓ $SCENARIO PASSED${NC} (${DURATION})"
  else
    echo -e "\n${RED}✗ $SCENARIO FAILED${NC} (${DURATION})"
  fi
done

# ── Consolidated summary table ────────────────────────────────────────────────
W1=12; W2=8; W3=58; W4=10

hline() { printf '─%.0s' $(seq 1 $((W1+W2+W3+W4+9))); echo; }
dline() { printf '═%.0s' $(seq 1 $((W1+W2+W3+W4+9))); echo; }

banner "All Load Tests — Summary"
echo ""
dline
printf "  ${BOLD}%-${W1}s  %-${W2}s  %-${W3}s  %-${W4}s${NC}\n" \
  "Scenario" "Status" "Details" "Duration"
hline

OVERALL=0
for SCENARIO in "${RUN_SCENARIOS[@]}"; do
  CODE=${RESULT_CODE[$SCENARIO]}
  DUR=${RESULT_DURATION[$SCENARIO]}
  DET=${RESULT_DETAILS[$SCENARIO]}

  printf "  %-${W1}s  " "$SCENARIO"
  if [[ $CODE -eq 0 ]]; then
    echo -ne "${GREEN}✅ PASS${NC}  "
  else
    echo -ne "${RED}❌ FAIL${NC}  "
    OVERALL=1
  fi
  printf "%-${W3}s  %-${W4}s\n" "$DET" "$DUR"
done

hline
if [[ $OVERALL -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}ALL PASSED${NC}"
else
  echo -e "  ${RED}${BOLD}SOME SCENARIOS FAILED — check logs above${NC}"
fi
dline

echo ""
info "Full results: $RUN_DIR/"
echo "             results/latest-all-load/ (symlink)"
echo ""

exit $OVERALL
