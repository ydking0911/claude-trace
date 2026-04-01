# claude-trace

> See what Claude Code is actually doing — real-time tool graph, progress bar, and animated sprite in your terminal.

Claude Code only shows a spinner. **claude-trace** splits your terminal and visualizes every tool call as it happens.

![claude-trace demo](img/view.png)

---

## Features

- **실시간 툴 트리** — `Read`, `Edit`, `Bash` 등 모든 툴 호출을 트리 구조로 표시
- **상태 아이콘** — `◉` 완료 · `⠸` 실행 중 · `✗` 실패 · `⊘` 거부 · `▣` 서브에이전트
- **진행률 바** — 완료된 툴 / 전체 툴 실시간 게이지
- **통계 푸터** — 토큰 사용량, 비용, 경과 시간
- **픽셀 아트 스프라이트** — 툴 실행 상태에 따라 표정이 바뀌는 캐릭터 애니메이션 ([notchi](https://github.com/sk-ruban/notchi) sprites, MIT)
- **무침습** — Claude Code 소스 수정 없음, 공식 Hook 시스템만 사용
- **자동 복원** — 종료 시 `.claude/settings.json` 원상 복구

---

## Requirements

- Node.js >= 18
- tmux
- Claude Code CLI (`claude`)
- macOS / Linux

---

## Installation

```bash
npm install -g claude-trace
```

또는 소스에서 직접 설치:

```bash
git clone https://github.com/ydking0911/claude-trace.git
cd claude-trace
npm install && npm run build
npm link
```

---

## Usage

```bash
# claude 대신 claude-trace 사용
claude-trace "파일 읽고 버그 수정해줘"
claude-trace --model claude-opus-4-6 "리팩토링해줘"

# 기존 claude 명령 그대로 쓰고 싶다면 alias 추가
echo "alias claude='claude-trace'" >> ~/.zshrc && source ~/.zshrc
```

실행하면 tmux가 자동으로 화면을 분할합니다:
- **왼쪽 (60%)** — Claude Code 원본 실행
- **오른쪽 (40%)** — claude-trace TUI

---

## How It Works

```
claude-trace "prompt"
      │
      ├─ .claude/settings.json에 HTTP hook 임시 주입
      ├─ tmux 세션 생성 (60:40 분할)
      │       ├─ 왼쪽: claude 실행
      │       └─ 오른쪽: TUI 서버 실행 (localhost:7337)
      │
Claude Code 실행 중:
      ├─ PreToolUse  → POST /event → 노드 추가 (running)
      ├─ PostToolUse → POST /event → 노드 완료 (success)
      └─ SessionEnd  → POST /event → 5초 후 TUI 종료, 설정 복원
```

Claude Code의 공식 HTTP Hook 시스템을 사용합니다. `async: true` 설정으로 TUI 서버 응답 시간이 Claude의 실행 속도에 영향을 주지 않습니다.

---

## Keyboard Shortcuts

| 키 | 동작 |
|----|------|
| `q` / `Ctrl+C` | TUI 종료 (Claude는 계속 실행) |
| `↑` / `↓` / `j` / `k` | 노드 트리 스크롤 |

---

## Node Status Icons

```
◉  success  — 초록, 완료
⠸  running  — amber 스피너, 실행 중
◎  pending  — 회색, 대기
✗  failed   — 빨강, 에러
⊘  denied   — 주황, 권한 거부
▣  agent    — 파랑, 서브에이전트
```

---

## Environment Variables

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `CLAUDE_TRACE_PORT` | `7337` | 이벤트 서버 포트 (충돌 시 자동 탐색) |
| `CLAUDE_TRACE_PROJECT_DIR` | `cwd` | settings.json 위치 기준 디렉토리 |

---

## Sprite Credits

우상단 픽셀 아트 캐릭터는 [notchi](https://github.com/sk-ruban/notchi) (MIT License, by [sk-ruban](https://github.com/sk-ruban)) 의 스프라이트를 ANSI 문자로 변환하여 사용합니다.

스프라이트 재생성:
```bash
brew install chafa imagemagick
bash scripts/generate-sprites.sh
npm run build
```

---

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) 를 참고해주세요.

---

## License

MIT © [ydking0911](https://github.com/ydking0911)
