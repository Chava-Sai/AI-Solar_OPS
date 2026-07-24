#!/bin/bash
# Astra AI — one-command startup (backend + frontend)
# Usage:  ./start.sh          start both servers
#         ./start.sh stop     stop both servers
#         ./start.sh status   check what's running

DIR="$(cd "$(dirname "$0")" && pwd)"

status() {
  B=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost:8000/health 2>/dev/null)
  F=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost:5173/ 2>/dev/null)
  [ "$B" = "200" ] && echo "✅ Backend  http://localhost:8000  (running)" || echo "❌ Backend  (down)"
  [ "$F" = "200" ] && echo "✅ Frontend http://localhost:5173  (running)" || echo "❌ Frontend (down)"
}

case "$1" in
  stop)
    pkill -f "uvicorn main:app" 2>/dev/null && echo "Backend stopped."
    pkill -f "vite" 2>/dev/null && echo "Frontend stopped."
    ;;
  status)
    status
    ;;
  *)
    echo "Starting Astra AI..."
    pkill -f "uvicorn main:app" 2>/dev/null
    pkill -f "vite" 2>/dev/null
    sleep 1

    cd "$DIR/backend"  && nohup ./venv/bin/python -m uvicorn main:app --port 8000 > /tmp/astra_backend.log 2>&1 &
    cd "$DIR/frontend" && nohup npm run dev > /tmp/astra_frontend.log 2>&1 &

    echo "Waiting for servers (backend loads the AI model, ~15s)..."
    for i in $(seq 1 60); do
      B=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost:8000/health 2>/dev/null)
      F=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost:5173/ 2>/dev/null)
      if [ "$B" = "200" ] && [ "$F" = "200" ]; then break; fi
      sleep 1
    done
    echo ""
    status
    echo ""
    echo "→ Open http://localhost:5173  (login: test1@ags.com / test1234)"
    ;;
esac
