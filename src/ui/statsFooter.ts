import * as blessed from 'blessed';
import { StoreStats } from '../store';
import { theme } from './theme';

// ─── Level system (exponential, no cap) ──────────────────────────────────────
// Lv.1: 0–1K, Lv.2: 1K–3K, Lv.3: 3K–7K, Lv.4: 7K–15K, … (doubles each level)
const LEVEL_BASE = 1000;

function getLevel(tokens: number): { level: number; levelTokens: number; levelRange: number; progress: number } {
  const level = Math.floor(Math.log2(tokens / LEVEL_BASE + 1)) + 1;
  const levelFloor = LEVEL_BASE * (Math.pow(2, level - 1) - 1);
  const levelRange = LEVEL_BASE * Math.pow(2, level - 1);
  const levelTokens = tokens - levelFloor;
  return { level, levelTokens, levelRange, progress: Math.min(levelTokens / levelRange, 1) };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatTokenLevelBar(tokens: number): string {
  const { level, levelTokens, levelRange, progress } = getLevel(tokens);
  const barWidth = 14;
  const filled = Math.round(progress * barWidth);
  const empty = barWidth - filled;
  const filledBar = `{${theme.skyBlue}-fg}${'█'.repeat(filled)}{/}`;
  const emptyBar = `{${theme.dimmed}-fg}${'░'.repeat(empty)}{/}`;
  const levelLabel = `{${theme.text}-fg}Lv.${level}{/}`;
  const countLabel = `{${theme.text}-fg}${levelTokens.toLocaleString()} / ${levelRange.toLocaleString()}{/}`;
  return `${levelLabel} ${filledBar}${emptyBar} ${countLabel}`;
}

function formatLimitBar(used: number, max: number, color: string): string {
  const pct = Math.min(used / max, 1);
  const barWidth = 14;
  const filled = Math.round(pct * barWidth);
  const empty = barWidth - filled;
  const filledBar = `{${color}-fg}${'█'.repeat(filled)}{/}`;
  const emptyBar = `{${theme.dimmed}-fg}${'░'.repeat(empty)}{/}`;
  return `${filledBar}${emptyBar}`;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatResetMs(ms: number): string {
  if (ms <= 0) return 'now';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

// ─── Limits ───────────────────────────────────────────────────────────────────
const SESSION_CONTEXT_LIMIT = 200_000;  // Claude context window
const WEEKLY_TOKEN_LIMIT    = 10_000_000; // ~Pro plan weekly allowance

// ─── Main export ──────────────────────────────────────────────────────────────

export function updateStatsFooter(
  box: blessed.Widgets.BoxElement,
  stats: StoreStats,
  sessionId?: string,
): void {
  const { tokenUsage, estimatedCost, elapsedMs, totalTools,
          sessionInputTokens, weeklyTokens, weeklyResetMs } = stats;

  const elapsed = formatElapsed(elapsedMs);
  const sessionLabel = sessionId ? sessionId.slice(0, 12) : '—';
  const tokenBar = formatTokenLevelBar(tokenUsage);

  // Line 1: session id + level bar
  const line1 = `  {${theme.dimmed}-fg}Session{/} {${theme.text}-fg}${sessionLabel}{/}   {${theme.dimmed}-fg}Tokens{/}  ${tokenBar}`;

  // Line 2: cost / elapsed / tools
  const line2 = `  {${theme.dimmed}-fg}Cost{/} {${theme.text}-fg}$${estimatedCost.toFixed(4)}{/}   {${theme.dimmed}-fg}Elapsed{/} {${theme.text}-fg}${elapsed}{/}   {${theme.dimmed}-fg}Tools{/} {${theme.text}-fg}${totalTools}{/}`;

  // Line 3: session context window (orange)
  const sessionBar = formatLimitBar(sessionInputTokens, SESSION_CONTEXT_LIMIT, theme.orange);
  const sessionCount = `{${theme.orange}-fg}${formatCompact(sessionInputTokens)} / ${formatCompact(SESSION_CONTEXT_LIMIT)}{/}`;
  const sessionElapsed = elapsedMs > 0 ? `  {${theme.dimmed}-fg}active ${formatElapsed(elapsedMs)}{/}` : '';
  const line3 = `  {${theme.orange}-fg}◆ Session{/}  ${sessionBar}  ${sessionCount}${sessionElapsed}`;

  // Line 4: weekly usage (light green)
  const weeklyBar = formatLimitBar(weeklyTokens, WEEKLY_TOKEN_LIMIT, theme.lightGreen);
  const weeklyCount = `{${theme.lightGreen}-fg}${formatCompact(weeklyTokens)} / ${formatCompact(WEEKLY_TOKEN_LIMIT)}{/}`;
  const resetLabel = weeklyResetMs > 0 ? `  {${theme.dimmed}-fg}resets in ${formatResetMs(weeklyResetMs)}{/}` : '';
  const line4 = `  {${theme.lightGreen}-fg}◆ Weekly{/}   ${weeklyBar}  ${weeklyCount}${resetLabel}`;

  box.setContent(`${line1}\n${line2}\n${line3}\n${line4}`);
}
