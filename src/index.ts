import { EventServer } from './server';
import { EventStore } from './store';
import { SettingsPatch } from './hooks/settingsPatch';
import { createLayout } from './ui/layout';
import { updateNodeTree, tickSpinner } from './ui/nodeTree';
import { updateProgressBar } from './ui/progressBar';
import { updateStatsFooter } from './ui/statsFooter';
import { SpriteAnimator, updateSpritePanel, nodeStatusToSpriteState, toolCountToEmotion } from './ui/spritePanel';

const RENDER_INTERVAL_MS = 100;
const PREFERRED_PORT = parseInt(process.env.CLAUDE_TRACE_PORT || '7337', 10);
const PROJECT_DIR = process.env.CLAUDE_TRACE_PROJECT_DIR || process.cwd();

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

  // Update header with session info and port
  header.setContent(` ◈ claude-trace  v1.0.0    port: ${port}    [q] quit`);

  // 5. Sprite animator
  const animator = new SpriteAnimator();

  // 6. Render loop
  const renderLoop = setInterval(() => {
    tickSpinner();

    const stats = store.getStats();
    const session = store.session;

    // Determine sprite state from current tool activity
    const hasRunning = stats.totalTools > stats.completedTools + stats.failedTools;
    const spriteState = hasRunning
      ? nodeStatusToSpriteState('running')
      : session
        ? nodeStatusToSpriteState('success')
        : 'idle';
    const spriteEmotion = toolCountToEmotion(stats.completedTools, stats.failedTools);

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
