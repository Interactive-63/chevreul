// Developed by Interactive 63 (https://interactive63.com)
//
// Web Worker running the solver off the main thread, so a large palette cannot freeze the page.
// It receives a MixRequest and replies with a MixReply carrying the same id.
import { loadPaints } from '../colour/dataset';
import { unmix } from '../colour/solver';
import type { MixReply, MixRequest } from '../app/mixer';

// Only the top recipe is shown, so asking for more would be wasted work.
const RECIPES_WANTED = 1;

/** Solves one request against the paints it names. */
self.onmessage = ({ data }: MessageEvent<MixRequest>): void => {
  const wanted = new Set(data.paintIds);
  const palette = loadPaints().filter((paint) => wanted.has(paint.id));
  const [recipe] = unmix(data.target, palette, {
    maxPaints: data.maxPaints ?? undefined,
    recipes: RECIPES_WANTED,
  });
  const reply: MixReply = { id: data.id, recipe: recipe ?? null };
  self.postMessage(reply);
};
