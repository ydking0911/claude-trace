#!/usr/bin/env bash
# claude-trace — Claude Code TUI visualizer
# Usage: claude-trace [claude options] "your prompt"

set -e

# ─── Resolve script location (follows symlinks from npm link) ─────────────────
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$SOURCE"
done
SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_INDEX="$ROOT_DIR/dist/index.js"

# ─── Prerequisite checks ──────────────────────────────────────────────────────
check_deps() {
  if ! command -v tmux &>/dev/null; then
    echo "[claude-trace] Error: tmux is not installed."
    echo "  macOS:  brew install tmux"
    echo "  Ubuntu: sudo apt-get install tmux"
    exit 1
  fi

  if ! command -v node &>/dev/null; then
    echo "[claude-trace] Error: node is not installed."
    exit 1
  fi

  if [ ! -f "$DIST_INDEX" ]; then
    echo "[claude-trace] Error: dist/index.js not found. Run 'npm run build' first."
    echo "  cd $ROOT_DIR && npm install && npm run build"
    exit 1
  fi

  if [ -z "$TERM" ] || [ "$TERM" = "dumb" ]; then
    export TERM=xterm-256color
  fi
}

# ─── Port selection ───────────────────────────────────────────────────────────
find_port() {
  local port=7337
  while lsof -i ":$port" &>/dev/null 2>&1; do
    port=$((port + 1))
  done
  echo $port
}

# ─── Main ─────────────────────────────────────────────────────────────────────
check_deps

# If already inside tmux, just run claude directly (prevent nesting)
if [ -n "$TMUX" ]; then
  echo "[claude-trace] Already inside tmux. Running claude directly."
  exec claude "$@"
fi

PORT=$(find_port)
PROJECT_DIR="${CLAUDE_TRACE_PROJECT_DIR:-$(pwd)}"
SESSION_NAME="claude-trace-$$"

VIZ_CMD="CLAUDE_TRACE_PORT=$PORT CLAUDE_TRACE_PROJECT_DIR='$PROJECT_DIR' node '$DIST_INDEX'"
# Wrap each argument in double quotes, escaping internal double quotes
CLAUDE_CMD="claude"
for arg in "$@"; do
  CLAUDE_CMD="$CLAUDE_CMD \"${arg//\"/\\\"}\""
done

# Create detached tmux session (pane 0 = left)
tmux new-session -d -s "$SESSION_NAME" -x "$(tput cols)" -y "$(tput lines)"

# Split right 40% → creates pane 1
tmux split-window -t "${SESSION_NAME}.0" -h -p 40

# Pane 1 (right): TUI — start FIRST so HTTP server + hook injection is ready
tmux send-keys -t "${SESSION_NAME}.1" "$VIZ_CMD" Enter

# Wait for TUI server to come up before claude starts
sleep 0.8

# Pane 0 (left): claude
tmux send-keys -t "${SESSION_NAME}.0" "$CLAUDE_CMD" Enter

# Focus left pane so user sees claude output
tmux select-pane -t "${SESSION_NAME}.0"

# Attach
tmux attach-session -t "$SESSION_NAME"

# Cleanup on detach/exit
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
