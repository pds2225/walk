#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Installs Node and Python dependencies so tests and linters work in remote sessions.
set -euo pipefail

# Only run inside the Claude Code remote (web) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

echo "[session-start] Installing Node dependencies (npm install)..."
npm install

echo "[session-start] Installing Python dependencies (pip)..."
python3 -m pip install --disable-pip-version-check \
  -r requirements.txt \
  -r streamlit_walk_engine/requirements.txt \
  -r streamlit_task_organizer/requirements.txt

echo "[session-start] Dependencies installed."
