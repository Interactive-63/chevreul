// Developed by Interactive 63 (https://interactive63.com)
//
// The recipe: one column per paint sized by its percentage, or one band per paint on a phone. Paints drop in one at a
// time and each leaves a thin layer on the floor. The list is an ordered list, so a screen reader hears the paints and
// percentages in recipe order.
import type { Swatch } from '../app/paints';
import type { Recipe } from '../colour/solver';
import { animationsDone, element, stackLayer } from './dom';

// Below this share a column is too thin for full-size labels.
const TINY_PERCENT = 5;
// Listed in full so Tailwind can see each class, and alternated so neighbouring labels do not repeat one stroke.
const PERCENT_STROKES = ['brush-1', 'brush-3'];
const NAME_STROKES = ['brush-3', 'brush-2'];
// A thin column turns its name upright, so a long name stays readable rather than breaking letter by letter.
const TINY_NAME =
  'text-[0.6875rem] sm:mt-1 sm:rotate-180 sm:brush-upright sm:px-1.5 sm:pt-3 sm:pb-3.5 sm:wrap-normal sm:[writing-mode:vertical-rl]';

/** Builds one paint's column, hidden until its turn to drop. */
function partItem(name: string, percent: number, hex: string, index: number): HTMLLIElement {
  const tiny = percent < TINY_PERCENT;
  const item = element(
    'li',
    `invisible flex min-h-11.5 min-w-0 flex-row items-center justify-between gap-2 bg-(--paint) px-3.5 py-2 [flex:var(--grow)_1_0] sm:flex-col sm:items-start sm:justify-end sm:gap-0 sm:p-3 ${tiny ? 'sm:min-w-18.5' : ''}`,
  );
  item.style.setProperty('--paint', hex);
  item.style.setProperty('--grow', String(percent));
  const size = tiny
    ? 'text-[1.625rem]'
    : 'text-[1.625rem] sm:text-[clamp(1.875rem,4.5vw,3.75rem)]';
  const percentLabel = element(
    'span',
    `${PERCENT_STROKES[index % PERCENT_STROKES.length]} py-[0.14em] pr-[0.42em] pl-[0.3em] font-display leading-none text-paper ${size}`,
    `${percent}%`,
  );
  const nameLabel = element(
    'span',
    `${NAME_STROKES[index % NAME_STROKES.length]} order-first py-1.5 pr-4.5 pl-3 leading-tight wrap-anywhere text-paper sm:order-none ${tiny ? TINY_NAME : 'text-[0.8125rem] sm:text-sm'}`,
    name,
  );
  item.append(percentLabel, nameLabel);
  return item;
}

/**
 * Draws a recipe into the working area and drops the paints in order.
 * Returns a function that stops the sequence, for when the recipe is replaced part way through.
 */
export function showRecipe(work: HTMLElement, floor: HTMLElement, recipe: Recipe, swatches: readonly Swatch[]): () => void {
  const hexes = new Map(swatches.map(({ paint, hex }) => [paint.id, hex]));
  const hexOf = (id: string): string => hexes.get(id) ?? '';
  const list = element('ol', 'flex min-h-0 flex-1 flex-col overflow-hidden max-sm:overflow-y-auto sm:flex-row');
  list.setAttribute('role', 'list');
  const items = recipe.parts.map(({ paint, percent }, index) => {
    const item = partItem(paint.name, percent, hexOf(paint.id), index);
    list.append(item);
    return { item, hex: hexOf(paint.id) };
  });
  const caption = element('p', 'flex-none bg-soot px-3.5 py-1 font-mono text-[0.6875rem] text-paper', 'Percentages by volume');
  work.replaceChildren(list, caption);

  let stopped = false;
  void (async () => {
    for (const { item, hex } of items) {
      if (stopped) return;
      item.classList.remove('invisible');
      item.classList.add('motion-safe:animate-drop');
      await animationsDone(item);
      if (stopped) return;
      stackLayer(floor, hex);
    }
  })();
  return () => {
    stopped = true;
  };
}
