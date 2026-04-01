import * as blessed from 'blessed';
import { StoreStats } from '../store';
import { theme } from './theme';

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function formatTokenBar(used: number, total = 200000): string {
  const pct = Math.min(used / total, 1);
  const barWidth = 20;
  const filled = Math.round(pct * barWidth);
  const bar = '▏'.repeat(filled).padEnd(barWidth, ' ');
  return bar;
}

export function updateStatsFooter(box: blessed.Widgets.BoxElement, stats: StoreStats, sessionId?: string): void {
  const { tokenUsage, estimatedCost, elapsedMs, totalTools } = stats;
  const elapsed = formatElapsed(elapsedMs);
  const tokenBar = formatTokenBar(tokenUsage);
  const sessionLabel = sessionId ? sessionId.slice(0, 12) : '—';

  const line1 = `  {${theme.dimmed}-fg}Session{/} {${theme.text}-fg}${sessionLabel}{/}   {${theme.dimmed}-fg}Tokens{/} {${theme.text}-fg}${tokenUsage.toLocaleString()} / 200,000{/}  ${tokenBar}`;
  const line2 = `  {${theme.dimmed}-fg}Cost{/} {${theme.text}-fg}$${estimatedCost.toFixed(4)}{/}   {${theme.dimmed}-fg}Elapsed{/} {${theme.text}-fg}${elapsed}{/}   {${theme.dimmed}-fg}Tools{/} {${theme.text}-fg}${totalTools}{/}`;

  box.setContent(`${line1}\n${line2}`);
}
