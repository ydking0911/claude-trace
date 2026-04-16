import * as blessed from 'blessed';
import { theme } from './theme';

export interface LayoutWidgets {
  screen: blessed.Widgets.Screen;
  header: blessed.Widgets.BoxElement;
  nodeTreeBox: blessed.Widgets.BoxElement;
  spriteBox: blessed.Widgets.BoxElement;
  progressBox: blessed.Widgets.BoxElement;
  statsBox: blessed.Widgets.BoxElement;
}

export function createLayout(): LayoutWidgets {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'claude-trace',
    fullUnicode: true,
    forceUnicode: true,
  });

  // Header bar
  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' ◈ claude-trace',
    style: {
      fg: theme.header,
      bg: theme.bg,
      bold: true,
    },
  });

  // Sprite panel (top-right corner, 22 chars wide × 11 lines tall)
  const spriteBox = blessed.box({
    parent: screen,
    top: 1,
    right: 0,
    width: 22,
    height: 11,
    style: {
      bg: theme.bg,
    },
    tags: false,
  });

  // Node tree (main area — leaves room for sprite panel on the right)
  const nodeTreeBox = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    width: '100%-22',
    height: '100%-10',
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    mouse: true,
    border: {
      type: 'line',
    },
    style: {
      fg: theme.text,
      bg: theme.bg,
      border: { fg: theme.border },
    },
    tags: true,
  });

  // Progress bar row
  const progressBox = blessed.box({
    parent: screen,
    bottom: 7,
    left: 0,
    width: '100%',
    height: 1,
    content: ' Progress  ░░░░░░░░░░░░░░░░░░░░  0 / 0  tools done',
    style: {
      fg: theme.dimmed,
      bg: theme.bg,
    },
    tags: true,
  });

  // Stats footer
  const statsBox = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 7,
    border: {
      type: 'line',
    },
    content: '  Tokens  0 / 200,000   Cost  $0.00   Elapsed  0s   Tools  0',
    style: {
      fg: theme.dimmed,
      bg: theme.bg,
      border: { fg: theme.border },
    },
    tags: true,
  });

  // Give the tree box focus so vi/arrow scroll keys are active immediately
  nodeTreeBox.focus();

  // Keyboard bindings
  screen.key(['q', 'C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  return { screen, header, nodeTreeBox, spriteBox, progressBox, statsBox };
}
