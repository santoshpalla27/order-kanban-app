# KanbanFlow — Team Collaboration & Order Management

A lightweight, self-hosted Kanban-style order management system built for small teams (10–20 users).

## Features

- **Kanban Board** — Drag-and-drop product cards across status columns (Yet to Start → Working → Review → Done)
- **List View** — Products grouped by status with inline status change
- **Product Management** — Full CRUD with attachments and threaded comments
- **Real-time Sync** — WebSocket-powered live updates across all connected clients
- **Team Chat** — Global real-time messaging with emoji support
- **Notifications** — Real-time alerts for product changes, comments, and attachments
- **RBAC** — Admin / Manager / Worker role-based access control
- **Search & Filters** — Global search across products with status, user, and date filters
- **File Attachments** — Upload and preview images, download documents (jpg, png, pdf, docx, etc.)

## Tech Stack

| Layer      | Technology                                                    |
| ---------- | ------------------------------------------------------------- |
| Backend    | Go (Gin), GORM, SQLite, JWT, WebSocket                        |
| Frontend   | React, TypeScript, TailwindCSS, dnd-kit, React Query, Zustand |
| Deployment | Docker, Docker Compose, Nginx                                 |

## Quick Start

### Docker Deployment (Recommended)

```bash
# Clone and enter directory
git clone <your-repo-url>
cd kanban-app

# Set a secure JWT secret
export JWT_SECRET="your-secure-secret-key"

# Build and start
docker compose up -d --build

# Open http://localhost:3000
```

### Local Development

**Backend:**

```bash
cd backend
go run ./cmd/main.go
# Runs on http://localhost:8080
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000 (proxies API to :8080)
```

## First User

The **first registered user** is automatically assigned the **Admin** role. All subsequent users are assigned the **Worker** role by default.

1. Open `http://localhost:3000/register`
2. Create your admin account
3. Go to Admin Panel to create additional users and assign roles

## Roles & Permissions

| Permission            | Admin | Manager | Worker     |
| --------------------- | ----- | ------- | ---------- |
| Create users          | ✅    | ❌      | ❌         |
| Assign roles          | ✅    | ❌      | ❌         |
| Delete products       | ✅    | ❌      | ❌         |
| Create products       | ✅    | ✅      | ❌         |
| Move product statuses | ✅    | ✅      | ⚠️ Limited |
| Upload attachments    | ✅    | ✅      | ✅         |
| Comment               | ✅    | ✅      | ✅         |
| View boards           | ✅    | ✅      | ✅         |

Workers can only move cards between specific statuses (e.g. Yet to Start → Working, Working → Review).

## Environment Variables

| Variable     | Default                | Description                                |
| ------------ | ---------------------- | ------------------------------------------ |
| `PORT`       | `8080`                 | Backend server port                        |
| `JWT_SECRET` | `kanban-secret-key...` | JWT signing secret (change in production!) |
| `DB_PATH`    | `./data/kanban.db`     | SQLite database file path                  |
| `UPLOAD_DIR` | `./uploads`            | File upload storage directory              |

## Project Structure

```
kanban-app/
├── backend/
│   ├── cmd/main.go              # Entry point
│   ├── config/                  # Configuration
│   ├── database/                # SQLite + GORM setup
│   └── internal/
│       ├── api/
│       │   ├── handlers/        # HTTP handlers + WebSocket hub
│       │   └── router.go        # Route definitions
│       ├── middleware/           # JWT auth + RBAC
│       ├── models/              # Data models
│       └── services/            # Business logic
├── frontend/
│   ├── src/
│   │   ├── api/                 # Axios API client
│   │   ├── components/          # Shared components
│   │   ├── hooks/               # WebSocket hook
│   │   ├── pages/               # Page components
│   │   ├── store/               # Zustand stores
│   │   └── types/               # TypeScript types
│   ├── nginx.conf               # Production nginx config
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

go run ./cmd/seed/main.go

docker run --rm -it -v $(pwd):/app -w /app --network order-kanban-app_kanban-net -e DATABASE_URL="postgres://kanban:kaban@kanban-postgres:5432/kanban?sslmode=disable" golang:latest go run ./cmd/seed/main.go

docker compose stop frontend backend
docker compose rm -f frontend backend
docker compose build --no-cache frontend backend
docker compose up -d frontend backend

./run-load.sh # smoke — 1 VU, 2 min (default)
./run-load.sh smoke # same
./run-load.sh load # load — ramps 30→50 VUs, 5 min
./run-load.sh spike # spike — 0 → 100 → 0 VUs, burst test
./run-load.sh soak # soak — 30 VUs sustained for 30 min
./run-load.sh ratelimit # rate-limit — verifies 429 enforcement

./run-load.sh load --peak-vus 80 # override the VU ceiling for any scenario

smoke - 1 user, 2 min — confirms the API works at all under zero load

load - 30–50 concurrent users, 5 min — normal day-to-day traffic behaviour

spike - 0 → 100 → 0 users instantly — how the API survives a sudden traffic burst

soak - 30 users sustained for 30 min — memory leaks, connection pool exhaustion over time

ratelimit - Hammers auth endpoints to confirm 429s are returned before the server buckles

React Native App — mobile/
How to run

cd mobile
npm install
npx expo start # scan QR with Expo Go app
npx expo run:android # build native Android APK

echo $(htpasswd -nB admin) | sed -e s/\\$/\\$\\$/g

ADMIN_AUTH=admin:$$2y$$05$$...yourHashedPassword
(Note: As seen in your .env.example, ADMIN_AUTH is correctly referenced by the new docker-compose labels).

sudo du -sh $(docker volume inspect order-kanban-app_postgres-data --format '{{.Mountpoint}}')

48M /var/lib/docker/volumes/order-kanban-app_postgres-data/\_data

docker stats kanban-backend kanban-postgres kanban-push-service kanban-frontend kanban-traefik

Backend — healthy ✓

Time Memory
0min 7.3 MB
5min 10.3 MB
10min 9.8 MB
15min 9.7 MB
Normal Go runtime warmup — went up then stabilized. No leak.

Postgres — healthy ✓

Fluctuates 49–53 MB. That's just the query cache filling up. Normal.

Traefik — healthy ✓

19 → 29 → 27 → 22 MB. Fluctuating is expected — it manages TLS sessions and connection pools that get GC'd.

Frontend — perfect ✓

Completely flat at 3.8 MB. Static file server, nothing to leak.
