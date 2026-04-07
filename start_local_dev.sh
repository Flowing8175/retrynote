tmux new-session -d -s quiz -n api
tmux send-keys -t quiz:api "cd /home/oh/dev/retrynote/backend && ./.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" Enter
tmux new-window -t quiz -n worker
tmux send-keys -t quiz:worker "cd /home/oh/dev/retrynote/backend && ./.venv/bin/celery -A app.workers.celery_app worker --loglevel=info" Enter
tmux new-window -t quiz -n frontend
tmux send-keys -t quiz:frontend "cd /home/oh/dev/retrynote/frontend && npm run dev" Enter
