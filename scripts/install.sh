#!/usr/bin/env bash
# install.sh — Install claude-viz globally

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[claude-viz] Installing dependencies..."
cd "$ROOT_DIR"
npm install

echo "[claude-viz] Building TypeScript..."
npm run build

echo "[claude-viz] Making bin script executable..."
chmod +x bin/claude-viz.sh

echo "[claude-viz] Linking globally..."
npm link

echo ""
echo "[claude-viz] Installation complete!"
echo "  Usage: claude-viz \"your prompt here\""
echo "  Alias: alias claude='claude-viz'  (add to ~/.zshrc or ~/.bashrc)"
