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
**Hardware: Oracle Cloud Always-Free — 2 vCPU, 1 GB RAM. Extremely constrained. Never run memory-heavy operations (large builds, multiple concurrent processes, heavy DB queries) on the server. Build frontend locally and rsync the dist.**
App dir on server: `/home/retrynote/app`
Services: `retrynote-api` (uvicorn, port 8001, **1 worker**), `retrynote-worker` (celery)

**Critical: uvicorn MUST run with `--workers 1`.** With 2 workers, AI API calls (Gemini/OpenAI SDK imports + HTTP) cause memory pressure on the 1GB server, and the kernel SIGKILL-s worker processes silently. The systemd service file (`/etc/systemd/system/retrynote-api.service`) controls this — the deploy workflow does NOT overwrite it.

## Secrets & Environment

All secrets injected via **Doppler** (`--project retrynote --config prd`) — no `.env` file needed.
Doppler is pre-configured on the server for the `retrynote` user via service token at `/home/retrynote/.doppler/service-token`.

### Running Commands on Server with Doppler

To execute Python scripts or commands on the server that need Doppler secrets:

```bash
# SSH to server
ssh -i ~/.ssh/oracle.key ubuntu@134.185.101.134

# Run as retrynote user with Doppler secrets
sudo -u retrynote bash << 'SHELL'
cd /home/retrynote/app/backend
TOKEN=$(cat /home/retrynote/.doppler/service-token | sed 's/DOPPLER_TOKEN=//')
doppler run --project retrynote --config prd -t $TOKEN -- /path/to/script.py
SHELL
```

**Why this is needed:**
- Doppler service token is readable only by `retrynote` user (mode 600)
- Systemd services use `EnvironmentFile=/home/retrynote/.doppler/service-token` to load token
- Direct `doppler run` without token export fails with "you must provide a token"

### Key env vars (injected by Doppler):
- `ADMIN_MASTER_PASSWORD` — admin panel master password
- `DATABASE_URL` — PostgreSQL async connection string (note: lowercase `database_url` in Python Settings)
- `JWT_SECRET_KEY` — JWT signing key
- Other config in app/config.py

## Stack

- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL + Redis + Celery
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Migrations**: Alembic (`cd backend && alembic upgrade head`)
- **Package manager (backend)**: `uv` (`uv sync`) — note: not available globally on server, but managed via systemd service

### Backend Environment Details

**Python & Virtual Environment:**
- Server: Python 3.12
- Venv location: `/home/retrynote/app/backend/.venv/bin/`
- Never globally installed; only available in venv and via systemd services
- Direct Python execution requires venv activation or explicit venv binary path

**Systemd Services:**
- `retrynote-api` — FastAPI app via uvicorn on port 8001
  - ExecStart: `doppler run ... -- /home/retrynote/app/backend/.venv/bin/uvicorn app.main:app`
  - User: `retrynote`
  - EnvironmentFile: `/home/retrynote/.doppler/service-token` (loads `DOPPLER_TOKEN`)
- `retrynote-worker` — Celery worker
  - Similar setup with Doppler token injection

**Accessing Config from Python Scripts:**
- Settings class in `app/config.py` uses lowercase attribute names: `settings.database_url` (not `DATABASE_URL`)
- All Doppler-injected env vars are automatically available to Python when `doppler run` is used

## Alembic Migration Workaround

Alembic CLI (`alembic upgrade head`) fails on the server due to a DB password parsing issue in `env.py`'s separate engine creation. **Use the app's own engine instead:**

```bash
ssh -i ~/.ssh/oracle.key ubuntu@134.185.101.134
sudo -u retrynote bash << 'SHELL'
cd /home/retrynote/app/backend
TOKEN=$(cat /home/retrynote/.doppler/service-token | sed 's/DOPPLER_TOKEN=//')
doppler run --project retrynote --config prd -t $TOKEN -- .venv/bin/python3 -c "
import asyncio
from app.database import engine, Base
from app.models import *
async def create():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    print('Tables created successfully')
asyncio.run(create())
"
SHELL
```

**Note:** This uses `create_all` (additive — won't drop existing tables) rather than alembic migrations. For column alterations or drops, fix the alembic env.py password handling first.

## Admin Auth Flow

Master password verification: `POST /admin/login/verify-master`
- If no hash in DB and `ADMIN_MASTER_PASSWORD` env is set → auto-initializes hash from env, then verifies
- If no hash and no env var → only `super_admin` role can set it on first use
- On success → returns `admin_token` (JWT, 30 min), stored as `X-Admin-Token` header

## LSP Diagnostics

**Always run `mcp_lsp_diagnostics` on specific changed files, never on the full directory.**

Full directory scan hits a 50-file cap and takes ~25s. Per-file checks are <1s once the LSP is warm.

```python
# ✅ Correct — check only the files you touched
mcp_lsp_diagnostics("/home/oh/dev/retrynote/backend/app/api/auth.py")
mcp_lsp_diagnostics("/home/oh/dev/retrynote/backend/app/services/quiz.py")

# ❌ Wrong — slow, hits 50-file cap, misses files beyond the cap
mcp_lsp_diagnostics("/home/oh/dev/retrynote/backend")
```

If you edited multiple files, call `mcp_lsp_diagnostics` on each one individually (in parallel if independent).

## Dev DB (local SQLite)

```bash
cd backend && python init_dev_db.py
# Creates: admin / admin123 (role: admin)
```
