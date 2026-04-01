import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface HookEntry {
  type: 'http';
  url: string;
  async: boolean;
}

interface HookMatcher {
  hooks: HookEntry[];
}

interface ClaudeSettings {
  hooks?: Record<string, HookMatcher[]>;
  [key: string]: unknown;
}

// Only events officially supported as hook triggers in Claude Code settings.json.
// PermissionDenied is NOT valid — use PermissionRequest instead.
const HOOK_EVENT_NAMES = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'SubagentStart',
  'SubagentStop',
  'TaskCreated',
  'TaskCompleted',
  'SessionEnd',
] as const;

export class SettingsPatch {
  private settingsPath: string;
  private backupPath: string;
  private patched = false;

  constructor(projectDir?: string) {
    const dir = projectDir || process.cwd();
    this.settingsPath = path.join(dir, '.claude', 'settings.json');
    this.backupPath = path.join(dir, '.claude', 'settings.json.claude-trace-backup');
  }

  inject(port: number): void {
    const hookUrl = `http://localhost:${port}/event`;
    const hookEntry: HookEntry = { type: 'http', url: hookUrl, async: true };
    const matcher: HookMatcher = { hooks: [hookEntry] };

    // Ensure .claude directory exists
    const claudeDir = path.dirname(this.settingsPath);
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    // Read existing settings
    let settings: ClaudeSettings = {};
    if (fs.existsSync(this.settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'));
        // Backup original settings
        fs.copyFileSync(this.settingsPath, this.backupPath);
      } catch {
        settings = {};
      }
    }

    // Also check global settings
    const globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    if (!fs.existsSync(this.settingsPath) && fs.existsSync(globalSettingsPath)) {
      try {
        const globalSettings = JSON.parse(fs.readFileSync(globalSettingsPath, 'utf-8'));
        // We inject into local settings, not global
        settings = { ...globalSettings };
      } catch {
        settings = {};
      }
    }

    // Inject hooks
    if (!settings.hooks) {
      settings.hooks = {};
    }

    for (const eventName of HOOK_EVENT_NAMES) {
      if (!settings.hooks[eventName]) {
        settings.hooks[eventName] = [];
      }
      // Remove any existing claude-trace hooks (avoid duplicates on restart)
      // Matches any port in the auto-detection range 7337–7346
      settings.hooks[eventName] = settings.hooks[eventName].filter(
        (m) => !m.hooks?.some((h) => {
          if (!h.url) return false;
          if (h.url.includes('claude-trace')) return true;
          const match = h.url.match(/:(\d+)\//);
          if (!match) return false;
          const p = parseInt(match[1], 10);
          return p >= 7337 && p <= 7346;
        })
      );
      settings.hooks[eventName].push(matcher);
    }

    fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
    this.patched = true;
  }

  restore(): void {
    if (!this.patched) return;

    try {
      if (fs.existsSync(this.backupPath)) {
        fs.copyFileSync(this.backupPath, this.settingsPath);
        fs.unlinkSync(this.backupPath);
      } else {
        // No backup means settings.json didn't exist before — remove our injected file
        if (fs.existsSync(this.settingsPath)) {
          fs.unlinkSync(this.settingsPath);
        }
      }
      this.patched = false;
    } catch (err) {
      process.stderr.write(`[claude-trace] Warning: failed to restore settings: ${err}\n`);
    }
  }

  setupExitHandlers(): void {
    const cleanup = () => {
      this.restore();
    };

    process.on('exit', cleanup);
    process.on('SIGINT', () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });
    process.on('uncaughtException', (err) => {
      process.stderr.write(`[claude-trace] Uncaught exception: ${err}\n`);
      cleanup();
      process.exit(1);
    });
  }
}
