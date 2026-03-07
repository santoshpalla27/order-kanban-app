#!/usr/bin/env bash
# =============================================================================
#  KanbanFlow — Parallel Load Simulation
#
#  • Creates 25 users via the admin API (no rate-limit)
#  • Logs each user in sequentially, 7 s apart (stays under 10 req/min)
#  • Connects every user to WebSocket (if websocat is installed)
#  • Runs all 25 user simulations in parallel — everything appears live in the UI
#
#  Usage:
#    ./simulate.sh <BACKEND_URL> <ADMIN_EMAIL> <ADMIN_PASSWORD>
#
#  Example:
#    ./simulate.sh http://localhost:8080 you@example.com yourpassword
#
#  Requirements: bash, curl, python3
#  Optional:     websocat  (brew install websocat)  — keeps a real WS session open
# =============================================================================

set -uo pipefail

# ── Args ──────────────────────────────────────────────────────────────────────
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <BACKEND_URL> <ADMIN_EMAIL> <ADMIN_PASSWORD>"
  echo "  e.g. $0 http://localhost:8080 admin@you.com yourpassword"
  exit 1
fi

BACKEND="$1"
ADMIN_EMAIL="$2"
ADMIN_PASS="$3"
API="$BACKEND/api"

# Rate-limit constants (must match backend)
AUTH_LIMIT=10        # requests per window
AUTH_WINDOW=60       # seconds
LOGIN_GAP=7          # seconds between logins  (10/60 ≈ 0.166/s → 1/7 ≈ 0.143/s, safely below)

NUM_USERS=25
NUM_PRODUCTS=12

# ── Colours ───────────────────────────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'
B='\033[0;34m'; C='\033[0;36m'; W='\033[1;37m'; NC='\033[0m'; BOLD='\033[1m'

# ── Temp workspace (auto-cleaned on exit) ─────────────────────────────────────
WORKDIR=$(mktemp -d /tmp/kanban_sim_XXXXXX)
LOG_DIR="$WORKDIR/logs"
TOKEN_DIR="$WORKDIR/tokens"
mkdir -p "$LOG_DIR" "$TOKEN_DIR"
trap 'rm -rf "$WORKDIR"' EXIT

# ── Dependency check ──────────────────────────────────────────────────────────
for dep in curl python3; do
  command -v "$dep" &>/dev/null || { echo -e "${R}✗ $dep is required but not installed.${NC}"; exit 1; }
done
HAS_WEBSOCAT=false
command -v websocat &>/dev/null && HAS_WEBSOCAT=true

# ── Banner ────────────────────────────────────────────────────────────────────
clear
echo -e "${W}${BOLD}"
echo "  ██╗  ██╗ █████╗ ███╗   ██╗██████╗  █████╗ ███╗   ██╗"
echo "  ██║ ██╔╝██╔══██╗████╗  ██║██╔══██╗██╔══██╗████╗  ██║"
echo "  █████╔╝ ███████║██╔██╗ ██║██████╔╝███████║██╔██╗ ██║"
echo "  ██╔═██╗ ██╔══██║██║╚██╗██║██╔══██╗██╔══██║██║╚██╗██║"
echo "  ██║  ██╗██║  ██║██║ ╚████║██████╔╝██║  ██║██║ ╚████║"
echo "  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝"
echo -e "${NC}"
echo -e "  Backend : ${C}$BACKEND${NC}"
echo -e "  Users   : ${C}$NUM_USERS${NC}  (01-05 manager · 06-25 worker)"
echo -e "  WS      : $($HAS_WEBSOCAT && echo -e "${G}websocat found — real WS sessions${NC}" || echo -e "${Y}websocat not found — HTTP-only (UI still updates via server broadcasts)${NC}")"
echo
echo -e "  ${Y}${BOLD}Open the app in your browser before continuing — you will watch it live.${NC}"
echo

# ── Helpers ───────────────────────────────────────────────────────────────────

ok()   { echo -e "  ${G}✓${NC} $*"; }
warn() { echo -e "  ${Y}⚠${NC}  $*"; }
fail() { echo -e "  ${R}✗${NC} $*"; }
step() { echo -e "\n${B}[Phase $1]${NC} ${W}$2${NC}"; }

# Safe JSON extraction — reads JSON from stdin pipe, keys as arguments
# Usage: echo "$json" | jfield "key"           → top-level key
#        echo "$json" | jfield "role" "name"   → nested key
jfield() {
  python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
    for k in sys.argv[1:]:
        d = d.get(k, "") if isinstance(d, dict) else ""
    print("" if d is None else d)
except Exception:
    pass
' "$@" 2>/dev/null || true
}

jlen() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,(list,dict)) else 0)" 2>/dev/null || echo 0
}

# Find a user's numeric id from the /api/users list by email
find_uid() {
  local email="$1"
  python3 -c '
import sys, json
email = sys.argv[1]
try:
    for u in json.load(sys.stdin):
        if u.get("email") == email:
            print(u["id"]); break
except Exception:
    pass
' "$email" 2>/dev/null || true
}

# curl wrappers — all return empty string on any error (never exit the script)
POST() { curl -sf -X POST  "$1" -H "Content-Type: application/json" ${3:+-H "Authorization: Bearer $3"} -d "$2" 2>/dev/null || true; }
GET()  { curl -sf -X GET   "$1" ${2:+-H "Authorization: Bearer $2"} 2>/dev/null || true; }
PATCH(){ curl -sf -X PATCH "$1" -H "Content-Type: application/json" ${3:+-H "Authorization: Bearer $3"} -d "$2" 2>/dev/null || true; }
PUT()  { curl -sf -X PUT   "$1" -H "Content-Type: application/json" ${3:+-H "Authorization: Bearer $3"} -d "$2" 2>/dev/null || true; }

# ── Phase 1: Verify admin ─────────────────────────────────────────────────────
step 1 "Admin login + role verification"

RESP=$(POST "$API/auth/login" "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")
ADMIN_TOKEN=$(echo "$RESP" | jfield "token")

if [[ -z "$ADMIN_TOKEN" ]]; then
  fail "Login failed for $ADMIN_EMAIL — check credentials and backend URL."
  fail "Response: $RESP"
  exit 1
fi

ME=$(GET "$API/auth/me" "$ADMIN_TOKEN")
MY_ROLE=$(echo "$ME" | jfield "role" "name")

if [[ "$MY_ROLE" != "admin" ]]; then
  fail "Account '$ADMIN_EMAIL' has role '${MY_ROLE:-unknown}'. The admin role is required."
  echo
  echo -e "  The first user registered in the app automatically gets the ${W}admin${NC} role."
  echo -e "  Provide those credentials as arguments."
  exit 1
fi

echo "$ADMIN_TOKEN" > "$TOKEN_DIR/admin"
ok "Logged in as admin (role confirmed)"

# ── Phase 2: Create 25 users via admin API (not rate-limited) ─────────────────
step 2 "Creating $NUM_USERS simulation users via admin API (parallel, no rate limit)"

SIM_PASS="Kanban@Sim2024"

create_user() {
  local i="$1" admin_tok="$2"
  local padded; padded=$(printf '%02d' "$i")
  local name="Sim User $padded"
  local email="simuser${padded}@kanban.test"
  # Users 01-05 → manager (role_id=2)  •  06-25 → worker (role_id=3)
  local role_id=3; [[ $i -le 5 ]] && role_id=2

  local r
  r=$(POST "$API/users" \
    "{\"name\":\"$name\",\"email\":\"$email\",\"password\":\"$SIM_PASS\",\"role_id\":$role_id}" \
    "$admin_tok")

  local uid; uid=$(echo "$r" | jfield "id")
  if [[ -n "$uid" && "$uid" != "0" ]]; then
    echo "created:$i:$uid"
  else
    # User may already exist from a previous run — that's fine
    echo "exists_or_failed:$i"
  fi
}

PIDS=()
for i in $(seq 1 $NUM_USERS); do
  create_user "$i" "$ADMIN_TOKEN" >> "$WORKDIR/create.log" 2>&1 &
  PIDS+=($!)
done
for pid in "${PIDS[@]}"; do wait "$pid" 2>/dev/null || true; done

CREATED=$(grep "^created:" "$WORKDIR/create.log" 2>/dev/null | wc -l | tr -d ' ')
ok "$CREATED new users created  (existing users from previous runs are reused)"

# ── Phase 3: Login users sequentially — 7 s apart to stay under rate limit ────
step 3 "Logging in $NUM_USERS users (7 s gaps · ~$((NUM_USERS * LOGIN_GAP / 60)) min)"
echo -e "  Rate limit: ${C}$AUTH_LIMIT req / ${AUTH_WINDOW}s${NC}  →  spacing: ${C}${LOGIN_GAP}s${NC} between logins"
echo -e "  ${Y}This phase takes ~$((NUM_USERS * LOGIN_GAP)) seconds. Leave the browser open.${NC}"
echo

# Admin login was the first auth request in this window.
# Sleep LOGIN_GAP before starting user logins so the window accounting stays clean.
printf "  [waiting %ds before first user login]  " "$LOGIN_GAP"; sleep "$LOGIN_GAP"; echo

LOGGED_IN=0
for i in $(seq 1 $NUM_USERS); do
  padded=$(printf '%02d' "$i")
  email="simuser${padded}@kanban.test"

  r=$(POST "$API/auth/login" "{\"email\":\"$email\",\"password\":\"$SIM_PASS\"}")
  tok=$(echo "$r" | jfield "token")

  if [[ -n "$tok" ]]; then
    echo "$tok" > "$TOKEN_DIR/user_$padded"
    LOGGED_IN=$((LOGGED_IN + 1))
    role_label="worker"; [[ $i -le 5 ]] && role_label="manager"
    printf "  ${G}✓${NC} SimUser %s logged in  [%s]  (%d/%d)\n" "$padded" "$role_label" "$LOGGED_IN" "$NUM_USERS"
  else
    printf "  ${R}✗${NC} SimUser %s login failed: %s\n" "$padded" "$r"
  fi

  # Wait between logins (skip the wait after the last one)
  if [[ $i -lt $NUM_USERS ]]; then
    # Countdown so the screen isn't just frozen
    for s in $(seq $LOGIN_GAP -1 1); do
      printf "\r  Next login in ${C}%ds${NC}…  " "$s"; sleep 1
    done
    printf "\r%60s\r" ""   # clear the countdown line
  fi
done

if [[ $LOGGED_IN -eq 0 ]]; then
  fail "No users logged in. Aborting."; exit 1
fi
ok "$LOGGED_IN / $NUM_USERS users ready"

# ── Phase 4: Collect / create products ────────────────────────────────────────
step 4 "Collecting products (reuse existing + create new if needed)"

PRODUCT_NAMES=(
  "Customer Dashboard Redesign"
  "Mobile Payment Integration"
  "Analytics Pipeline v2"
  "API Gateway Upgrade"
  "Auth Service Hardening"
  "Search and Filter Module"
  "Export and Reporting Tool"
  "Real-time Notification Engine"
  "Data Archival System"
  "Admin Console Overhaul"
  "Cache Layer Optimisation"
  "CI-CD Pipeline Setup"
)
STATUSES=("yet_to_start" "working" "review" "done")

> "$WORKDIR/product_ids.txt"

# Reuse any products that already exist in the board
EXISTING_JSON=$(GET "$API/products" "$ADMIN_TOKEN")
EXISTING_COUNT=$(echo "$EXISTING_JSON" | jlen)

if [[ "$EXISTING_COUNT" -gt 0 ]]; then
  echo "$EXISTING_JSON" | python3 -c '
import sys, json
prods = json.load(sys.stdin)
for p in prods:
    pid = p.get("id", 0)
    if pid: print(pid)
' 2>/dev/null >> "$WORKDIR/product_ids.txt" || true
  ok "Found $EXISTING_COUNT existing products — will reuse them"
fi

# Count how many we already have
HAVE=$(wc -l < "$WORKDIR/product_ids.txt" | tr -d ' ')

# Only create new products if we need more
NEED=$((NUM_PRODUCTS - HAVE))
if [[ $NEED -gt 0 ]]; then
  # Use a run-unique prefix so product_id never collides with previous runs
  RUN_ID=$(date +%s | tail -c 5)
  for i in $(seq 1 $NEED); do
    (
      idx=$((i - 1))
      pname="${PRODUCT_NAMES[$((idx % ${#PRODUCT_NAMES[@]}))]}"
      status="${STATUSES[$((idx % 4))]}"
      pid_str="SIM-$RUN_ID-$(printf '%02d' "$i")"
      desc="$pname — KanbanFlow load simulation at $(date -u '+%H:%M:%S UTC')."

      creator_tok="$ADMIN_TOKEN"
      if [[ $((i % 3)) -ne 0 ]]; then
        mgr=$(( (idx % 5) + 1 ))
        mgr_file="$TOKEN_DIR/user_$(printf '%02d' "$mgr")"
        [[ -f "$mgr_file" ]] && creator_tok=$(cat "$mgr_file")
      fi

      r=$(POST "$API/products" \
        "{\"product_id\":\"$pid_str\",\"customer_name\":\"Sim Client $i\",\"customer_phone\":\"+1555$(printf '%07d' "$i")\",\"description\":\"$desc\",\"status\":\"$status\"}" \
        "$creator_tok")
      pid=$(echo "$r" | jfield "id")
      [[ -n "$pid" && "$pid" != "0" ]] && echo "$pid" >> "$WORKDIR/product_ids.txt"
    ) &
  done
  wait
  ok "Created $NEED new products"
fi

PRODUCT_IDS=()
while IFS= read -r line; do
  [[ -n "$line" ]] && PRODUCT_IDS+=("$line")
done < "$WORKDIR/product_ids.txt"

if [[ ${#PRODUCT_IDS[@]} -eq 0 ]]; then
  fail "No products available — check admin token and backend."; exit 1
fi
# Deduplicate and cap at a reasonable number
printf '%s\n' "${PRODUCT_IDS[@]}" | sort -u > "$WORKDIR/product_ids.txt"
PRODUCT_IDS=()
while IFS= read -r line; do
  [[ -n "$line" ]] && PRODUCT_IDS+=("$line")
done < "$WORKDIR/product_ids.txt"

ok "${#PRODUCT_IDS[@]} products ready across all Kanban columns"

# ── Phase 5: Build a tiny test PNG for attachment uploads ─────────────────────
step 5 "Preparing test attachment"

PNG_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="
TINY_PNG="$WORKDIR/sim_test.png"
echo "$PNG_B64" | base64 --decode > "$TINY_PNG" 2>/dev/null || \
  echo "$PNG_B64" | base64 -d      > "$TINY_PNG" 2>/dev/null || true
PNG_SIZE=$(wc -c < "$TINY_PNG" | tr -d ' ')
ok "1×1 pixel PNG ready (${PNG_SIZE} bytes)"

# ── Phase 6: Parallel simulation ──────────────────────────────────────────────
step 6 "Launching $NUM_USERS parallel user sessions"
echo -e "  ${Y}${BOLD}Watch your browser — cards will move, chat will fill, activity will scroll.${NC}"
echo

CHAT_LINES=(
  "Just shipped the latest hotfix"
  "Who is reviewing the payment PR?"
  "Moved this to Review — ready for QA"
  "All tests green on my machine"
  "Just deployed to staging"
  "Load sim running — real data incoming"
  "Performance looks great under load"
  "Can someone pair on the auth issue?"
  "Finished the migration script"
  "Closing out three tickets today"
  "Sprint review is tomorrow 3pm"
  "Notifications are working end to end"
  "Rate limiting is live on auth routes"
  "Activity log indexed — faster now"
  "Upload progress modal shipped"
  "Found a concurrency bug — fixed"
  "API gateway upgrade complete"
  "Dashboard redesign is in Review"
  "Analytics pipeline is running"
  "Great work this sprint everyone"
)

simulate_user() {
  local IDX="$1"
  local PADDED; PADDED=$(printf '%02d' "$IDX")
  local LOG="$LOG_DIR/user_$PADDED.log"

  {
    # ── Read shared data inside subshell ──────────────────────────────────────
    local PRODS=()
    while IFS= read -r l; do [[ -n "$l" ]] && PRODS+=("$l"); done < "$WORKDIR/product_ids.txt"
    local NP=${#PRODS[@]}

    local TOKEN_FILE="$TOKEN_DIR/user_$PADDED"
    if [[ ! -f "$TOKEN_FILE" ]]; then
      echo "RESULT:$IDX:0:1:no_token"; return
    fi
    local TOKEN; TOKEN=$(cat "$TOKEN_FILE")

    local ACTS=0 ERRS=0
    echo "=== SimUser $PADDED start=$(date '+%H:%M:%S') ==="

    # ── Optional: open a real WebSocket connection ────────────────────────────
    local WS_PID=""
    if $HAS_WEBSOCAT; then
      local WS_URL
      WS_URL=$(echo "$BACKEND" | sed 's|^http|ws|')/api/ws?token=$TOKEN
      # Keep connection alive in background — receives all server broadcasts
      websocat -q --no-close "$WS_URL" > /dev/null 2>&1 &
      WS_PID=$!
    fi

    # Randomise start within 0.1–1.5 s so all 25 don't fire at exactly t=0
    sleep "0.$(( (IDX * 137 + RANDOM % 200) % 1400 + 100 ))"

    # ── 1. Fetch product list ─────────────────────────────────────────────────
    local r cnt
    r=$(GET "$API/products" "$TOKEN")
    cnt=$(echo "$r" | jlen)
    echo "[LIST] $cnt products on board"
    ACTS=$((ACTS + 1))

    sleep "0.$((RANDOM % 5 + 1))"

    # ── 2. Send 3 chat messages (visible in Team Chat in real-time) ───────────
    for m in 1 2 3; do
      local midx=$(( (IDX * m * 7 + RANDOM) % ${#CHAT_LINES[@]} ))
      local msg="${CHAT_LINES[$midx]}  [SimUser $PADDED]"
      r=$(POST "$API/chat/messages" "{\"message\":\"$msg\"}" "$TOKEN")
      local cid; cid=$(echo "$r" | jfield "id")
      if [[ -n "$cid" && "$cid" != "0" ]]; then
        echo "[CHAT] sent id=$cid"
        ACTS=$((ACTS + 1))
      else
        echo "[CHAT] error: $r"; ERRS=$((ERRS + 1))
      fi
      sleep "0.$((RANDOM % 8 + 3))"
    done

    # ── 3. Comment on 2 products (comments show live in product modal) ────────
    for c in 1 2; do
      local pidx=$(( (IDX + c) % NP ))
      local prod="${PRODS[$pidx]}"
      local msg="SimUser $PADDED pass-$c: logic verified, tests pass, ready to merge."
      r=$(POST "$API/products/$prod/comments" "{\"message\":\"$msg\"}" "$TOKEN")
      local coid; coid=$(echo "$r" | jfield "id")
      if [[ -n "$coid" && "$coid" != "0" ]]; then
        echo "[COMMENT] prod=$prod id=$coid"
        ACTS=$((ACTS + 1))
      else
        echo "[COMMENT] error prod=$prod: $r"; ERRS=$((ERRS + 1))
      fi
      sleep "0.$((RANDOM % 4 + 1))"
    done

    # ── 4. Move a card to a new status (card moves on board live) ────────────
    local s1_prod="${PRODS[$((IDX % NP))]}"
    local s_arr=("yet_to_start" "working" "review" "done")
    local new_s="${s_arr[$((IDX % 4))]}"
    r=$(PATCH "$API/products/$s1_prod/status" "{\"status\":\"$new_s\"}" "$TOKEN")
    local got_s; got_s=$(echo "$r" | jfield "status")
    if [[ -n "$got_s" ]]; then
      echo "[STATUS] prod=$s1_prod → $new_s"
      ACTS=$((ACTS + 1))
    else
      echo "[STATUS] error prod=$s1_prod: $r"; ERRS=$((ERRS + 1))
    fi

    sleep "0.$((RANDOM % 4 + 1))"

    # ── 5. Upload an attachment (presign → PUT to R2 → confirm) ──────────────
    local a_prod="${PRODS[$(( (IDX + 3) % NP ))]}"
    local fname="simuser${PADDED}_$(date +%s).png"
    local presign; presign=$(GET "$API/products/$a_prod/attachments/presign?filename=$fname" "$TOKEN")
    local upload_url s3_key ctype
    upload_url=$(echo "$presign" | jfield "upload_url")
    s3_key=$(echo "$presign"    | jfield "s3_key")
    ctype=$(echo "$presign"     | jfield "content_type")

    if [[ -n "$upload_url" ]]; then
      local http_code
      # Use -s (not -sf) so curl doesn't exit non-zero on 4xx/5xx;
      # -f would corrupt http_code by triggering || echo "000" alongside -w output.
      http_code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$upload_url" \
        -H "Content-Type: ${ctype:-image/png}" \
        --data-binary "@$TINY_PNG" 2>/dev/null)
      [[ -z "$http_code" ]] && http_code="000"

      if [[ "$http_code" == "200" ]]; then
        local cr att_id
        cr=$(POST "$API/products/$a_prod/attachments/confirm" \
          "{\"s3_key\":\"$s3_key\",\"file_name\":\"$fname\",\"file_size\":$PNG_SIZE,\"file_type\":\".png\"}" \
          "$TOKEN")
        att_id=$(echo "$cr" | jfield "id")
        if [[ -n "$att_id" && "$att_id" != "0" ]]; then
          echo "[ATTACH] prod=$a_prod att=$att_id ok"
          ACTS=$((ACTS + 1))
        else
          echo "[ATTACH] confirm failed: $cr"; ERRS=$((ERRS + 1))
        fi
      else
        echo "[ATTACH] R2 PUT → $http_code (check bucket CORS)"; ERRS=$((ERRS + 1))
      fi
    else
      echo "[ATTACH] presign failed: $presign"; ERRS=$((ERRS + 1))
    fi

    sleep "0.$((RANDOM % 3 + 1))"

    # ── 6. Second status move (different product — keeps board alive) ─────────
    local s2_prod="${PRODS[$(( (IDX + 7) % NP ))]}"
    local new_s2="${s_arr[$(( (IDX + 2) % 4 ))]}"
    r=$(PATCH "$API/products/$s2_prod/status" "{\"status\":\"$new_s2\"}" "$TOKEN")
    got_s=$(echo "$r" | jfield "status")
    [[ -n "$got_s" ]] && echo "[STATUS2] prod=$s2_prod → $new_s2" && ACTS=$((ACTS + 1)) || true

    sleep "0.$((RANDOM % 3 + 1))"

    # ── 7. Read + clear notifications ────────────────────────────────────────
    r=$(GET "$API/notifications" "$TOKEN")
    cnt=$(echo "$r" | jlen)
    echo "[NOTIF] $cnt notifications"
    ACTS=$((ACTS + 1))

    POST "$API/notifications/read-all" "{}" "$TOKEN" > /dev/null
    echo "[NOTIF] marked all read"
    ACTS=$((ACTS + 1))

    # ── 8. Read activity log ──────────────────────────────────────────────────
    r=$(GET "$API/activity?limit=50" "$TOKEN")
    cnt=$(echo "$r" | jlen)
    echo "[ACTIVITY] $cnt recent entries"
    ACTS=$((ACTS + 1))

    # ── 9. Read chat history ──────────────────────────────────────────────────
    r=$(GET "$API/chat/messages" "$TOKEN")
    cnt=$(echo "$r" | jlen)
    echo "[CHAT-HIST] $cnt total messages"
    ACTS=$((ACTS + 1))

    # ── 10. Read attachment list for a product ────────────────────────────────
    local view_prod="${PRODS[$(( IDX % NP ))]}"
    r=$(GET "$API/products/$view_prod/attachments" "$TOKEN")
    cnt=$(echo "$r" | jlen)
    echo "[ATTACHMENTS] prod=$view_prod has $cnt file(s)"
    ACTS=$((ACTS + 1))

    # ── 11. Manager-only: create + update a product ───────────────────────────
    if [[ $IDX -le 5 ]]; then
      local new_pid="MGR-$(printf '%04d' "$IDX")-$(date +%s)"
      r=$(POST "$API/products" \
        "{\"product_id\":\"$new_pid\",\"customer_name\":\"Manager $PADDED Client\",\"customer_phone\":\"+155500000$IDX\",\"description\":\"Created live by manager $PADDED during simulation.\",\"status\":\"yet_to_start\"}" \
        "$TOKEN")
      local new_id; new_id=$(echo "$r" | jfield "id")
      if [[ -n "$new_id" && "$new_id" != "0" ]]; then
        echo "[CREATE] manager $PADDED created prod id=$new_id"
        ACTS=$((ACTS + 1))
        sleep "0.$((RANDOM % 3 + 1))"
        # Immediately update description (shows activity log entry)
        PUT "$API/products/$new_id" \
          "{\"description\":\"Updated by manager $PADDED at $(date -u '+%H:%M:%S UTC') — simulation complete.\"}" \
          "$TOKEN" > /dev/null
        echo "[UPDATE] prod $new_id updated by manager $PADDED"
        ACTS=$((ACTS + 1))
      else
        echo "[CREATE] manager $PADDED create failed: $r"; ERRS=$((ERRS + 1))
      fi
    fi

    # ── 12. Third chat message (keeps chat active throughout simulation) ───────
    sleep "0.$((RANDOM % 10 + 5))"
    local final_midx=$(( (IDX * 3 + RANDOM) % ${#CHAT_LINES[@]} ))
    r=$(POST "$API/chat/messages" "{\"message\":\"${CHAT_LINES[$final_midx]} — SimUser $PADDED wrapping up\"}" "$TOKEN")
    local fcid; fcid=$(echo "$r" | jfield "id")
    [[ -n "$fcid" && "$fcid" != "0" ]] && ACTS=$((ACTS + 1)) || true

    # ── Done — close WS connection ────────────────────────────────────────────
    [[ -n "$WS_PID" ]] && kill "$WS_PID" 2>/dev/null || true

    echo "=== SimUser $PADDED done  actions=$ACTS errors=$ERRS ==="
    echo "RESULT:$IDX:$ACTS:$ERRS"
  } > "$LOG" 2>&1
}

# Launch all sessions in parallel
SIM_PIDS=()
for i in $(seq 1 $NUM_USERS); do
  simulate_user "$i" &
  SIM_PIDS+=($!)
done

# Progress bar — one block per completed session
printf "  Progress: "
DONE=0
for pid in "${SIM_PIDS[@]}"; do
  wait "$pid" 2>/dev/null || true
  DONE=$((DONE + 1))
  printf "${G}█${NC}"
done
printf "  (%d/%d)\n" "$DONE" "$NUM_USERS"

# ── Phase 7: Results ──────────────────────────────────────────────────────────
step 7 "Results"
echo

printf "  %-14s  %-10s  %-8s  %-8s  %s\n" "User" "Role" "Actions" "Errors" "Status"
printf "  %s\n" "──────────────────────────────────────────────────────────"

TOTAL_ACTS=0; TOTAL_ERRS=0; PASSED=0; FAILED=0

for i in $(seq 1 $NUM_USERS); do
  PADDED=$(printf '%02d' "$i")
  LOG="$LOG_DIR/user_$PADDED.log"
  RESULT=$(grep "^RESULT:" "$LOG" 2>/dev/null | tail -1)
  ROLE_LABEL="worker"; [[ $i -le 5 ]] && ROLE_LABEL="manager"

  if [[ -n "$RESULT" ]]; then
    ACTS=$(echo "$RESULT" | cut -d: -f3)
    ERRS=$(echo "$RESULT" | cut -d: -f4)
    TOTAL_ACTS=$((TOTAL_ACTS + ACTS))
    TOTAL_ERRS=$((TOTAL_ERRS + ERRS))
    if [[ "$ERRS" -eq 0 ]]; then
      printf "  %-14s  %-10s  %-8s  %-8s  " "SimUser $PADDED" "$ROLE_LABEL" "$ACTS" "$ERRS"
      echo -e "${G}PASS${NC}"
      PASSED=$((PASSED + 1))
    else
      printf "  %-14s  %-10s  %-8s  %-8s  " "SimUser $PADDED" "$ROLE_LABEL" "$ACTS" "$ERRS"
      echo -e "${Y}WARN${NC}"
      PASSED=$((PASSED + 1))
    fi
  else
    printf "  %-14s  %-10s  %-8s  %-8s  " "SimUser $PADDED" "$ROLE_LABEL" "—" "—"
    echo -e "${R}FAIL${NC}  → $LOG"
    FAILED=$((FAILED + 1))
  fi
done

echo
printf "  %s\n" "──────────────────────────────────────────────────────────"
echo -e "  ${W}Total actions :${NC}  ${G}$TOTAL_ACTS${NC}"
echo -e "  ${W}Total errors  :${NC}  $([ "$TOTAL_ERRS" -gt 0 ] && printf "${R}%s${NC}" "$TOTAL_ERRS" || printf "${G}%s${NC}" "$TOTAL_ERRS")"
echo -e "  ${W}Users passed  :${NC}  ${G}$PASSED${NC}"
echo -e "  ${W}Users failed  :${NC}  $([ "$FAILED" -gt 0 ] && printf "${R}%s${NC}" "$FAILED" || printf "${G}%s${NC}" "$FAILED")"
echo

# Attachment failure details — show exact error from each affected user's log
ATTACH_ERRORS=$(grep -h "\[ATTACH\].*error\|presign failed\|R2 PUT\|confirm failed" "$LOG_DIR"/*.log 2>/dev/null | sort -u)
if [[ -n "$ATTACH_ERRORS" ]]; then
  warn "Attachment errors detected:"
  echo "$ATTACH_ERRORS" | head -5 | while IFS= read -r line; do
    echo -e "    ${Y}→${NC} $line"
  done
fi

NP_FINAL=${#PRODUCT_IDS[@]}
echo -e "  ${G}✓ Simulation complete.${NC}"
echo -e "  ${C}The app should now show:"
echo -e "    • $((NP_FINAL + 5)) products spread across all four columns"
echo -e "    • $((NUM_USERS * 4)) chat messages in Team Chat"
echo -e "    • $((NUM_USERS * 2)) comments across products"
echo -e "    • $((NUM_USERS * 2 + 10)) activity log entries"
echo -e "    • Up to $NUM_USERS attachment files (if R2 is configured)${NC}"
echo
