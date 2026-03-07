# KanbanFlow — Documentation

## Table of Contents

- [Environment Variables](#environment-variables)
- [Cloudflare R2 Storage](#cloudflare-r2-storage)
- [Production Deployment](#production-deployment)
- [Architecture](#architecture)

---

## Environment Variables

### Backend (`backend/.env`)

| Variable        | Required   | Default                | Description                                            |
| --------------- | ---------- | ---------------------- | ------------------------------------------------------ |
| `PORT`          | No         | `8080`                 | Server port                                            |
| `JWT_SECRET`    | **Yes**    | `kanban-secret-key...` | JWT signing key — **change in production**             |
| `DB_PATH`       | No         | `./data/kanban.db`     | SQLite database path                                   |
| `UPLOAD_DIR`    | No         | `./uploads`            | Local upload directory (only used when R2 is disabled) |
| `R2_ENABLED`    | No         | `false`                | Enable Cloudflare R2 storage                           |
| `R2_BUCKET`     | When R2 on | —                      | R2 bucket name                                         |
| `R2_ACCOUNT_ID` | When R2 on | —                      | Cloudflare account ID (found in dashboard URL)         |
| `R2_ACCESS_KEY` | When R2 on | —                      | R2 API token access key                                |
| `R2_SECRET_KEY` | When R2 on | —                      | R2 API token secret key                                |
| `R2_ENDPOINT`   | No         | Auto-built             | Override R2 endpoint (auto-built from account ID)      |

**Example `.env`:**

```env
JWT_SECRET=your-secure-random-string-here
DB_PATH=./data/kanban.db

CORS_ORIGINS=https://your-app.pages.dev,https://yourdomain.com
R2_ENABLED=true
R2_BUCKET=your-bucket-name
R2_ACCOUNT_ID=7fef758b83150d68cbd0628094f31716
R2_ACCESS_KEY=your-r2-access-key
R2_SECRET_KEY=your-r2-secret-key
```

# backend/.env

CORS_ORIGINS=https://your-app.pages.dev,https://yourdomain.com

# frontend/.env (or Cloudflare Pages env vars)

VITE_API_URL=https://your-backend-server.com/api

### Frontend

The frontend has **no environment variables**. It communicates with the backend via `/api` proxy (dev) or nginx (production). The upload mode (R2 vs local) is auto-detected from the backend response.

---

## Cloudflare R2 Storage

### How It Works

```
Upload Flow:
1. Frontend → GET /api/products/:id/attachments/presign?filename=photo.png
2. Backend generates presigned PUT URL (10 min expiry) → returns to frontend
3. Frontend uploads file directly to R2 using presigned URL
4. Frontend → POST /api/products/:id/attachments/confirm (saves record in DB)

Download Flow:
1. Frontend → GET /api/attachments/:id/download
2. Backend generates presigned GET URL (15 min expiry) → 307 redirect to R2

Image Preview:
1. Backend returns `view_url` (presigned GET, 60 min expiry) with attachment data
2. Frontend uses `view_url` for <img> src
```

### Setting Up R2

#### 1. Create R2 Bucket

- Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2** → **Create bucket**
- Name it (e.g., `kanban-uploads`)
- Select a location hint closest to your server

#### 2. Create API Token

- **R2** → **Manage R2 API Tokens** → **Create API token**
- Permissions: **Object Read & Write**
- Specify bucket: select your bucket
- Click **Create** → copy **Access Key ID** and **Secret Access Key**

#### 3. Add CORS Policy

Go to your bucket → **Settings** → **CORS Policy** → Add:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

> [!WARNING]
> `"AllowedOrigins": ["*"]` allows any website to upload. See [Production Changes](#cors) below.

#### 4. Find Your Account ID

Your Cloudflare Account ID is in the dashboard URL:

```
https://dash.cloudflare.com/7fef758b83150d68cbd0628094f31716/r2
                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                              This is your Account ID
```

#### 5. Update `.env`

```env
R2_ENABLED=true
R2_BUCKET=kanban-uploads
R2_ACCOUNT_ID=7fef758b83150d68cbd0628094f31716
R2_ACCESS_KEY=your-access-key
R2_SECRET_KEY=your-secret-key
```

---

## Production Deployment

### CORS

Lock down R2 CORS to your domain only:

```json
[
  {
    "AllowedOrigins": ["https://yourdomain.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 86400
  }
]
```

Changes from development:

- `AllowedOrigins`: restricted to your domain
- `AllowedMethods`: removed `POST` and `DELETE` (presigned URLs only use `GET`/`PUT`)
- `AllowedHeaders`: restricted to `Content-Type` only
- `MaxAgeSeconds`: increased to 24h (reduces preflight requests)

### JWT Secret

Generate a strong random secret:

```bash
openssl rand -hex 32
```

Set it in your `.env` or Docker environment:

```env
JWT_SECRET=a1b2c3d4e5f6... (64-char hex string)
```

### Gin Mode

Set Gin to release mode to disable debug logging:

```env
GIN_MODE=release
```

### Docker Compose (Production)

```yaml
services:
  backend:
    environment:
      - GIN_MODE=release
      - JWT_SECRET=${JWT_SECRET}
      - DB_PATH=/data/kanban.db
      - R2_ENABLED=true
      - R2_BUCKET=${R2_BUCKET}
      - R2_ACCOUNT_ID=${R2_ACCOUNT_ID}
      - R2_ACCESS_KEY=${R2_ACCESS_KEY}
      - R2_SECRET_KEY=${R2_SECRET_KEY}
    volumes:
      - db_data:/data # Only SQLite, no uploads volume needed with R2
```

### SQLite Best Practices (Already Applied)

The app auto-configures these on startup:

| Setting        | Value  | Why                         |
| -------------- | ------ | --------------------------- |
| `journal_mode` | WAL    | Concurrent reads + writes   |
| `busy_timeout` | 5000ms | Prevents SQLITE_BUSY errors |
| `synchronous`  | NORMAL | 2-5× faster writes          |
| `foreign_keys` | ON     | Data integrity              |
| `cache_size`   | 64MB   | Faster queries              |
| `mmap_size`    | 256MB  | Memory-mapped I/O           |

### Security Checklist

- [ ] Change `JWT_SECRET` from default
- [ ] Set `GIN_MODE=release`
- [ ] Lock down R2 CORS to your domain
- [ ] Use HTTPS (via nginx/Cloudflare)
- [ ] R2 bucket: block public access (presigned URLs handle auth)
- [ ] R2 API token: scoped to single bucket, read+write only
- [ ] Add `.env` to `.gitignore` (already done)
- [ ] Set `AllowOrigins` in Gin CORS config to your domain (currently `*`)

---

## Architecture

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Frontend   │      │   Backend    │      │ Cloudflare   │
│  React + TS  │─────▶│  Go + Gin    │      │     R2       │
│  Port 3000   │      │  Port 8080   │      │              │
└──────┬───────┘      └──────┬───────┘      └──────────────┘
       │                     │                      ▲
       │  Presigned URL      │  Generate URL        │
       │◀────────────────────│                      │
       │                     │                      │
       │  Direct PUT ───────────────────────────────│
       │                     │                      │
       │                     │                      │
       │              ┌──────┴───────┐              │
       │              │   SQLite DB  │              │
       │              │  (metadata)  │              │
       │              └──────────────┘              │
```

### Roles

| Role        | Products               | Attachments   | Comments | Users      |
| ----------- | ---------------------- | ------------- | -------- | ---------- |
| **Admin**   | CRUD + status          | Upload/Delete | CRUD own | Manage all |
| **Manager** | Create + edit + status | Upload/Delete | CRUD own | —          |
| **Worker**  | View + status          | Upload        | CRUD own | —          |

First registered user is automatically **Admin**.
