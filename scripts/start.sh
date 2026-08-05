#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$LOG_DIR"
MAX_RETENTION=5

BUN_CMD="${BUN_CMD:-}"
if [ -z "$BUN_CMD" ]; then
  if ! BUN_CMD="$(command -v bun 2>/dev/null)" || [ -z "$BUN_CMD" ]; then
    echo "Could not locate the 'bun' executable. Set BUN_CMD to its path before running this script." >&2
    exit 1
  fi
fi

if [ ! -f "$ROOT_DIR/dist/server/server.js" ]; then
  echo "dist/server/server.js not found — run 'bun run build' first." >&2
  exit 1
fi

# Keeps the last 5 logs. web.log -> web.log.1 -> ... -> web.log.5
rotate_log() {
  local log_file="$1"
  if [ -f "$log_file" ]; then
    for i in $(seq $((MAX_RETENTION - 1)) -1 1); do
      if [ -f "$log_file.$i" ]; then
        mv "$log_file.$i" "$log_file.$((i + 1))"
      fi
    done
    mv "$log_file" "$log_file.1"
    echo "Archived previous log to $log_file.1"
  fi
}

# We use 'exec' inside the subshell so Bun inherits the process properly
# and doesn't leave a dangling bash process.
start_session() {
  local session="$1" script="$2" log_file="$3"
  if screen -list | grep -qE "[.]${session}\\b"; then
    echo "Screen session '$session' is already running."
    return 0
  fi
  rotate_log "$log_file"
  screen -dmS "$session" bash -c "exec \"$BUN_CMD\" run \"$script\" 2>&1 | tee -a \"$log_file\""
  echo "Started screen session '$session' using 'bun run $script', log: $log_file"
}

# the app is two processes: the SSR web server and the websocket server
start_session gameshow-web start "$LOG_DIR/web.log"
start_session gameshow-ws start:ws "$LOG_DIR/ws.log"
