#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Security Tests — auth hardening, RBAC boundaries, injection, advanced, DDoS
#
# Usage:
#   ./run-security.sh              # run all 5 security scripts
#   ./run-security.sh auth         # auth hardening only
#   ./run-security.sh rbac         # RBAC boundary only
#   ./run-security.sh injection    # injection tests only
#   ./run-security.sh advanced     # advanced security only
#   ./run-security.sh ddos         # DDoS / protocol hacks only
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
SUITE="${1:-all}"

case "$SUITE" in
  all|auth|rbac|injection|advanced|ddos) ;;
  *) echo -e "${RED}ERROR: Unknown suite '$SUITE'${NC}"
     echo "  Valid: all  auth  rbac  injection  advanced  ddos"
     exit 1 ;;
esac

# Build the sh command to run inside the container
build_security_cmd() {
  local run_auth="false" run_rbac="false" run_injection="false"
  local run_advanced="false" run_ddos="false"

  case "$SUITE" in
    all)       run_auth=true; run_rbac=true; run_injection=true; run_advanced=true; run_ddos=true ;;
    auth)      run_auth=true ;;
    rbac)      run_rbac=true ;;
    injection) run_injection=true ;;
    advanced)  run_advanced=true ;;
    ddos)      run_ddos=true ;;
  esac

  # Build the command pieces
  local cmd="apk add --no-cache curl bash > /dev/null 2>&1"

  if [ "$run_auth" = true ]; then
    cmd="$cmd && echo '=== Auth Security ===' | tee /results/security-auth.log && bash /security/auth-security.sh \$API_URL 2>&1 | tee -a /results/security-auth.log"
  fi
  if [ "$run_rbac" = true ]; then
    cmd="$cmd && echo '=== RBAC Boundary ===' | tee /results/security-rbac.log && bash /security/rbac-boundary.sh \$API_URL 2>&1 | tee -a /results/security-rbac.log"
  fi
  if [ "$run_injection" = true ]; then
    cmd="$cmd && echo '=== Injection Tests ===' | tee /results/security-injection.log && bash /security/injection-tests.sh \$API_URL 2>&1 | tee -a /results/security-injection.log"
  fi
  if [ "$run_advanced" = true ]; then
    cmd="$cmd && echo '=== Advanced Security ===' | tee /results/security-advanced.log && bash /security/advanced-security.sh \$API_URL 2>&1 | tee -a /results/security-advanced.log"
  fi
  if [ "$run_ddos" = true ]; then
    cmd="$cmd && echo '=== DDoS / Protocol Hacks ===' | tee /results/security-ddos.log && bash /security/ddos-simulator.sh \$API_URL 2>&1 | tee -a /results/security-ddos.log"
  fi

  # Merge all produced logs into one
  cmd="$cmd && cat /results/security-*.log > /results/security-all.log 2>/dev/null || true"
  echo "$cmd"
}

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

banner "Security Tests — $SUITE — $TIMESTAMP"
info "Results → $RESULTS_DIR"

# ── Wait for backend ──────────────────────────────────────────────────────────
docker compose --env-file "$ENV_FILE" -f docker-compose.yml run --rm wait-for-backend 2>&1

# ── Run security container with dynamic command ───────────────────────────────
SECURITY_CMD="$(build_security_cmd)"

START=$(date +%s)
docker compose \
  --env-file "$ENV_FILE" \
  -f docker-compose.yml \
  run --rm \
  -v "$RESULTS_DIR:/results" \
  --entrypoint "" \
  security \
  sh -c "$SECURITY_CMD" 2>&1 | tee "$RESULTS_DIR/security.log"

CODE="${PIPESTATUS[0]}"
DURATION="$(($(date +%s) - START))s"

# ── Summary ───────────────────────────────────────────────────────────────────
banner "Results"

# Count PASS/FAIL lines in combined log
ALL_LOG="$RESULTS_DIR/security-all.log"
if [ ! -f "$ALL_LOG" ] && [ -f "$RESULTS_DIR/security.log" ]; then
  ALL_LOG="$RESULTS_DIR/security.log"
fi

PASS_COUNT=0; FAIL_COUNT=0
if [ -f "$ALL_LOG" ]; then
  PASS_COUNT=$(grep -c '✓ PASS' "$ALL_LOG" 2>/dev/null || echo 0)
  FAIL_COUNT=$(grep -c '✗ FAIL' "$ALL_LOG" 2>/dev/null || echo 0)
fi
TOTAL_CHECKS=$((PASS_COUNT + FAIL_COUNT))

W1=22; W2=8; W3=42; W4=10
hline() { printf '─%.0s' $(seq 1 $((W1+W2+W3+W4+7))); echo; }
dline() { printf '═%.0s' $(seq 1 $((W1+W2+W3+W4+7))); echo; }

echo ""
dline
printf " ${BOLD}%-${W1}s  %-${W2}s  %-${W3}s  %-${W4}s${NC}\n" "Suite" "Status" "Details" "Duration"
hline

DETAILS="${PASS_COUNT}/${TOTAL_CHECKS} checks passed"
[ "$FAIL_COUNT" -gt 0 ] && DETAILS="$DETAILS  •  ${FAIL_COUNT} FAILED"

if [ "$FAIL_COUNT" -eq 0 ]; then
  printf " %-${W1}s  " "Security ($SUITE)"
  echo -ne "${GREEN}✅ PASS${NC}"
  printf "  %-${W3}s  %-${W4}s\n" "$DETAILS" "$DURATION"
  hline
  echo -e " ${GREEN}${BOLD}PASSED${NC}"
else
  printf " %-${W1}s  " "Security ($SUITE)"
  echo -ne "${RED}❌ FAIL${NC}"
  printf "  %-${W3}s  %-${W4}s\n" "$DETAILS" "$DURATION"
  hline
  echo -e " ${RED}${BOLD}FAILED — $FAIL_COUNT check(s) did not pass${NC}"
  echo ""
  echo -e "${BOLD} Failed checks:${NC}"
  grep '✗ FAIL' "$ALL_LOG" 2>/dev/null | while read -r line; do
    echo "   $line"
  done
fi

dline
echo ""
info "Files: $RESULTS_DIR/"
[ -f "$RESULTS_DIR/security-auth.log"      ] && echo "       security-auth.log"
[ -f "$RESULTS_DIR/security-rbac.log"      ] && echo "       security-rbac.log"
[ -f "$RESULTS_DIR/security-injection.log" ] && echo "       security-injection.log"
[ -f "$RESULTS_DIR/security-advanced.log"  ] && echo "       security-advanced.log"
[ -f "$RESULTS_DIR/security-ddos.log"      ] && echo "       security-ddos.log"
[ -f "$ALL_LOG"                            ] && echo "       security-all.log  (combined)"
echo ""

exit "$CODE"
