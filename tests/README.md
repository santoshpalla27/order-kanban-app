# Kanban App — Test Suite

Four test layers, all containerised — run individually or all at once.

```
tests/
├── api/               Postman collection — API contract + RBAC tests
├── e2e/               Playwright — full UI workflow tests
├── load/              k6 — performance and load tests
├── security/          Shell scripts — auth + injection + RBAC boundary
├── results/           Test output (gitignored, timestamped per run)
├── docker-compose.yml Orchestrates all test containers
├── run-all.sh         One-command runner with summary report
├── .env.test          Test environment variables
└── README.md          This file
```

---

## Run Everything in Docker (Recommended)

```bash
# 1. Start the app first
docker compose up -d

# 2. Run the full test suite
cd tests
./run-all.sh
```

Results land in `tests/results/<timestamp>/` with an HTML report per suite and a `summary.md`.

### Selective runs

```bash
./run-all.sh --api              # API tests only (fastest, ~30s)
./run-all.sh --e2e              # E2E only
./run-all.sh --load smoke       # k6 smoke (1 user, 2 min)
./run-all.sh --load load        # k6 load (30-50 VUs, 5 min)
./run-all.sh --security         # security scripts only
./run-all.sh --skip-e2e         # all except E2E (fast CI mode)
./run-all.sh --peak-vus 50      # override k6 VU count
```

### Output files per run

| File | Content |
|------|---------|
| `api-results.html` | Newman HTML report (open in browser) |
| `api-results.json` | Newman JSON (CI-parseable) |
| `e2e-report/` | Playwright HTML report |
| `e2e-results.json` | Playwright JSON |
| `k6-results.json` | k6 per-request metrics |
| `k6-summary.json` | k6 threshold pass/fail |
| `security-all.log` | Combined security script output |
| `summary.md` | Overall pass/fail per suite |

---

## Prerequisites (local runs without Docker)

| Tool | Install |
|------|---------|
| Postman | https://www.postman.com/downloads |
| Node.js ≥ 18 | For Playwright |
| k6 | `brew install k6` |
| curl + python3 | For security shell scripts (pre-installed on macOS) |

---

## 1. API Tests — Postman

### Files
| File | Purpose |
|------|---------|
| `tests/api/kanban-app.postman_collection.json` | All requests + test scripts |
| `tests/api/kanban-app.postman_environment.json` | Local environment variables |

### Setup (GUI)
1. Open Postman → **Import** → select both JSON files
2. Top-right dropdown → select **Kanban App — Local** environment
3. Update credentials in the environment if needed

### Setup (CLI with Newman)
```bash
npm install -g newman newman-reporter-htmlextra
newman run tests/api/kanban-app.postman_collection.json \
  -e tests/api/kanban-app.postman_environment.json \
  --reporters cli,htmlextra \
  --reporter-htmlextra-export tests/reports/api-report.html
```

### Test accounts (create these before running)
Use the admin panel (`/admin`) or seed script to create:

| Email | Password | Role |
|-------|----------|------|
| admin@test.com | password123 | admin |
| manager@test.com | password123 | manager |
| organiser@test.com | password123 | organiser |
| employee@test.com | password123 | employee |
| viewonly@test.com | password123 | view_only |

### Run order
Run folders in this order (each builds on previous token/id variables):
1. **Auth → Login (Admin)** — sets `accessToken`, `refreshToken`
2. **Products** — sets `productId`, `newProductId`
3. **Comments** — uses `productId`, sets `commentId`
4. **Chat**, **Notifications**, **Users (Admin only)**
5. **RBAC** — run the three Setup requests first, then all forbidden tests

---

## 2. E2E Tests — Playwright

### Setup
```bash
cd tests/e2e
npm install
npx playwright install chromium
```

### Configure
Set environment variables or use defaults:
```bash
export BASE_URL=http://localhost:5173   # frontend dev server
export API_URL=http://localhost:8080/api
export ADMIN_EMAIL=admin@test.com
export ADMIN_PASSWORD=password123
# ... (see fixtures/auth.setup.ts for all vars)
```

### Run
```bash
# Run all tests (setup runs first automatically)
npm test

# Run with visible browser
npm run test:headed

# Run specific spec
npm run test:kanban
npm run test:rbac
npm run test:admin

# Interactive UI mode
npm run test:ui

# View HTML report
npm run test:report
```

### Test files

| File | What it tests |
|------|---------------|
| `specs/auth.spec.ts` | Login, logout, redirects, error states |
| `specs/kanban.spec.ts` | Board columns, drag-drop, filters, card modal |
| `specs/product.spec.ts` | Create, edit, delete, trash, restore |
| `specs/comments.spec.ts` | Post, edit, delete, ownership enforcement |
| `specs/notifications.spec.ts` | Bell count, panel, mark read, real-time WS |
| `specs/admin.spec.ts` | User CRUD, role change, confirm-delete modal |
| `specs/rbac.spec.ts` | UI elements per role, protected route access |

### Notes
- Auth state is saved per-role in `tests/e2e/.auth/` (git-ignored)
- Tests run serially (not parallel) to avoid race conditions on shared data
- Drag-and-drop tests require Chromium (Firefox doesn't support HTML5 drag in Playwright)

---

## 3. Load Tests — k6

### Install
```bash
brew install k6          # macOS
# or
winget install k6        # Windows
# or
sudo snap install k6     # Linux
```

### Run order

Always run **smoke first**. Stop if smoke fails.

```bash
cd tests/load

# 1. Smoke — sanity check (1 user, 2 min)
k6 run smoke.js

# 2. Rate limit — verify auth rate limiting
k6 run ratelimit.js

# 3. Load — normal production load (30-50 users, 5 min)
k6 run load.js

# 4. Spike — burst traffic (0→100→0 users)
k6 run spike.js

# 5. Soak — sustained load (30 users, 30 min) — only when system is stable
k6 run soak.js
```

### Custom options
```bash
# Custom base URL and credentials
k6 run --env BASE_URL=http://myserver:8080/api \
       --env ADMIN_EMAIL=admin@prod.com \
       --env ADMIN_PASSWORD=secretpw \
       load.js

# Custom peak users
k6 run --env PEAK_VUS=40 load.js

# Output to InfluxDB for Grafana dashboards
k6 run --out influxdb=http://localhost:8086/k6 load.js
```

### Thresholds

| Test | p95 latency | Error rate |
|------|-------------|------------|
| Smoke | < 1000ms | < 1% |
| Load | < 500ms | < 1% |
| Spike | < 2000ms | < 5% |
| Soak | < 600ms | < 1% |

---

## 4. Security Tests — Shell Scripts

```bash
cd tests/security

# Auth security (JWT tampering, logout revocation, body size limit)
./auth-security.sh http://localhost:8080/api

# RBAC boundaries (all role×endpoint combinations)
./rbac-boundary.sh http://localhost:8080/api

# Input injection (SQL, XSS, oversized inputs, CORS)
./injection-tests.sh http://localhost:8080/api

# Custom credentials
ADMIN_EMAIL=admin@prod.com ADMIN_PASSWORD=secret ./auth-security.sh https://myapp.com/api
```

---

## Recommended test execution order

### Before every deploy
```
1. API tests (Bruno or CLI) — fast, catches contract regressions
2. E2E smoke (auth + kanban specs) — catches UI regressions
3. Security auth-security.sh — catches auth regressions
```

### Weekly / staging
```
4. Full E2E suite
5. k6 smoke → load
6. Full security scripts (all 3)
```

### Before major releases
```
7. k6 spike test
8. k6 soak test (30 min)
9. RBAC boundary full matrix
```

---

## Troubleshooting

**Postman / Newman: "connection refused"**
→ Backend not running. Start with `docker compose up` or `go run ./cmd/main.go`

**Postman: variables empty (productId, commentId etc.)**
→ Run requests in the documented order — each request sets variables used by the next.

**Playwright: auth state missing**
→ Delete `.auth/` folder and re-run setup: `npx playwright test --project setup`

**k6: "Login failed" in setup()**
→ Check BASE_URL and credentials. Run `./auth-security.sh` to verify login works.

**Security scripts: python3 not found**
→ Install Python 3 or replace `python3 -c ...` with `jq` commands.
