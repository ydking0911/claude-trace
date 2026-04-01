# Contributing to claude-viz

Thank you for your interest in contributing. This guide covers everything you need to get started.

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Submitting Changes](#submitting-changes)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)
- [Code Style](#code-style)

---

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9
- tmux (for end-to-end testing)
- A terminal that supports `xterm-256color`

### Local Setup

```bash
git clone https://github.com/<your-fork>/claude-viz.git
cd claude-viz
npm install
npm run build
```

To verify the HTTP server works:

```bash
node dist/index.js &
curl -s -X POST http://localhost:7337/event \
  -H 'Content-Type: application/json' \
  -d '{"hook_event_name":"SessionStart","session_id":"test-abc"}'
# Expected: {"ok":true}
```

---

## Project Structure

See [CLAUDE.md](CLAUDE.md) for a full breakdown of files, architecture, and data flow.

The short version:

| Path | Responsibility |
|------|----------------|
| `src/server.ts` | HTTP event receiver |
| `src/store.ts` | All event types + state tree |
| `src/ui/` | TUI rendering (blessed) |
| `src/hooks/settingsPatch.ts` | `.claude/settings.json` injection |
| `bin/claude-viz.sh` | tmux orchestration |

---

## Development Workflow

```bash
# Watch mode — recompiles on save
npm run dev

# In another terminal, test with a manual event
curl -X POST http://localhost:7337/event \
  -H 'Content-Type: application/json' \
  -d '{"hook_event_name":"PreToolUse","session_id":"s1","tool_name":"Read","tool_input":{"file_path":"src/index.ts"},"tool_use_id":"t1"}'
```

### Adding a New Hook Event

1. Add the event type to `src/store.ts` — extend `HookEventType` and create an interface.
2. Add a `case` in `EventStore.handleEvent()`.
3. Update the hook injection list in `src/hooks/settingsPatch.ts` (`HOOK_EVENT_NAMES`).
4. Add rendering logic in `src/ui/nodeTree.ts` if it creates a visible node.

### Changing the TUI Layout

- All colors are in `src/ui/theme.ts` — change there, not inline.
- Layout boxes are initialized in `src/ui/layout.ts`. Resize percentages there.
- Render functions (`updateNodeTree`, `updateProgressBar`, `updateStatsFooter`) must remain synchronous.

---

## Submitting Changes

1. **Fork** the repository and create a branch from `main`.
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes.** Keep each commit focused on one logical change.

3. **Build and verify** before pushing.
   ```bash
   npm run build   # must pass with zero errors
   ```

4. **Open a Pull Request** against `main`. Include:
   - What the change does
   - Why it is needed
   - How to test it manually

### PR Guidelines

- One feature or fix per PR. Avoid mixing unrelated changes.
- Keep the PR description short and factual — no filler text.
- If your PR changes the hook injection logic or `settingsPatch.ts`, describe how you verified that `settings.json` is correctly restored on exit.

---

## Reporting Bugs

Open a [GitHub Issue](../../issues/new) with:

- **claude-viz version** (`node dist/index.js --version` or package.json)
- **Node.js version** (`node --version`)
- **OS and terminal** (e.g., macOS 14, iTerm2, tmux 3.3a)
- **`$TERM` value** (`echo $TERM`)
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Any error output** from stderr

### Known Non-Bugs

- blessed rendering artifacts in terminals that do not support `xterm-256color` — set `TERM=xterm-256color`.
- TUI does not appear if tmux is not installed — install tmux first.
- `settings.json` not restored if the process is killed with `SIGKILL` — this is expected; use `SIGINT`/`SIGTERM`.

---

## Requesting Features

Open a [GitHub Issue](../../issues/new) and prefix the title with `[Feature]`. Describe:

- The use case (what you are trying to accomplish)
- What the feature would look like from a user's perspective
- Any constraints or non-goals

Features that require modifying Claude Code's source code are out of scope by design.

---

## Code Style

- **TypeScript strict mode** — no implicit `any`, explicit return types on exported functions.
- **No external runtime dependencies** beyond `blessed` and `blessed-contrib`. The HTTP server uses Node's built-in `http` module.
- **No color strings outside `theme.ts`** — always import from `src/ui/theme.ts`.
- **No silent catch blocks** — if you catch an error and cannot handle it, write to `process.stderr`.
- Keep functions small and single-purpose. The render loop calls update functions; update functions do not call each other.
