# RetryNote — Agent Memory

## Deployment

**Edit locally → commit → push to `main` → GitHub Actions deploys automatically.**

`.github/workflows/deploy.yml` triggers on every push to `main` and:
1. Builds the React frontend (`VITE_API_URL=https://retrynote.cloud/api`)
2. Deploys nginx config (`nginx/retrynote.conf`, `nginx/rate-limiting.conf`)
3. rsyncs frontend dist to `/home/retrynote/frontend/dist/` on the server
4. SSH: pulls latest code, runs `uv sync`, runs `alembic upgrade head`, restarts services
5. Health-checks `http://127.0.0.1:8001/health`, then reloads nginx

Server: `ubuntu@134.185.101.134` (SSH key: `~/.ssh/oracle.key`)
App dir on server: `/home/retrynote/app`
Services: `retrynote-api` (uvicorn, port 8001), `retrynote-worker` (celery)

## Secrets

All secrets injected via **Doppler** (`--project retrynote --config prd`) — no `.env` file needed.
Doppler is pre-configured on the server for the `retrynote` user.

Key env vars:
- `ADMIN_MASTER_PASSWORD` — admin panel master password (set in Doppler)
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET_KEY` — JWT signing key

## Stack

- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL + Redis + Celery
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Migrations**: Alembic (`cd backend && alembic upgrade head`)
- **Package manager (backend)**: `uv` (`uv sync --no-dev`)

## Admin Auth Flow

Master password verification: `POST /admin/login/verify-master`
- If no hash in DB and `ADMIN_MASTER_PASSWORD` env is set → auto-initializes hash from env, then verifies
- If no hash and no env var → only `super_admin` role can set it on first use
- On success → returns `admin_token` (JWT, 30 min), stored as `X-Admin-Token` header

## Dev DB (local SQLite)

```bash
cd backend && python init_dev_db.py
# Creates: admin / admin123 (role: admin)
```
