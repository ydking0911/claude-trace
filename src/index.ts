import { EventServer } from './server';
import { EventStore } from './store';
import { SettingsPatch } from './patches/settingsPatch';
import { createLayout } from './ui/layout';
import { updateNodeTree, tickSpinner } from './ui/nodeTree';
import { updateProgressBar } from './ui/progressBar';
import { updateStatsFooter } from './ui/statsFooter';
import { SpriteAnimator, updateSpritePanel, resolveSprite } from './ui/spritePanel';
import { checkForUpdate, runUpdate, getCurrentVersion } from './updater';

const RENDER_INTERVAL_MS = 100;
const PREFERRED_PORT = parseInt(process.env.CLAUDE_TRACE_PORT || '7337', 10);
const PROJECT_DIR = process.env.CLAUDE_TRACE_PROJECT_DIR || process.cwd();

type HeaderState = 'normal' | 'update-available' | 'updating' | 'updated' | 'update-failed';

function buildHeaderContent(
  port: number,
  currentVersion: string,
  headerState: HeaderState,
  latestVersion?: string,
): string {
  const base = ` ◈ claude-trace  v${currentVersion}    port: ${port}`;
  switch (headerState) {
    case 'update-available':
      return `${base}    \x1b[33m↑ v${latestVersion} available\x1b[0m  [y] update  [q] quit`;
    case 'updating':
      return `${base}    \x1b[36m⠸ updating to v${latestVersion}...\x1b[0m  [q] quit`;
    case 'updated':
      return `${base}    \x1b[32m✓ updated to v${latestVersion} — restart to apply\x1b[0m  [q] quit`;
    case 'update-failed':
      return `${base}    \x1b[31m✗ update failed — run: npm i -g claude-trace\x1b[0m  [q] quit`;
    default:
      return `${base}    [q] quit`;
  }
}

async function main() {
  // 1. Start HTTP event server
  const server = new EventServer();
  const port = await server.start(PREFERRED_PORT);

  // 2. Patch settings.json to inject hooks
  const patch = new SettingsPatch(PROJECT_DIR);
  patch.inject(port);
  patch.setupExitHandlers();

  // Write actual port to env so the shell wrapper can use it
  process.stdout.write(`\x1b]0;claude-trace\x07`); // set terminal title

  // 3. Set up state store
  const store = new EventStore();

  server.on('event', (event) => {
    store.handleEvent(event);
  });

  // 4. Build TUI
  const { screen, header, nodeTreeBox, spriteBox, progressBox, statsBox } = createLayout();

  // ─── Update checker ──────────────────────────────────────────────────────
  let headerState: HeaderState = 'normal';
  let latestVersion: string | undefined;
  const currentVersion = getCurrentVersion();

  // Set header immediately (no network wait)
  header.setContent(buildHeaderContent(port, currentVersion, headerState, latestVersion));

  // Check for updates in background — does not block startup
  checkForUpdate().then((info) => {
    if (!info.hasUpdate) return;
    latestVersion = info.latestVersion;
    headerState = 'update-available';
    header.setContent(buildHeaderContent(port, currentVersion, headerState, latestVersion));
    screen.render();
  }).catch(() => { /* ignore network errors */ });

  // [y] — trigger update when one is available
  screen.key(['y'], () => {
    if (headerState !== 'update-available') return;
    headerState = 'updating';
    header.setContent(buildHeaderContent(port, currentVersion, headerState, latestVersion));
    screen.render();

    runUpdate()
      .then(() => {
        headerState = 'updated';
        header.setContent(buildHeaderContent(port, currentVersion, headerState, latestVersion));
        screen.render();
      })
      .catch(() => {
        headerState = 'update-failed';
        header.setContent(buildHeaderContent(port, currentVersion, headerState, latestVersion));
        screen.render();
      });
  });

  // 5. Sprite animator
  const animator = new SpriteAnimator();

  // 6. Render loop
  const renderLoop = setInterval(() => {
    tickSpinner();

    const stats = store.getStats();
    const session = store.session;

    const hasRunning = stats.runningTools > 0;
    const { state: spriteState, emotion: spriteEmotion } = resolveSprite(stats, session, hasRunning);

    updateNodeTree(nodeTreeBox, session);
    updateProgressBar(progressBox, stats);
    updateStatsFooter(statsBox, stats, session?.id);
    updateSpritePanel(spriteBox, animator, spriteState, spriteEmotion);

    screen.render();
  }, RENDER_INTERVAL_MS);

  // Handle session end
  store.on('sessionEnd', () => {
    const stats = store.getStats();
    updateStatsFooter(statsBox, stats, store.session?.id);
    screen.render();
    // Keep TUI open for 5 seconds so user can review, then exit
    setTimeout(() => {
      clearInterval(renderLoop);
      server.stop();
      patch.restore();
      screen.destroy();
      process.exit(0);
    }, 5000);
  });

  // Clean up render loop on screen exit
  screen.on('destroy', () => {
    clearInterval(renderLoop);
    server.stop();
    patch.restore();
  });

  screen.render();
}

main().catch((err) => {
  process.stderr.write(`[claude-trace] Fatal error: ${err}\n`);
  process.exit(1);
});
