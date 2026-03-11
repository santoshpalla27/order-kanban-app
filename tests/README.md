# Kanban App — Test Suite

Three independent test layers, each with a different scope and tool.

```
tests/
├── api/          Bruno collection — API contract + RBAC tests
├── e2e/          Playwright — full UI workflow tests
├── load/         k6 — performance and load tests
├── security/     Shell scripts — auth + injection + RBAC boundary
└── README.md     This file
```

---

## Prerequisites

| Tool | Install |
|------|---------|
| Bruno (GUI) | https://www.usebruno.com — open `tests/api/` as collection |
| Node.js ≥ 18 | For Playwright |
| k6 | `brew install k6` |
| curl + python3 | For security shell scripts (pre-installed on macOS) |

---

## 1. API Tests — Bruno

### Setup
1. Install Bruno: https://www.usebruno.com
2. Open Bruno → **Open Collection** → select `tests/api/`
3. Switch to the **local** environment (top-right dropdown)
4. Update credentials in `tests/api/environments/local.bru` if needed

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
Run folders in this order (each builds on the previous):
1. `auth/login.bru` — sets `accessToken`
2. `products/` — uses `accessToken`, sets `productId`, `newProductId`
3. `comments/` — uses `productId`
4. `chat/`, `notifications/`, `users/`
5. `rbac/` — run each `*-login.bru` first, then the forbidden tests

### CLI (optional)
```bash
npm install -g @usebruno/cli
cd tests/api
bru run --env local
```

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

**Bruno: "connection refused"**
→ Backend not running. Start with `docker compose up` or `go run ./cmd/main.go`

**Playwright: auth state missing**
→ Delete `.auth/` folder and re-run setup: `npx playwright test --project setup`

**k6: "Login failed" in setup()**
→ Check BASE_URL and credentials. Run `./auth-security.sh` to verify login works.

**Security scripts: python3 not found**
→ Install Python 3 or replace `python3 -c ...` with `jq` commands.
