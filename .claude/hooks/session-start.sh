#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Installs Node and Python dependencies so tests and linters work in remote sessions.
set -euo pipefail

# Only run inside the Claude Code remote (web) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# SessionStart stdout is injected into Claude's conversation context. npm/pip can
# emit thousands of lines of resolution/download output, so send installer output
# to a log file and keep stdout to a short summary. On failure, surface the log
# tail so the error stays visible in context.
LOG_FILE="$(mktemp -t walk-session-start-XXXXXX.log)"
trap 'status=$?; if [ "$status" -ne 0 ]; then echo "[session-start] Dependency install FAILED (exit $status). Last log lines:"; tail -n 30 "$LOG_FILE"; fi' EXIT

npm install >> "$LOG_FILE" 2>&1

python3 -m pip install --disable-pip-version-check \
  -r requirements.txt \
  -r streamlit_walk_engine/requirements.txt \
  -r streamlit_task_organizer/requirements.txt >> "$LOG_FILE" 2>&1

echo "[session-start] Node + Python dependencies installed (full log: $LOG_FILE)."
