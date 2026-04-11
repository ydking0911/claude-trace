// Scans ~/.claude/projects/**/*.jsonl to compute historical and weekly token usage
// directly from Claude Code's own transcript files.
import * as fsp from 'fs/promises';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

function getUsage(entry: unknown): Record<string, unknown> | null {
  if (!entry || typeof entry !== 'object') return null;
  const msg = (entry as Record<string, unknown>)['message'];
  if (!msg || typeof msg !== 'object') return null;
  const usage = (msg as Record<string, unknown>)['usage'];
  if (!usage || typeof usage !== 'object') return null;
  return usage as Record<string, unknown>;
}

function getTimestamp(entry: unknown): number {
  if (!entry || typeof entry !== 'object') return 0;
  const ts = (entry as Record<string, unknown>)['timestamp'];
  if (typeof ts !== 'string') return 0;
  return new Date(ts).getTime();
}

async function collectJSONLFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const sub = await collectJSONLFiles(full);
          results.push(...sub);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          results.push(full);
        }
      }),
    );
  } catch {
    // ignore unreadable directories
  }
  return results;
}

export async function scanHistoricalTokens(excludeFile?: string): Promise<number> {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) return 0;
    const files = await collectJSONLFiles(PROJECTS_DIR);
    const counts = await Promise.all(
      files.map(async (file) => {
        if (excludeFile && path.resolve(file) === path.resolve(excludeFile)) return 0;
        try {
          const content = await fsp.readFile(file, 'utf-8');
          let total = 0;
          for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const entry = JSON.parse(trimmed) as unknown;
              const usage = getUsage(entry);
              if (!usage) continue;
              const out = usage['output_tokens'];
              if (typeof out === 'number') total += out;
            } catch { /* skip */ }
          }
          return total;
        } catch {
          return 0;
        }
      }),
    );
    return counts.reduce((sum, n) => sum + n, 0);
  } catch {
    return 0;
  }
}

export interface WeeklyTokenStats {
  outputTokens: number;
  resetMs: number; // ms until next Monday 00:00 UTC
}

function getWeekStart(): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day; // offset to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export async function scanWeeklyTokens(): Promise<WeeklyTokenStats> {
  const now = Date.now();
  const weekStart = getWeekStart();
  const nextMonday = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const resetMs = nextMonday.getTime() - now;
  const weekStartMs = weekStart.getTime();

  try {
    if (!fs.existsSync(PROJECTS_DIR)) return { outputTokens: 0, resetMs };
    const files = await collectJSONLFiles(PROJECTS_DIR);

    const counts = await Promise.all(
      files.map(async (file) => {
        try {
          // Fast skip: if file wasn't modified this week, skip it
          const stat = await fsp.stat(file);
          if (stat.mtimeMs < weekStartMs) return 0;

          const content = await fsp.readFile(file, 'utf-8');
          let total = 0;
          for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const entry = JSON.parse(trimmed) as unknown;
              if (getTimestamp(entry) < weekStartMs) continue;
              const usage = getUsage(entry);
              if (!usage) continue;
              const out = usage['output_tokens'];
              if (typeof out === 'number') total += out;
            } catch { /* skip */ }
          }
          return total;
        } catch {
          return 0;
        }
      }),
    );

    return { outputTokens: counts.reduce((sum, n) => sum + n, 0), resetMs };
  } catch {
    return { outputTokens: 0, resetMs };
  }
}
