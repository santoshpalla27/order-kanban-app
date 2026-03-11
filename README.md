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
