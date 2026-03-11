#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# E2E Tests — Playwright against the deployed app
#
# Usage:
#   ./run-e2e.sh                     # run all specs
#   ./run-e2e.sh --spec auth         # run one spec file
#   ./run-e2e.sh --headed            # headed mode (needs display)
#   ./run-e2e.sh --debug             # debug mode
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
SPEC=""
EXTRA_ARGS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --spec)    SPEC="specs/$2.spec.ts"; shift ;;
    --headed)  EXTRA_ARGS="$EXTRA_ARGS --headed" ;;
    --debug)   EXTRA_ARGS="$EXTRA_ARGS --debug" ;;
    *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
  esac
  shift
done

# ── Env file ──────────────────────────────────────────────────────────────────
if   [ -f ".env.test" ]; then ENV_FILE=".env.test"
elif [ -f ".env"      ]; then ENV_FILE=".env"
else echo -e "${RED}ERROR: No env file found (.env.test or .env)${NC}"; exit 1; fi
info "Env: $ENV_FILE"
# shellcheck disable=SC1090
source "$ENV_FILE"

E2E_BASE="${E2E_BASE_URL:-https://app.santoshdevops.cloud}"
E2E_API="${E2E_API_URL:-https://app.santoshdevops.cloud/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@gmail.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

# ── Health check against deployed app ─────────────────────────────────────────
info "Checking deployed app at $E2E_API/health ..."
if ! curl -sf --max-time 10 "$E2E_API/health" > /dev/null 2>&1; then
  echo -e "${RED}ERROR: App not reachable at $E2E_BASE${NC}"
  exit 1
fi
success "App is reachable"

# ── Results dir ───────────────────────────────────────────────────────────────
TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
RESULTS_DIR="$SCRIPT_DIR/results/$TIMESTAMP"
mkdir -p "$RESULTS_DIR"
ln -sfn "$RESULTS_DIR" "$SCRIPT_DIR/results/latest"

banner "E2E Tests — ${SPEC:-all specs} — $TIMESTAMP"
info "Target: $E2E_BASE"
info "Results → $RESULTS_DIR"

# ── Run playwright container ───────────────────────────────────────────────────
SPEC_ARG=""
[ -n "$SPEC" ] && SPEC_ARG="$SPEC"

START=$(date +%s)
docker compose \
  --env-file "$ENV_FILE" \
  -f docker-compose.yml \
  run --rm \
  -e E2E_BASE_URL="$E2E_BASE" \
  -e E2E_API_URL="$E2E_API" \
  -e ADMIN_EMAIL="$ADMIN_EMAIL" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -v "$RESULTS_DIR:/results" \
  playwright \
  bash -c "
    npm ci --prefer-offline 2>/dev/null || npm install &&
    npx playwright install chromium --with-deps 2>/dev/null | tail -3 &&
    npx playwright test $SPEC_ARG $EXTRA_ARGS 2>&1 | tee /results/e2e-output.log;
    EXIT=\$?;
    cp test-results.json /results/e2e-results.json 2>/dev/null || true;
    cp -r playwright-report /results/e2e-report 2>/dev/null || true;
    node /app/summarize.js /results/e2e-results.json 2>/dev/null || true;
    exit \$EXIT
  " 2>&1

CODE="${PIPESTATUS[0]}"
DURATION="$(($(date +%s) - START))s"

# ── Summary ───────────────────────────────────────────────────────────────────
banner "Results"

PASS_COUNT=0; FAIL_COUNT=0; TOTAL=0
if [ -f "$RESULTS_DIR/e2e-results.json" ]; then
  PASS_COUNT=$(python3 -c "
import json, sys
d = json.load(open('$RESULTS_DIR/e2e-results.json'))
suites = d.get('suites', [])
def count(s):
    p = f = 0
    for spec in s.get('specs', []):
        for r in spec.get('tests', []):
            ok = all(x.get('status') in ('passed','skipped') for x in r.get('results',[]))
            if ok: p += 1
            else: f += 1
    for c in s.get('suites', []):
        cp, cf = count(c)
        p += cp; f += cf
    return p, f
tp = tf = 0
for s in suites:
    p, f = count(s)
    tp += p; tf += f
print(f'{tp} {tf}')
" 2>/dev/null || echo "0 0")
  FAIL_COUNT=$(echo "$PASS_COUNT" | awk '{print $2}')
  PASS_COUNT=$(echo "$PASS_COUNT" | awk '{print $1}')
  TOTAL=$((PASS_COUNT + FAIL_COUNT))
fi

W1=22; W2=8; W3=48; W4=10
hline() { printf '─%.0s' $(seq 1 $((W1+W2+W3+W4+7))); echo; }
dline() { printf '═%.0s' $(seq 1 $((W1+W2+W3+W4+7))); echo; }

DETAILS="${PASS_COUNT}/${TOTAL} tests passed"
[ "$FAIL_COUNT" -gt 0 ] && DETAILS="$DETAILS  •  ${FAIL_COUNT} FAILED"

echo ""
dline
printf " ${BOLD}%-${W1}s  %-${W2}s  %-${W3}s  %-${W4}s${NC}\n" "Suite" "Status" "Details" "Duration"
hline

if [ "$CODE" -eq 0 ] || [ "$FAIL_COUNT" -eq 0 ]; then
  printf " %-${W1}s  " "E2E (${SPEC:-all})"
  echo -ne "${GREEN}✅ PASS${NC}"
  printf "  %-${W3}s  %-${W4}s\n" "$DETAILS" "$DURATION"
  hline
  echo -e " ${GREEN}${BOLD}PASSED${NC}"
else
  printf " %-${W1}s  " "E2E (${SPEC:-all})"
  echo -ne "${RED}❌ FAIL${NC}"
  printf "  %-${W3}s  %-${W4}s\n" "$DETAILS" "$DURATION"
  hline
  echo -e " ${RED}${BOLD}FAILED — $FAIL_COUNT test(s) did not pass${NC}"
fi

dline
echo ""
info "Files: $RESULTS_DIR/"
[ -f "$RESULTS_DIR/e2e-output.log"  ] && echo "       e2e-output.log   (full playwright output)"
[ -d "$RESULTS_DIR/e2e-report"      ] && echo "       e2e-report/      (HTML report)"
[ -f "$RESULTS_DIR/e2e-results.json"] && echo "       e2e-results.json (JSON results)"
echo ""

exit "$CODE"
