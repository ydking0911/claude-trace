export { SpriteState, SpriteEmotion, spriteFrames, stateFps } from './data';
import { spriteFrames, SpriteState, SpriteEmotion } from './data';

/**
 * Look up ANSI frames for a given state+emotion.
 * Fallback chain: exact → sad (for sob) → neutral.
 */
export function getSprite(
  state: SpriteState,
  emotion: SpriteEmotion,
): string[] | null {
  const exact = spriteFrames[`${state}_${emotion}`];
  if (exact) return exact;
  if (emotion === 'sob') {
    const sad = spriteFrames[`${state}_sad`];
    if (sad) return sad;
  }
  return spriteFrames[`${state}_neutral`] ?? null;
}
