# claude-trace

> See every tool call Claude Code makes — live, in your terminal.

Claude Code shows a spinner while it works. **claude-trace** splits your terminal and renders a real-time tree of every tool call, progress bar, token usage, and an animated pixel-art companion.

![claude-trace demo](img/view.png)

---

## Features

- **Live tool tree** — Every `Read`, `Edit`, `Bash`, and subagent call rendered as a tree in real time
- **Status icons** — `◉` success · `⠸` running · `✗` failed · `⊘` denied · `▣` subagent
- **Progress bar** — Completed tools out of total, updated as each tool finishes
- **Stats footer** — Token usage, estimated cost, and elapsed time
- **Pixel-art sprite** — Animated character whose expression changes based on tool activity ([notchi](https://github.com/sk-ruban/notchi), MIT)
- **Non-invasive** — Uses Claude Code's official HTTP hook system; no source modification required
- **Auto-restore** — `.claude/settings.json` is restored to its original state on exit

---

## Requirements

- Node.js >= 18
- tmux
- [Claude Code CLI](https://claude.ai/code)
- macOS or Linux

---

## Installation

**npm (recommended):**
```bash
npm install -g claude-trace
```

**Homebrew:**
```bash
brew tap ydking0911/claude-trace
brew install claude-trace
```

**From source:**
```bash
git clone https://github.com/ydking0911/claude-trace.git
cd claude-trace
npm install && npm run build && npm link
```

---

## Usage

Use `claude-trace` anywhere you would use `claude`:

```bash
claude-trace "read the codebase and fix the bug in auth.ts"
claude-trace --model claude-opus-4-6 "refactor the payment module"
```

When launched, tmux automatically splits your terminal:
- **Left (60%)** — Claude Code running normally
- **Right (40%)** — claude-trace TUI

**Optional alias** — use `claude` as usual with tracing always on:
```bash
echo "alias claude='claude-trace'" >> ~/.zshrc && source ~/.zshrc
```

---

## How It Works

```
claude-trace "prompt"
      │
      ├─ Temporarily injects HTTP hooks into .claude/settings.json
      ├─ Creates a tmux session (60/40 split)
      │       ├─ Left pane:  claude <args>
      │       └─ Right pane: TUI server (localhost:7337)
      │
While Claude Code runs:
      ├─ PreToolUse  → POST /event → adds node (running)
      ├─ PostToolUse → POST /event → marks node complete (success)
      └─ SessionEnd  → POST /event → waits 5s, restores settings, exits
```

All hooks use `async: true` so the TUI server's response time never blocks Claude Code.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `q` / `Ctrl+C` | Exit TUI (Claude keeps running) |
| `↑` / `↓` / `j` / `k` | Scroll the tool tree |

---

## Node Status Icons

```
◉  success  — green,  tool completed
⠸  running  — amber spinner, in progress
◎  pending  — gray,   awaiting permission
✗  failed   — red,    tool error
⊘  denied   — orange, permission denied
▣  agent    — blue,   subagent
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_TRACE_PORT` | `7337` | Event server port (auto-increments on conflict) |
| `CLAUDE_TRACE_PROJECT_DIR` | `cwd` | Directory used to locate `.claude/settings.json` |

---

## Sprite Credits

The pixel-art character in the top-right corner is converted from [notchi](https://github.com/sk-ruban/notchi) sprites (MIT License, by [sk-ruban](https://github.com/sk-ruban)) into ANSI half-block characters via [chafa](https://hpjansson.org/chafa/).

To regenerate sprites after updating notchi:
```bash
brew install chafa imagemagick
bash scripts/generate-sprites.sh
npm run build
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT © [ydking0911](https://github.com/ydking0911)
