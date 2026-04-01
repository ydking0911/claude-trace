# CLAUDE.md — claude-trace

This file provides guidance for Claude Code when working in this repository.

---

## Project Overview

**claude-trace** is a TUI (terminal UI) tool that visualizes Claude Code tool execution in real time.
It hooks into Claude Code's official HTTP hook system — no source modification required.

```
┌──────────────────────────┬────────────────────────┐
│   Claude Code (left)     │  claude-trace (right)  │
│                          │                        │
│  ⠸ Editing file...       │  ◈ claude-trace v1.0.3 │
│                          ├───────────┬────────────┤
│                          │ ◉ Session │ [sprite]   │
│                          │ └─◉ Turn  │ Animation  │
│                          │   ├─◉ Read│            │
│                          │   └─⠸ Edit│            │
│                          ├───────────┴────────────┤
│                          │  ████████░░  3/5 tools │
│                          ├────────────────────────┤
│                          │  Tokens  8,240/200,000 │
│                          │  Cost $0.04  Elapsed 1m│
└──────────────────────────┴────────────────────────┘
```

---

## Repository Structure

```
claude-trace/
├── src/
│   ├── index.ts                — TUI entry point; wires server + store + UI + render loop
│   ├── server.ts               — HTTP event server (POST /event); auto-selects port 7337→7346
│   ├── store.ts                — EventStore; hook event types, SessionNode/TurnNode/ToolNode state
│   │
│   ├── ui/
│   │   ├── theme.ts            — Color palette constants (Claude amber design language)
│   │   ├── layout.ts           — blessed screen + box layout init (includes spriteBox)
│   │   ├── nodeTree.ts         — Node tree renderer; spinner animation, status icons/colors
│   │   ├── progressBar.ts      — Tool completion progress bar
│   │   ├── statsFooter.ts      — Token usage, cost, elapsed time, tool count footer
│   │   ├── spritePanel.ts      — SpriteAnimator; notchi sprite state-emotion mapping and rendering
│   │   └── sprites.ts          — [auto-generated] ANSI sprite frame arrays (93 frames, 16 variants)
│   │
│   └── hooks/
│       └── settingsPatch.ts    — Injects and restores hooks in .claude/settings.json
│
├── bin/
│   └── claude-trace.sh         — Shell entry point; tmux 60:40 split, port selection, prereq checks
│
├── scripts/
│   ├── generate-sprites.sh     — Downloads notchi sheets → splits frames → ANSI → sprites.ts
│   └── install.sh              — Automates npm install + build + npm link
│
├── .github/
│   └── workflows/
│       ├── ci.yml              — Build verification on push/PR (Node 18, 20, 22 matrix)
│       └── release.yml         — npm publish + GitHub Release on version tag push
│
├── dist/                       — Compiled output (generated; do not edit directly)
├── package.json
└── tsconfig.json
```

---

## Architecture

### Data Flow

```
claude-trace "prompt"
    │
    ├─ bin/claude-trace.sh
    │       ├─ Find available port (7337+)
    │       ├─ tmux new-session (60:40 split)
    │       │       ├─ Left pane:  claude "$@"
    │       │       └─ Right pane: node dist/index.js
    │
    └─ src/index.ts
            ├─ EventServer.start(port)       → Listen for HTTP hook events
            ├─ SettingsPatch.inject(port)    → Inject hooks into .claude/settings.json
            ├─ EventStore                    → Receive events, build session tree
            ├─ SpriteAnimator               → Cycle frames based on state/emotion
            └─ render loop (100ms)           → Update TUI widgets
                    ├─ updateNodeTree()
                    ├─ updateProgressBar()
                    ├─ updateStatsFooter()
                    └─ updateSpritePanel()
```

### Hook Event → State Mapping

| Hook Event | EventStore Action |
|------------|-------------------|
| `SessionStart` | Create `SessionNode` |
| `UserPromptSubmit` | Create `TurnNode`, attach to session or agent |
| `PreToolUse` | Create `ToolNode` (status: `running`), map by `tool_use_id` |
| `PostToolUse` | Look up node by `tool_use_id`, set status → `success`, record `endTime` |
| `PostToolUseFailure` | Look up node by `tool_use_id`, set status → `failed` |
| `PermissionRequest` | Set node status → `pending` |
| `SubagentStart` | Create `AgentNode`, register in `agentMap` |
| `SubagentStop` | Set agent status → `success` |
| `SessionEnd` | Emit `sessionEnd`, exit TUI after 5 seconds |

### Sprite State Mapping

| claude-trace state | notchi SpriteState | SpriteEmotion |
|-------------------|-------------------|---------------|
| Tools running | `working` | failed tools > 0 → `sad`, completed >= 5 → `happy`, else → `neutral` |
| Session active, idle | `idle` | same as above |
| No session | `idle` | `neutral` |

### Node Identification

Nodes are looked up by `tool_use_id`, not by order. This makes event handling stable regardless of HTTP delivery order.

---

## Key Constraints

- **Never modify Claude Code source.** Use the official hook system only.
- **All hooks must use `async: true`.** The TUI server must never block Claude Code execution.
- **Always back up `.claude/settings.json` before patching.** Restore on `exit`, `SIGINT`, and `SIGTERM`.
- **Auto-detect port.** Try 7337 first, then increment to 7346.
- **Prevent tmux nesting.** If `$TMUX` is set, run `claude` directly.
- **Never edit `sprites.ts` by hand.** Re-run `scripts/generate-sprites.sh` to regenerate.
- **`spriteBox` must use `tags: false`.** blessed tag syntax conflicts with ANSI escape codes.

---

## Development Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript → dist/
npm run dev          # Watch mode (tsc --watch)
npm start            # Run compiled TUI directly (no tmux)

# Manual HTTP server test
node dist/index.js &
curl -X POST http://localhost:7337/event \
  -H 'Content-Type: application/json' \
  -d '{"hook_event_name":"SessionStart","session_id":"test-123"}'

# Regenerate sprites (after updating notchi)
bash scripts/generate-sprites.sh
npm run build
```

---

## Releasing a New Version

```bash
npm version patch   # or minor / major
git push origin main --tags
```

Pushing a version tag triggers the release workflow:
1. Builds and type-checks the project
2. Publishes to npm
3. Creates a GitHub Release with auto-generated release notes

Requires `NPM_TOKEN` set as a GitHub Actions secret (Automation token type).

---

## Code Conventions

### TypeScript

- **`strict: true`** — All types must be explicit; implicit `any` is forbidden.
- Use `async/await` for all async functions; no `.then()` chains.
- Event types are defined in `src/store.ts`; do not redefine them elsewhere.
- External data (hook payloads) must be received as `unknown` and narrowed with type guards.

### Naming

| Pattern | Convention |
|---------|------------|
| Types / Interfaces | `PascalCase` |
| Functions | `camelCase` |
| Constants (theme, icons) | `camelCase` objects; top-level scalars use `UPPER_SNAKE` |
| Files | `camelCase.ts` |

### UI / Rendering

- All colors must come from `src/ui/theme.ts`. No hardcoded hex or color strings elsewhere.
- blessed tag syntax (`{color-fg}text{/}`) is allowed only in `nodeTree.ts`, `progressBar.ts`, and `statsFooter.ts`.
- `spriteBox` uses `tags: false` — use plain text and ANSI codes only.
- The render loop runs at 100ms. UI update functions must be synchronous and lightweight.

### Sprite System

- Sprite frames are embedded as ANSI string arrays in `src/ui/sprites.ts`.
- `SpriteAnimator` advances frames in the 100ms render loop based on `stateFps`.
- State-emotion mapping is handled by `nodeStatusToSpriteState` and `toolCountToEmotion` in `src/ui/spritePanel.ts`.
- Sprite source: [notchi](https://github.com/sk-ruban/notchi) (MIT License, by sk-ruban).

### Settings Patch

- `SettingsPatch` only modifies the project-local `.claude/settings.json`, never the global `~/.claude/settings.json`.
- Exit handlers are registered once in `setupExitHandlers()`. Do not register them multiple times.

---

## Sprite Generation

```bash
# Requirements: chafa + imagemagick
brew install chafa imagemagick

# Regenerate
bash scripts/generate-sprites.sh
```

Process:
1. Download notchi sprite sheets (16 variants, 64×64px frames)
2. Split each sheet into frames with ImageMagick
3. Convert to ANSI 256-color half-block characters with chafa (20×10 size)
4. Write output as TypeScript arrays to `src/ui/sprites.ts`

---

## Testing

No automated tests currently. When adding tests:

- `EventStore` — unit test by calling `handleEvent()` directly.
- `SettingsPatch` — unit test against a temp directory.
- `SpriteAnimator` — verify frame index by calling `setState` + `tick` repeatedly.
- blessed rendering requires a real TTY and cannot be unit tested.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_TRACE_PORT` | `7337` | Preferred event server port |
| `CLAUDE_TRACE_PROJECT_DIR` | `cwd` | Base directory for locating `settings.json` |
