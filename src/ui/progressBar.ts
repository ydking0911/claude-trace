import * as blessed from 'blessed';
import { StoreStats } from '../store';
import { theme } from './theme';

const BAR_WIDTH = 20;

function buildBar(completed: number, total: number): string {
  if (total === 0) return '░'.repeat(BAR_WIDTH);
  const filled = Math.round((completed / total) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return `{${theme.success}-fg}${'█'.repeat(filled)}{/}{${theme.dimmed}-fg}${'░'.repeat(empty)}{/}`;
}

export function updateProgressBar(box: blessed.Widgets.BoxElement, stats: StoreStats): void {
  const { completedTools, failedTools, totalTools } = stats;
  const doneTools = completedTools + failedTools; // success + failed = terminal state
  const bar = buildBar(doneTools, totalTools);
  const label = `{${theme.text}-fg}${doneTools} / ${totalTools}  tools done{/}`;
  box.setContent(` Progress  ${bar}  ${label}`);
}
