#!/usr/bin/env bash
set -euo pipefail

stop_session() {
  local session="$1"
  if ! screen -list | grep -qE "[.]${session}\\b"; then
    echo "Screen session '$session' is not running."
    return 0
  fi
  # Gracefully terminates the detached screen session.
  screen -S "$session" -X quit
  echo "Stopped screen session '$session'."
}

stop_session gameshow-web
stop_session gameshow-ws
