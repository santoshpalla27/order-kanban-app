# KanbanFlow — Architecture Overview

A self-hosted, real-time order & task management system built for small teams. Products move through a kanban pipeline (yet_to_start → working → review → done) with team chat, file attachments, @mentions, notifications, and role-based access control.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Technology Stack](#2-technology-stack)
3. [Frontend](#3-frontend)
4. [Backend](#4-backend)
5. [Database](#5-database)
6. [Real-time System](#6-real-time-system)
7. [File Storage](#7-file-storage)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [Infrastructure & Deployment](#9-infrastructure--deployment)
10. [Data Flow Diagrams](#10-data-flow-diagrams)
11. [Key Design Decisions](#11-key-design-decisions)

---

## 1. System Architecture

```
                         ┌─────────────────────────────────────────┐
                         │              Internet                    │
                         └──────────────────┬──────────────────────┘
                                            │ :80 / :443
                         ┌──────────────────▼──────────────────────┐
                         │     Traefik (Reverse Proxy)             │
                         │  • HTTP → HTTPS redirect                 │
                         │  • Let's Encrypt TLS termination         │
                         │  • Routes by hostname                    │
                         └───────────────┬─────────────────────────┘
                                         │ :80
                    ┌────────────────────▼────────────────────────┐
                    │        Nginx (Frontend Container)           │
                    │  • Serves React SPA static files            │
                    │  • Proxies /api/* → Backend :8080           │
                    │  • WebSocket upgrade (proxy_read 86400s)    │
                    │  • Gzip + 30-day asset caching              │
                    └─────────────┬───────────────────────────────┘
                                  │ /api/* proxy
            ┌─────────────────────▼───────────────────────────────┐
            │              Go Backend (Gin)                        │
            │  • REST API + WebSocket hub                          │
            │  • JWT authentication                                │
            │  • RBAC middleware (admin / manager / worker)        │
            │  • LISTEN/NOTIFY dispatcher                          │
            │  • Presigned URL generation for R2                   │
            └───────┬───────────────────────────┬─────────────────┘
                    │                           │
     ┌──────────────▼──────────┐    ┌───────────▼───────────────┐
     │   PostgreSQL 16         │    │   Cloudflare R2 (S3)      │
     │  • All application data │    │  • File attachments        │
     │  • LISTEN/NOTIFY events │    │  • User avatars            │
     │  • Soft deletes         │    │  • Presigned PUT/GET URLs  │
     │  • Partial unique index │    └───────────────────────────┘
     └─────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Version | Why |
|---|---|---|---|
| Frontend Framework | React | 18.3 | Component model, ecosystem |
| Language (FE) | TypeScript | 5.6 | Type safety across API boundary |
| Build Tool | Vite | 6.0 | Fast HMR, optimized production builds |
| Styling | TailwindCSS | 3.4 | Utility-first, dark mode via `data-theme` |
| State (server) | TanStack Query | 5.x | Caching, background refetch, cache invalidation |
| State (client) | Zustand | 5.x | Minimal boilerplate, localStorage persistence |
| Routing | React Router | 7.x | SPA routing, nested routes, protected routes |
| Drag & Drop | dnd-kit | 6.x | Headless, accessible, touch-friendly |
| HTTP Client | Axios | 1.7 | Interceptors for auth token injection + 401 handling |
| Backend Framework | Gin | 1.12 | Fast, minimal Go HTTP framework |
| Language (BE) | Go | 1.25 | Concurrency primitives, static binary |
| ORM | GORM | 1.31 | Auto-migrate, soft deletes, preloading |
| Database | PostgreSQL | 16 | LISTEN/NOTIFY, partial unique indexes, MVCC |
| PG Driver | pgx/v5 | 5.8 | LISTEN/NOTIFY support for dedicated listener connection |
| Auth | JWT (HS256) | golang-jwt v5 | Stateless, self-contained tokens |
| Password Hashing | bcrypt | x/crypto | Adaptive cost factor |
| WebSocket | gorilla/websocket | 1.5 | Battle-tested WS library |
| Object Storage | Cloudflare R2 (S3 API) | aws-sdk-go-v2 | S3-compatible, egress-free |
| Reverse Proxy | Traefik | latest | Auto-discovery, Let's Encrypt built-in |
| Web Server | Nginx (alpine) | latest | SPA serving + API proxy |
| Container Runtime | Docker + Compose | — | Service orchestration |

---

## 3. Frontend

### Directory Structure

```
frontend/
├── src/
│   ├── api/
│   │   └── client.ts            # Axios instance + all API endpoint groups
│   ├── components/
│   │   ├── Layout.tsx           # App shell: sidebar nav, header, user menu
│   │   ├── ProductDetailModal.tsx # Product detail, comments, attachments (47 KB)
│   │   ├── CreateProductModal.tsx # New product form
│   │   ├── NotificationToast.tsx  # Floating toast with sender avatar + reply
│   │   ├── NotificationPanel.tsx  # Dropdown notification list
│   │   ├── ActivityPanel.tsx      # Activity feed panel
│   │   ├── ProfileModal.tsx       # Avatar upload + name edit
│   │   ├── MentionInput.tsx       # @mention-aware text input
│   │   └── SearchFilters.tsx      # Status / user / date filters
│   ├── hooks/
│   │   └── useWebSocket.ts      # WS connection, reconnect, event dispatch
│   ├── pages/
│   │   ├── kanban/KanbanBoard.tsx     # Main drag-and-drop board
│   │   ├── boards/ListView.tsx        # Tabular product list
│   │   ├── boards/TrashPage.tsx       # Soft-deleted products + restore
│   │   ├── chat/ChatPage.tsx          # Real-time team chat
│   │   ├── notifications/NotificationsPage.tsx
│   │   ├── activity/ActivityPage.tsx
│   │   ├── admin/AdminPanel.tsx       # User management (admin only)
│   │   └── auth/{LoginPage,RegisterPage}.tsx
│   ├── store/
│   │   ├── authStore.ts         # JWT token, user, role helpers (persisted)
│   │   ├── toastStore.ts        # Toast queue with auto-dismiss
│   │   └── themeStore.ts        # Dark / light theme toggle
│   ├── types/index.ts           # All shared TypeScript interfaces
│   ├── utils/sound.ts           # Web Audio API notification chime
│   └── App.tsx                  # Router + QueryClientProvider root
├── nginx.conf                   # Production nginx config
├── Dockerfile                   # Multi-stage build: node → nginx:alpine
├── vite.config.ts
└── tailwind.config.js
```

### Routing

```
/            → KanbanBoard       (protected)
/list        → ListView          (protected)
/chat        → ChatPage          (protected)
/activity    → ActivityPage      (protected)
/notifications → NotificationsPage (protected)
/admin       → AdminPanel        (admin only)
/trash       → TrashPage         (admin only)
/login       → LoginPage         (public)
/register    → RegisterPage      (public)
```

`ProtectedRoute` reads from `authStore` — if `token` is absent redirects to `/login`; if `adminOnly` and user is not admin, redirects to `/`.

### State Management

**authStore (Zustand + localStorage)**
```
token, user → persisted
isAdmin() / isManager() / isWorker() / canCreateProduct() / canDeleteProduct()
updateUser(user) → updates local state after profile edit
logout() → clears token + redirects
```

**toastStore (Zustand)**
```
toasts[]  → { id, message, content, type, link, senderName, entityType, entityId }
addToast() → auto-dismissed after 10 seconds
removeToast(id)
```

**React Query (server state)**
```
queryKey: ['products']        → staleTime 10s, refetch on WS event
queryKey: ['comments', id]    → refetch on comment_added WS event
queryKey: ['chat']            → refetch on chat_message WS event
queryKey: ['notifications']   → refetch on notification WS event
queryKey: ['unread-count']    → badge on nav
queryKey: ['products-deleted'] → TrashPage
```

### API Client (`src/api/client.ts`)

Single Axios instance at `VITE_API_URL` (baked at Vite build time).

**Interceptors:**
- Request → inject `Authorization: Bearer <token>` from authStore
- Response → on 401, call `logout()` + redirect to `/login`

**API Groups:**

| Export | Routes covered |
|---|---|
| `authApi` | `/auth/login`, `/auth/register`, `/auth/me` |
| `productsApi` | `/products` CRUD + `/products/deleted` + `/products/:id/restore` |
| `attachmentsApi` | Presign → PUT to R2 → Confirm pattern with progress callback |
| `commentsApi` | `/products/:id/comments` CRUD |
| `chatApi` | `/chat/messages` |
| `notificationsApi` | List, unread count, mark read, mark all read |
| `usersApi` | Admin user management |
| `profileApi` | Avatar presign + PATCH `/users/me` |
| `activityApi` | `/activity` |

### WebSocket Hook (`useWebSocket.ts`)

```
Connect: wss://<host>/api/ws?token=<jwt>
Auto-reconnect: 3 second timeout on close

Events handled:
  product_update / product_created / product_deleted
    → invalidate ['products']
  comment_added
    → invalidate ['comments'], ['products'], ['unread-count']
  attachment_uploaded
    → invalidate ['attachments'], ['products']
  chat_message
    → invalidate ['chat']
  notification
    → invalidate ['notifications'], ['unread-count']
    → addToast({ message, content, type, link, senderName })
    → playNotificationSound() via Web Audio API
```

### Frontend Dockerfile

```
node:18-alpine (build)
  ARG VITE_API_URL          ← baked at build time by Vite
  ENV VITE_API_URL=$VITE_API_URL
  npm ci && npm run build

nginx:alpine (runtime)
  copy dist/ → /usr/share/nginx/html
  copy nginx.conf
```

---

## 4. Backend

### Directory Structure

```
backend/
├── cmd/main.go              # Entry point & service wiring
├── config/config.go         # Env-var config struct
├── database/
│   ├── database.go          # PG init, AutoMigrate, seed roles
│   ├── notify.go            # EmitBroadcast / EmitBroadcastExcept / EmitToUser
│   └── listener.go          # pgx LISTEN goroutine with Dispatcher callback
├── internal/
│   ├── api/
│   │   ├── router.go        # All routes + middleware stack
│   │   └── handlers/
│   │       ├── ws_hub.go           # WebSocket hub (channel-based, race-free)
│   │       ├── auth_handler.go     # Register, Login, GetMe, NotifyStatusChange
│   │       ├── product_handler.go  # Product CRUD + trash + restore
│   │       ├── comment_handler.go  # Comment CRUD
│   │       ├── chat_handler.go     # Chat send + list
│   │       ├── attachment_handler.go # Presign, Confirm, Download, Delete
│   │       ├── notification_handler.go
│   │       ├── activity_handler.go
│   │       └── user_handler.go     # Admin user CRUD + avatar presign
│   ├── middleware/
│   │   ├── auth_middleware.go      # JWT validate → inject user_id, role, name
│   │   ├── rbac_middleware.go      # Role gate: admin / manager / worker
│   │   ├── rate_limit_middleware.go # 10 req/min per IP on auth routes
│   │   └── body_limit_middleware.go # 2 MB cap on JSON bodies
│   ├── models/              # GORM structs (see Database section)
│   └── services/
│       ├── product_service.go      # CRUD, soft-delete, grace period, purge
│       ├── notification_service.go # Create, broadcast via pg_notify
│       ├── chat_service.go         # Create + EmitBroadcast for chat
│       ├── user_service.go         # CRUD + avatar URL generation
│       ├── comment_service.go      # CRUD
│       ├── attachment_service.go   # CRUD
│       ├── activity_service.go     # Log + fetch
│       └── s3_service.go           # R2 presigned PUT / GET / DELETE
├── Dockerfile
├── go.mod
└── go.sum
```

### Startup Sequence (`cmd/main.go`)

```
1. godotenv.Load()              → load .env if present
2. config.Load()                → read all env vars
3. database.Init(DATABASE_URL)  → connect PG, AutoMigrate, seed roles
4. services.InitR2(cfg)         → init S3/R2 client
5. go handlers.Hub.Run()        → start WS hub goroutine
6. database.StartListener(...)  → start pgx LISTEN goroutine with dispatcher
7. go purgeLoop()               → purge expired trash every 6 hours
8. router.Run(:PORT)            → start Gin HTTP server
```

### API Routes

```
PUBLIC (rate-limited 10 req/min per IP)
  POST  /api/auth/register
  POST  /api/auth/login

UNAUTHED
  GET   /api/health

PROTECTED (JWT required)
  GET   /api/auth/me
  GET   /api/ws                         WebSocket

  Products
  GET   /api/products                   list (status/search/date/user filters)
  GET   /api/products/:id
  POST  /api/products                   admin, manager
  PUT   /api/products/:id               admin, manager
  PATCH /api/products/:id/status        all (workers: limited transitions)
  DELETE /api/products/:id              admin
  GET   /api/products/deleted           admin (trash)
  POST  /api/products/:id/restore       admin

  Attachments
  GET   /api/products/:id/attachments
  GET   /api/products/:id/attachments/presign
  POST  /api/products/:id/attachments/confirm
  GET   /api/attachments/:id/download
  DELETE /api/attachments/:id           admin, manager

  Comments
  GET   /api/products/:id/comments
  POST  /api/products/:id/comments
  PUT   /api/comments/:id
  DELETE /api/comments/:id

  Chat
  GET   /api/chat/messages
  POST  /api/chat/messages

  Notifications
  GET   /api/notifications
  GET   /api/notifications/unread-count
  PATCH /api/notifications/:id/read
  POST  /api/notifications/read-all

  Profile
  GET   /api/users/me/avatar-presign
  PATCH /api/users/me

  Users (admin only)
  GET   /api/users
  GET   /api/users/list
  POST  /api/users
  PATCH /api/users/:id/role
  DELETE /api/users/:id

  Activity
  GET   /api/activity
```

### WebSocket Hub (`handlers/ws_hub.go`)

Single goroutine owns the `clients` map — no mutex needed.

```
Channels:
  register        chan *WSClient          → add new connection
  unregister      chan *WSClient          → remove on disconnect
  broadcast       chan []byte             → send to ALL clients
  sendDirect      chan directMsg          → send to specific userID
  broadcastExcept chan excludeMsg         → send to all except one userID

Public methods:
  Hub.BroadcastMessage(msg []byte)
  Hub.SendToUser(userID uint, msg []byte)
  Hub.BroadcastExcept(excludeID uint, msg []byte)
```

Slow clients (full send buffer) are immediately disconnected to prevent hub blocking.

### Middleware Stack

```
All routes:
  cors.New(whitelist origins)     → CORS headers
  MaxBodySize(2MB)                → reject large JSON

Auth routes only:
  RateLimitAuth()                 → 10 req/min per IP (in-memory token bucket)

Protected routes:
  AuthMiddleware(cfg)             → JWT validate, inject user_id/role/name to ctx

Admin-only routes:
  RBACMiddleware("admin")         → role check

Admin+Manager routes:
  RBACMiddleware("admin","manager")
```

### Backend Dockerfile

```dockerfile
FROM golang:1.24-alpine AS builder
  CGO_ENABLED=0          ← pure-Go postgres driver, no gcc needed
  -ldflags="-s -w"       ← strip debug symbols (~40% smaller binary)
  go build ./cmd/main.go

FROM gcr.io/distroless/static-debian12
  # No shell, no package manager, no attack surface
  COPY server .
  CMD ["./server"]
```

---

## 5. Database

### Schema

```
roles
  id PK, name UNIQUE

users
  id PK, name, email UNIQUE, password, role_id FK→roles, avatar_key, created_at

products
  id PK
  product_id   UNIQUE WHERE deleted_at IS NULL   ← Postgres partial unique index
  customer_name, customer_phone, description
  status       DEFAULT 'yet_to_start'
  created_by   FK→users
  deleted_by   DEFAULT 0
  created_at
  deleted_at   (GORM soft delete — NULL = active)

attachments
  id PK, product_id FK→products, file_path (R2 key), file_name, file_type,
  file_size, uploaded_by FK→users, uploaded_at

comments
  id PK, product_id FK→products, user_id FK→users, message, created_at, updated_at

chat_messages
  id PK, user_id FK→users, message, created_at

notifications
  id PK, user_id FK→users, message, type, entity_type, entity_id,
  content, sender_name, is_read DEFAULT false, created_at

activity_logs
  id PK, user_id FK→users, action, entity, entity_id, details, created_at
  INDEX (entity, created_at)
```

### Product Status Machine

```
yet_to_start ──→ working ──→ review ──→ done
      ↑              ↓          ↓
      └──────────────┘          │
                                ↓
                             working

Admin/Manager: any transition
Worker: only arrows shown above
```

### Soft Delete Pattern

When a product is deleted:
- GORM sets `deleted_at = NOW()`
- All normal queries automatically filter `deleted_at IS NULL` (GORM default scope)
- `DB.Unscoped()` accesses soft-deleted rows
- The **Postgres partial unique index** (`WHERE deleted_at IS NULL`) releases the `product_id` uniqueness constraint immediately — no ID mangling needed
- `IsProductIDTaken()` also checks soft-deleted rows within the 10-day grace period to block reuse
- After 10 days: background goroutine (every 6 hours) hard-deletes expired rows

### Connection Pool Configuration

```go
SetMaxOpenConns(25)          // max concurrent connections
SetMaxIdleConns(5)           // connections kept warm
SetConnMaxLifetime(30 min)   // recycle connections
SetConnMaxIdleTime(5 min)    // release idle connections
```

### GORM AutoMigrate

Runs on every startup — idempotent. Creates tables and indexes, never drops columns. Seed data for roles inserted via `FirstOrCreate`.

---

## 6. Real-time System

### Architecture: PostgreSQL LISTEN/NOTIFY

All WebSocket events are routed through PostgreSQL, making the system multi-instance safe.

```
Handler (any instance)
    │
    ├── database.EmitBroadcast(msg)
    ├── database.EmitBroadcastExcept(excludeID, msg)
    └── database.EmitToUser(userID, msg)
         │
         │  SELECT pg_notify('kanban_realtime', jsonPayload)
         ▼
    PostgreSQL
         │
         │  LISTEN kanban_realtime
         ▼
    pgx listener goroutine (dedicated connection, each backend instance)
         │
         ├── event_type: "broadcast"         → Hub.BroadcastMessage(msg)
         ├── event_type: "broadcast_except"  → Hub.BroadcastExcept(excludeID, msg)
         └── event_type: "user"              → Hub.SendToUser(userID, msg)
                  │
                  ▼
          WebSocket clients (connected to THIS instance)
```

**Event Payload Schema:**
```json
{
  "event_type": "broadcast | broadcast_except | user",
  "exclude_id": 5,
  "user_id": 12,
  "ws_msg": "{\"type\":\"...\", \"payload\":{...}}"
}
```

**Listener reconnect:** If the pgx LISTEN connection drops, the goroutine automatically reconnects after 5 seconds.

### WebSocket Message Types

| Type | Broadcast Mode | Frontend Action |
|---|---|---|
| `product_created` | broadcast | Invalidate `['products']` |
| `product_update` | broadcast | Invalidate `['products']` |
| `product_deleted` | broadcast | Invalidate `['products']` |
| `comment_added` | broadcast | Invalidate `['comments']`, `['products']` |
| `attachment_uploaded` | broadcast | Invalidate `['attachments']`, `['products']` |
| `chat_message` | broadcast | Invalidate `['chat']` |
| `notification` | user / broadcast_except | Invalidate `['notifications']`, show toast |

### Notification System

Every notification is:
1. **Persisted** to the `notifications` table with `content` and `sender_name`
2. **Delivered** in real-time via pg_notify → WS hub → toast on client
3. **Viewable** later in the Notifications page

Notification triggers:
- Product created, status changed
- Comment added, @mention in comment
- Attachment uploaded
- @mention in team chat

---

## 7. File Storage

### Presigned URL Flow (Cloudflare R2)

```
Frontend                  Backend              R2 / S3
   │                         │                    │
   │── GET /attachments/presign?filename=x.pdf ──▶│
   │                         │                    │
   │◀── { upload_url, s3_key, content_type } ─────│
   │                         │                    │
   │──────── PUT upload_url (file bytes) ──────────────────────▶│
   │         (bypasses backend entirely)           │            │
   │◀──────── 200 OK ──────────────────────────────────────────│
   │                         │                    │
   │── POST /attachments/confirm { s3_key } ──────▶│
   │                         │── INSERT attachment ─▶ DB       │
   │                         │── pg_notify(attachment_uploaded) │
   │◀── attachment record ───│                    │
```

**Key properties:**
- Upload URL valid for 10 minutes, view URLs 60 minutes, download URLs 15 minutes
- Files never transit the backend (bandwidth efficient)
- Frontend tracks upload progress via `onUploadProgress`
- Supports upload cancellation via `AbortController`

### Storage Paths

```
attachments/{productId}/{uuid8}_{YYYYMMDD}.{ext}   ← file attachments
avatars/{userId}/{uuid}.{ext}                       ← user avatars
```

### Avatar Flow

1. Frontend: `GET /api/users/me/avatar-presign?filename=photo.jpg`
2. Backend: returns presigned PUT URL
3. Frontend: PUT directly to R2 + `PATCH /api/users/me { avatar_key }`
4. Backend: stores `avatar_key` (not the URL) in DB
5. On `GET /auth/me`: backend generates fresh presigned view URL (60 min expiry) from stored key
6. Frontend: stores `avatar_url` in persisted authStore — falls back to initials on `onError`

---

## 8. Authentication & Authorization

### JWT Structure

```json
{
  "user_id": 1,
  "email": "admin@example.com",
  "name": "Alice",
  "role_id": 1,
  "role": "admin",
  "exp": 1234567890
}
```

Token lifetime: 72 hours. Signed with HS256.

### RBAC

| Permission | Admin | Manager | Worker |
|---|:---:|:---:|:---:|
| Create product | ✓ | ✓ | |
| Edit product | ✓ | ✓ | |
| Delete product | ✓ | | |
| Restore from trash | ✓ | | |
| View trash | ✓ | | |
| All status transitions | ✓ | ✓ | |
| Limited status transitions | ✓ | ✓ | ✓ |
| Add comment | ✓ | ✓ | ✓ |
| Upload attachment | ✓ | ✓ | ✓ |
| Delete attachment | ✓ | ✓ | |
| Manage users / roles | ✓ | | |

**Worker allowed transitions:** `yet_to_start → working`, `working → review`, `working → yet_to_start`, `review → working`

### First User

The first user to register is automatically assigned the `admin` role. All subsequent registrations default to `worker`.

---

## 9. Infrastructure & Deployment

### docker-compose.yml — Services

```
┌─────────────────────────────────────────────────────────────────┐
│  kanban-traefik                                                  │
│  image: traefik:latest                                           │
│  ports: 80, 443                                                  │
│  • HTTP-01 ACME challenge (Let's Encrypt)                        │
│  • Global HTTP → HTTPS redirect                                  │
│  • Routes by Host header                                         │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  kanban-postgres                                                 │
│  image: postgres:16-alpine                                       │
│  volume: postgres-data                                           │
│  healthcheck: pg_isready every 10s                               │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  kanban-backend                                                  │
│  build: ./backend (distroless, ~15 MB)                           │
│  depends_on: postgres (service_healthy)                          │
│  healthcheck: wget /api/health every 15s                         │
│  env: DATABASE_URL, JWT_SECRET, R2_*, CORS_ORIGINS              │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│  kanban-frontend                                                 │
│  build: ./frontend (nginx:alpine)                                │
│  build-arg: VITE_API_URL (baked into JS bundle)                  │
│  depends_on: backend                                             │
│  Traefik label: Host(`app.santoshdevops.cloud`)                  │
└─────────────────────────────────────────────────────────────────┘

Volumes:  postgres-data, letsencrypt-data
Network:  kanban-net (bridge)
```

### Environment Variables

| Variable | Required | Description |
|---|:---:|---|
| `ACME_EMAIL` | ✓ | Let's Encrypt expiry notifications |
| `POSTGRES_DB` | ✓ | Database name |
| `POSTGRES_USER` | ✓ | Database user |
| `POSTGRES_PASSWORD` | ✓ | Database password |
| `JWT_SECRET` | ✓ | JWT signing key (min 32 chars) |
| `R2_BUCKET` | ✓ | Cloudflare R2 bucket name |
| `R2_ACCOUNT_ID` | ✓ | Cloudflare account ID |
| `R2_ACCESS_KEY` | ✓ | R2 API access key |
| `R2_SECRET_KEY` | ✓ | R2 API secret key |
| `R2_ENDPOINT` | | Auto-built from account ID if omitted |

### DNS Requirements

```
app.santoshdevops.cloud     A   <server-ip>   ← app
traefik.santoshdevops.cloud A   <server-ip>   ← dashboard (optional)
```

### Deploy

```bash
# First deploy
cp .env.example .env && nano .env    # fill in all values
docker compose up -d --build

# Update
git pull
docker compose up -d --build --no-deps backend   # backend only
docker compose up -d --build --no-deps frontend  # frontend only

# Logs
docker compose logs traefik -f   # cert issuance
docker compose logs backend -f   # app logs
```

---

## 10. Data Flow Diagrams

### Product Status Change

```
User drags card on KanbanBoard
  │
  ├── PATCH /api/products/:id/status { status: "review" }
  │     │
  │     ├── Validate role + allowed transition
  │     ├── UPDATE products SET status = 'review'
  │     ├── INSERT activity_logs
  │     ├── INSERT notifications (all users except sender)
  │     ├── SELECT pg_notify('kanban_realtime', broadcast_msg)
  │     └── SELECT pg_notify('kanban_realtime', broadcast_except_notif_msg)
  │
  └── Response 200 { updated product }

PostgreSQL pg_notify fires
  │
  └── Listener goroutine receives on all backend instances
        │
        ├── Hub.BroadcastMessage(product_update_ws_msg)
        │     └── All WS clients → invalidate ['products']
        │         → KanbanBoard re-renders with new column
        │
        └── Hub.BroadcastExcept(senderID, notification_ws_msg)
              └── All other users' WS clients
                  → invalidate ['notifications'], ['unread-count']
                  → addToast("Alice moved PRD-001 from working to review")
```

### Comment with @mention

```
User types "@Bob Great work!" and submits
  │
  ├── POST /api/products/:id/comments { message: "@[Bob] Great work!" }
  │     │
  │     ├── INSERT comments
  │     ├── Re-fetch comment with user preloaded
  │     ├── INSERT activity_logs (entity: "comment")
  │     ├── CreateNotificationForAllExcept (persist + pg_notify broadcast_except)
  │     ├── NotifyMentions → find Bob by name
  │     │     └── CreateNotificationForUser(Bob, mention) → pg_notify user
  │     └── EmitBroadcast(comment_added WS event)
  │
PostgreSQL fires multiple pg_notify
  │
  ├── broadcast(comment_added) → all clients invalidate ['comments'] → comment list refreshes
  ├── broadcast_except(sender, notification) → everyone sees toast
  └── user(Bob, mention_notification) → Bob gets special "you were mentioned" toast
```

---

## 11. Key Design Decisions

### PostgreSQL over SQLite
SQLite needed WAL mode, a single-writer connection pool (`MaxOpenConns=1`), and ID-mangling hacks for soft deletes. PostgreSQL gives true MVCC, LISTEN/NOTIFY for multi-instance real-time, and partial unique indexes that eliminate the mangling entirely.

### Partial Unique Index for Soft Delete
```sql
-- Postgres partial index: only enforced while the row is active
CREATE UNIQUE INDEX udx_product_id_active
  ON products (product_id)
  WHERE deleted_at IS NULL;
```
Deleting a product automatically releases its `product_id` slot. Restoring re-acquires it. No ID mangling, no `original_id` column needed.

### LISTEN/NOTIFY for WebSocket Dispatch
Instead of calling `Hub.BroadcastMessage()` directly from handlers, all events go through `pg_notify`. The pgx listener goroutine receives events and forwards to the Hub. This means every backend instance gets every event — horizontal scaling works without a Redis pub/sub layer.

### Presigned URLs for File Uploads
Files go directly from browser to R2, never through the backend. This removes the backend as a bottleneck for large uploads, provides real upload progress to the user, and the backend storage cost is zero.

### `Content` and `SenderName` in Notification model
Both fields are stored in the DB (not just sent over WS). This means the notification panel can show rich context — who sent it and what the message said — even for notifications received while offline.

### Distroless Runtime Image
`gcr.io/distroless/static-debian12` contains only the Go binary and TLS certificates. No shell, no package manager, no curl. Reduces the CVE surface to near zero and the image size to ~15 MB.

### Single-Goroutine WebSocket Hub
The `clients` map is owned exclusively by the `Run()` goroutine. All other goroutines communicate through buffered channels. This is a deliberate design to avoid mutexes — there's no way to get a race condition on the map because only one goroutine ever reads or writes it.

### Zustand over Redux
For auth and toast state the app needs simple, synchronous updates with localStorage persistence. Zustand achieves this in ~30 lines per store. Redux would add 10× the boilerplate for the same outcome.
