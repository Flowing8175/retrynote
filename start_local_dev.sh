# Doppler injects AI keys (GEMINI/OPENAI/etc.) from retrynote/prd.
# DATABASE_URL and REDIS_URL are forced to local values so prd DB/Redis are never
# touched from this machine (env vars outrank .env in pydantic-settings).
LOCAL_OVERRIDES='DATABASE_URL=postgresql+asyncpg://retrynote:retrynote@localhost:5432/retrynote DATABASE_URL_SYNC=postgresql://retrynote:retrynote@localhost:5432/retrynote REDIS_URL=redis://localhost:6379/0'

tmux new-session -d -s quiz -n api
tmux send-keys -t quiz:api "cd /home/oh/dev/retrynote/backend && doppler run -- env $LOCAL_OVERRIDES ./.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" Enter
tmux new-window -t quiz -n worker
tmux send-keys -t quiz:worker "cd /home/oh/dev/retrynote/backend && doppler run -- env $LOCAL_OVERRIDES ./.venv/bin/celery -A app.workers.celery_app worker --loglevel=info" Enter
tmux new-window -t quiz -n frontend
tmux send-keys -t quiz:frontend "cd /home/oh/dev/retrynote/frontend && npm run dev" Enter
