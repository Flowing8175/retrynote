# RetryNote — Agent Memory

## README Maintenance

**After any effective change, update `README.md` to reflect reality.** The README is the canonical reference for humans and agents alike — keep it accurate.

What counts as an effective change:
- Adding, renaming, or removing API routes (`app/api/`, `app/main.py`)
- Adding or removing env vars (`app/config.py`)
- Changing default values in `app/config.py`
- Restructuring backend or frontend directories
- Changing the package manager, build tool, or dev workflow
- Adding new integrations (storage, billing, OCR, etc.)

Update the relevant sections only (don't rewrite the whole file). Sections most likely to drift: **Environment Variables**, **API Documentation**, **Project Structure**, **Local Development Setup**.

## Deployment

**Edit locally → commit → push to `main` → GitHub Actions deploys automatically.**

`.github/workflows/deploy.yml` triggers on every push to `main` and:
1. Builds the React frontend (`VITE_API_URL=https://retrynote.cloud/api`)
2. Deploys nginx config (`nginx/retrynote.conf`, `nginx/rate-limiting.conf`)
3. rsyncs frontend dist to `/home/retrynote/frontend/dist/` on the server
4. SSH: pulls latest code, runs `uv sync`, runs `alembic upgrade head`, restarts services
5. Health-checks `http://127.0.0.1:8001/health`, then reloads nginx

Server: `ubuntu@161.33.181.97` (SSH key: `~/.ssh/oracle.key`)
**Hardware: Oracle Cloud — 4 OCPU (8 vCPU), 24 GB RAM.** Comfortable headroom for backend + worker + Postgres + Redis on a single box. Frontend is still built in CI (faster, deterministic) and rsynced to the server.
App dir on server: `/home/retrynote/app`
Services: `retrynote-api` (uvicorn, port 8001, **8 workers**), `retrynote-worker` (celery, **concurrency 8**)

**Worker sizing rationale.** Each uvicorn/celery worker imports the OpenAI/Gemini/Anthropic SDKs and resolves to ~150-200 MB resident. 8 + 8 workers ≈ 3 GB, leaving >20 GB for OS, Postgres, Redis, OCR, and request buffers. Worker counts are pinned to vCPU count (8) — bumping further yields no throughput on this mostly-async workload and just burns RAM. The systemd service files (`/etc/systemd/system/retrynote-api.service`, `retrynote-worker.service`) control this — the deploy workflow does NOT overwrite them.

> **History note.** Pre-2026-05 the box was Always-Free (2 vCPU / 1 GB) and uvicorn was hard-pinned to `--workers 1` because AI SDK memory caused silent SIGKILLs. That constraint no longer applies; see `git log -- systemd/` for the bump.

## Secrets & Environment

All secrets injected via **Doppler** (`--project retrynote --config prd`) — no `.env` file needed.
Doppler is pre-configured on the server for the `retrynote` user via service token at `/home/retrynote/.doppler/service-token`.

### Running Commands on Server with Doppler

To execute Python scripts or commands on the server that need Doppler secrets:

```bash
# SSH to server
ssh -i ~/.ssh/oracle.key ubuntu@161.33.181.97

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
ssh -i ~/.ssh/oracle.key ubuntu@161.33.181.97
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
- On success → returns `admin_token` (JWT, 30 min, includes `iat` + `jti` claims), stored as `X-Admin-Token` header
- Every attempt (success / failure / denied) is recorded in `admin_audit_logs` with action types `admin_login_success` / `admin_login_failed` / `admin_login_denied`

## Admin Audit Logging

All admin-mutating endpoints AND sensitive read endpoints (audit-log views, DB diagnostics, CSV exports) write to `admin_audit_logs` via `app.utils.admin_audit.record_admin_action(...)`. Each row captures: actor (id/email/role snapshot), target (user/job/announcement/etc.), action_type, IP, user-agent, request method+path, X-Request-ID, success flag, and a payload_json with before/after values where relevant. Use this helper from new admin code instead of writing `AdminAuditLog` rows by hand. The `GET /admin/audit-logs` endpoint accepts `action_type`, `admin_user_id`, `target_user_id`, `date_from`, `date_to` query params for filtering.

Cross-log correlation: every request gets an `X-Request-ID` header (auto-generated if absent) attached by middleware in `app/main.py`. The same id is recorded in audit rows.

## Direct DB Modification

Use the Doppler SSH pattern (see "Running Commands on Server with Doppler" above) to run inline Python against the live DB.

### Tables involved in admin operations

#### `users` — primary user state
| Column | Type | Values / Notes |
|--------|------|----------------|
| `tier` | `varchar(20)` | `"free"` · `"lite"` · `"standard"` · `"pro"` |
| `storage_quota_bytes` | `bigint` | **Must match tier** — see byte values below |
| `role` | enum | `"user"` · `"admin"` · `"super_admin"` |
| `is_active` | `bool` | `True` = account usable · `False` = blocked |
| `email_verified` | `bool` | `False` by default; set `True` to skip verification |

#### `subscriptions` — billing record (one row per user, optional)
| Column | Type | Values / Notes |
|--------|------|----------------|
| `tier` | `varchar(20)` | Mirror of `users.tier` |
| `status` | `varchar(30)` | `"active"` · `"past_due"` · `"canceled"` · `"paused"` · `"trialing"` |
| `billing_cycle` | `varchar(20)` | `"monthly"` · `"quarterly"` · `"manual"` (for admin-set) |
| `current_period_end` | `datetime` | `NULL` = no expiry (fine for manual grants) |
| `paddle_subscription_id` | `varchar(100)` | `NULL` for manually-provisioned tiers |

### Storage quota bytes by tier
```
free     →   52_428_800    (50 MB)
lite     →  2_147_483_648  (2 GB)
standard → 10_737_418_240  (10 GB)
pro      → 21_474_836_480  (20 GB)
```

### Operations

#### Set user to a paid tier
Both `users` **and** `subscriptions` must be updated — the app reads `users.tier` for quota enforcement and `subscriptions` for billing display.

```bash
ssh -i ~/.ssh/oracle.key ubuntu@161.33.181.97
sudo -u retrynote bash << 'SHELL'
cd /home/retrynote/app/backend
TOKEN=$(cat /home/retrynote/.doppler/service-token | sed 's/DOPPLER_TOKEN=//')
doppler run --project retrynote --config prd -t $TOKEN -- .venv/bin/python3 -c "
import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import engine
from app.models.user import User
from app.models.billing import Subscription

EMAIL = 'user@example.com'
TIER  = 'pro'          # free | lite | standard | pro
BYTES = 53_687_091_200 # match tier: 150MB/3GB/15GB/50GB

async def run():
    async with AsyncSession(engine) as db:
        user = (await db.execute(select(User).where(User.email == EMAIL))).scalar_one_or_none()
        if not user:
            print('ERROR: user not found'); return
        print(f'Before: tier={user.tier}, quota={user.storage_quota_bytes}')
        user.tier = TIER
        user.storage_quota_bytes = BYTES
        sub = (await db.execute(select(Subscription).where(Subscription.user_id == user.id))).scalar_one_or_none()
        if sub is None:
            sub = Subscription(user_id=user.id, billing_cycle='manual', reset_tz='Asia/Seoul')
            db.add(sub)
        sub.tier = TIER
        sub.status = 'active'
        await db.commit()
        await db.refresh(user)
        print(f'After:  tier={user.tier}, quota={user.storage_quota_bytes}')
    await engine.dispose()

asyncio.run(run())
"
SHELL
```

#### Downgrade to free
Same script — set `TIER = 'free'`, `BYTES = 157_286_400`, and set `sub.status = 'canceled'`.

#### Change user role
Only touch `users.role`. Valid values: `"user"` · `"admin"` · `"super_admin"`.

```python
# inside the async with block:
user.role = 'admin'   # or 'super_admin' / 'user'
await db.commit()
```

#### Activate / deactivate account
```python
user.is_active = False   # blocks login immediately
await db.commit()
```

#### Force email verified
```python
user.email_verified = True
await db.commit()
```

### What NOT to touch manually
- `storage_used_bytes` — computed from actual file sizes; don't set this by hand
- `usage_records` — rolling 30-day consumption windows managed by the app; manual edits break quota enforcement
- `credit_balances` — app adds/subtracts atomically; direct edits cause race conditions
- `password_hash` — use the password-reset flow instead

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
