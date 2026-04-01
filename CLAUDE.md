# CLAUDE.md — claude-viz

This file provides guidance for Claude Code when working in this repository.

---

## Project Overview

**claude-viz** is a TUI (terminal UI) tool that visualizes Claude Code tool execution in real time.
It hooks into Claude Code's official HTTP hook system — no source modification required.

```
┌──────────────────────────┬────────────────────────┐
│   Claude Code (left)     │  claude-viz (right)    │
│                          │                        │
│  ⠸ Editing file...       │  ◈ claude-viz  v1.0.0  │
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
claude-viz/
├── src/
│   ├── index.ts                — TUI 앱 진입점; server + store + UI + render loop 연결
│   ├── server.ts               — HTTP 이벤트 서버 (POST /event); 포트 자동탐색 7337→7346
│   ├── store.ts                — EventStore; 훅 이벤트 타입, SessionNode/TurnNode/ToolNode 상태
│   │
│   ├── ui/
│   │   ├── theme.ts            — 색상 팔레트 상수 (Claude amber 디자인 언어)
│   │   ├── layout.ts           — blessed 화면 + 박스 레이아웃 초기화 (spriteBox 포함)
│   │   ├── nodeTree.ts         — 노드 트리 렌더러; 스피너 애니메이션, 상태 아이콘/색상
│   │   ├── progressBar.ts      — 툴 완료/전체 진행률 바
│   │   ├── statsFooter.ts      — 토큰 사용량, 비용, 경과시간, 툴 수 푸터
│   │   ├── spritePanel.ts      — SpriteAnimator; notchi 스프라이트 상태-감정 매핑 및 렌더링
│   │   └── sprites.ts          — [자동생성] ANSI 스프라이트 프레임 배열 (93 프레임, 16종)
│   │
│   └── hooks/
│       └── settingsPatch.ts    — .claude/settings.json 훅 주입/복원
│
├── bin/
│   └── claude-viz.sh           — 셸 진입점; tmux 60:40 분할, 포트 선택, 사전 요구사항 확인
│
├── scripts/
│   ├── generate-sprites.sh     — notchi 스프라이트 다운로드 → 프레임 분리 → ANSI 변환 → sprites.ts 생성
│   └── install.sh              — npm install + build + npm link 자동화
│
├── dist/                       — 컴파일된 출력물 (생성됨, 직접 편집 금지)
├── package.json
└── tsconfig.json
```

---

## Architecture

### Data Flow

```
claude-viz "prompt"
    │
    ├─ bin/claude-viz.sh
    │       ├─ 가용 포트 탐색 (7337+)
    │       ├─ tmux new-session (60:40 분할)
    │       │       ├─ 왼쪽:  claude "$@"
    │       │       └─ 오른쪽: node dist/index.js
    │
    └─ src/index.ts
            ├─ EventServer.start(port)       → HTTP 서버 리슨
            ├─ SettingsPatch.inject(port)    → .claude/settings.json에 훅 주입
            ├─ EventStore                    → 이벤트 수신, 세션 트리 구성
            ├─ SpriteAnimator               → 상태/감정 기반 프레임 순환
            └─ render loop (100ms)           → TUI 위젯 업데이트
                    ├─ updateNodeTree()
                    ├─ updateProgressBar()
                    ├─ updateStatsFooter()
                    └─ updateSpritePanel()
```

### Hook Event → State Mapping

| Hook Event | EventStore 동작 |
|------------|-----------------|
| `SessionStart` | `SessionNode` 생성 |
| `UserPromptSubmit` | `TurnNode` 생성, 세션 또는 에이전트에 연결 |
| `PreToolUse` | `ToolNode` 생성 (status: `running`), `tool_use_id`로 매핑 |
| `PostToolUse` | `tool_use_id`로 노드 조회, status → `success`, `endTime` 기록 |
| `PostToolUseFailure` | `tool_use_id`로 노드 조회, status → `failed` |
| `PermissionRequest` | 노드 status → `pending` |
| `PermissionDenied` | 노드 status → `denied` |
| `SubagentStart` | `AgentNode` 생성, `agentMap`에 등록 |
| `SubagentStop` | 에이전트 status → `success` |
| `SessionEnd` | `sessionEnd` emit, 5초 후 TUI 종료 |

### Sprite State Mapping

| claude-viz 상태 | notchi SpriteState | SpriteEmotion 결정 |
|----------------|-------------------|-------------------|
| 툴 실행 중 | `working` | 실패 툴 있음→`sad`, 완료 5+→`happy`, 그외→`neutral` |
| 세션 있음, 대기 | `idle` | 동일 |
| 세션 없음 | `idle` | `neutral` |

### Node Identification

노드는 `tool_use_id`로 조회 (순서 기반 아님). HTTP 이벤트 순서 무관하게 안정적으로 동작.

---

## Key Constraints

- **Claude Code 소스 절대 수정 금지.** 공식 hook 시스템만 사용.
- **모든 hook에 `async: true`.** TUI 서버 응답 시간이 Claude Code를 블로킹하지 않도록.
- **패치 전 `.claude/settings.json` 백업 필수.** `exit`, `SIGINT`, `SIGTERM`에서 복원.
- **포트 자동탐색.** 7337 시도 후 7338…7346 순차 탐색.
- **tmux 중첩 방지.** `$TMUX` 설정 시 claude 직접 실행.
- **`sprites.ts` 직접 편집 금지.** `scripts/generate-sprites.sh` 재실행으로 갱신.
- **`spriteBox`는 `tags: false`.** blessed 태그와 ANSI 이스케이프 코드 충돌 방지.

---

## Development Commands

```bash
npm install          # 의존성 설치
npm run build        # TypeScript → dist/ 컴파일
npm run dev          # 워치 모드 (tsc --watch)
npm start            # 컴파일된 TUI 직접 실행 (tmux 없이)

# HTTP 서버 수동 테스트
node dist/index.js &
curl -X POST http://localhost:7337/event \
  -H 'Content-Type: application/json' \
  -d '{"hook_event_name":"SessionStart","session_id":"test-123"}'

# 스프라이트 재생성 (notchi 업데이트 시)
bash scripts/generate-sprites.sh
npm run build
```

---

## Code Conventions

### TypeScript

- **`strict: true`** — 모든 타입 명시, implicit `any` 금지.
- 모든 async 함수는 `async/await` 사용, `.then()` 체인 금지.
- 이벤트 타입은 `src/store.ts`에 정의, 다른 곳에서 재정의 금지.
- 외부 데이터(훅 페이로드)는 `unknown`으로 수신 후 타입 가드로 좁힘.

### Naming

| 패턴 | 규칙 |
|------|------|
| 타입 / 인터페이스 | `PascalCase` |
| 함수 | `camelCase` |
| 상수 (theme, icons) | `camelCase` 객체, 최상위 스칼라는 `UPPER_SNAKE` |
| 파일 | `camelCase.ts` |

### UI / Rendering

- 모든 색상은 `src/ui/theme.ts`에서 가져옴. 다른 파일에 hex/색상 문자열 하드코딩 금지.
- blessed 태그 문법(`{color-fg}text{/}`)은 `nodeTree.ts`, `progressBar.ts`, `statsFooter.ts`에서만 사용.
- `spriteBox`는 `tags: false` — blessed 태그 사용 금지, 순수 텍스트/ANSI 코드만.
- 렌더 루프는 100ms. UI 업데이트 함수는 동기적이고 가볍게 유지.

### Sprite System

- 스프라이트 프레임은 `src/ui/sprites.ts`에 ANSI 문자열 배열로 임베딩됨.
- `SpriteAnimator`가 `stateFps` 기반으로 100ms 렌더 루프에서 프레임 진행.
- 상태-감정 매핑은 `src/ui/spritePanel.ts`의 `nodeStatusToSpriteState`, `toolCountToEmotion`에서 담당.
- 스프라이트 소스: [notchi](https://github.com/sk-ruban/notchi) (MIT License), sk-ruban 제작.

### Settings Patch

- `SettingsPatch`는 전역 `~/.claude/settings.json`이 아닌 프로젝트 로컬 `.claude/settings.json`만 조작.
- 종료 핸들러는 `setupExitHandlers()`에서 한 번만 등록. 중복 등록 금지.

---

## Sprite Generation

```bash
# 요구사항: chafa + imagemagick
brew install chafa imagemagick

# 스프라이트 재생성
bash scripts/generate-sprites.sh
```

생성 과정:
1. notchi 레포에서 스프라이트 시트 다운로드 (16종, 64×64px 프레임)
2. ImageMagick으로 각 시트를 프레임으로 분리
3. chafa로 ANSI 256색 half-block 문자로 변환 (20×10 크기)
4. `src/ui/sprites.ts`에 TypeScript 배열로 자동 출력

---

## Testing

현재 자동화 테스트 없음. 테스트 추가 시:

- `EventStore`는 `handleEvent()` 직접 호출로 단위 테스트.
- `SettingsPatch`는 임시 디렉토리로 단위 테스트.
- `SpriteAnimator`는 `setState` + `tick` 반복 호출로 프레임 인덱스 검증.
- blessed 렌더링은 실제 TTY 필요 — 테스트 불가.

---

## Environment Variables

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `CLAUDE_VIZ_PORT` | `7337` | 이벤트 서버 선호 포트 |
| `CLAUDE_VIZ_PROJECT_DIR` | `cwd` | settings.json 탐색 기준 프로젝트 디렉토리 |
