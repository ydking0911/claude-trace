import * as blessed from 'blessed';
import { getSprite, stateFps, SpriteState, SpriteEmotion } from './sprites';
import { NodeStatus } from '../store';

// ─── State mapping ─────────────────────────────────────────────────────────

export function nodeStatusToSpriteState(status: NodeStatus): SpriteState {
  switch (status) {
    case 'running': return 'working';
    case 'pending': return 'waiting';
    case 'failed':  return 'idle';
    case 'denied':  return 'idle';
    case 'success': return 'idle';
    case 'agent':   return 'working';
    default:        return 'idle';
  }
}

export function toolCountToEmotion(completed: number, failed: number): SpriteEmotion {
  if (failed > 0) return 'sad';
  if (completed > 5) return 'happy';
  return 'neutral';
}

// ─── SpriteAnimator ────────────────────────────────────────────────────────

export class SpriteAnimator {
  private state: SpriteState = 'idle';
  private emotion: SpriteEmotion = 'neutral';
  private frameIndex = 0;
  private tickCount = 0;

  // Render loop ticks at 100ms (10 fps). We advance frames at the sprite's native fps.
  private get ticksPerFrame(): number {
    const fps = stateFps[this.state];
    return Math.round(10 / fps); // e.g. 3fps → advance every 3.3 ticks ≈ 3
  }

  setState(state: SpriteState, emotion: SpriteEmotion): void {
    if (this.state !== state || this.emotion !== emotion) {
      this.state = state;
      this.emotion = emotion;
      this.frameIndex = 0;
      this.tickCount = 0;
    }
  }

  tick(): void {
    this.tickCount++;
    if (this.tickCount >= this.ticksPerFrame) {
      const frames = getSprite(this.state, this.emotion);
      if (frames) {
        this.frameIndex = (this.frameIndex + 1) % frames.length;
      }
      this.tickCount = 0;
    }
  }

  currentFrame(): string | null {
    const frames = getSprite(this.state, this.emotion);
    if (!frames || frames.length === 0) return null;
    return frames[this.frameIndex] ?? frames[0];
  }

  getCurrentState(): { state: SpriteState; emotion: SpriteEmotion } {
    return { state: this.state, emotion: this.emotion };
  }
}

// ─── UI update ────────────────────────────────────────────────────────────

export function updateSpritePanel(
  box: blessed.Widgets.BoxElement,
  animator: SpriteAnimator,
  state: SpriteState,
  emotion: SpriteEmotion
): void {
  animator.setState(state, emotion);
  animator.tick();

  const frame = animator.currentFrame();
  if (frame) {
    box.setContent(frame);
  } else {
    // Fallback: plain text (tags: false on this box)
    const { state: s, emotion: e } = animator.getCurrentState();
    box.setContent(`[${s}/${e}]`);
  }
}
