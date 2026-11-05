// Developed by Interactive 63 (https://interactive63.com)
//
// The recipe: one column per paint sized by its percentage, or one band per paint on a phone. Paints drop in one at a
// time and each leaves a thin layer on the floor. The list is an ordered list, so a screen reader hears the paints and
// amounts in recipe order. The amounts read as percentages or as simple whole parts, and columns stay sized by
// percentage either way.
import { closeness } from '../app/format';
import type { Swatch } from '../app/paints';
import type { Recipe } from '../colour/solver';
import { animationsDone, element, stackLayer } from './dom';

// Below this share a column is too thin for full-size labels.
const TINY_PERCENT = 5;
// Listed in full so Tailwind can see each class, and alternated so neighbouring labels do not repeat one stroke.
const PERCENT_STROKES = ['brush-1', 'brush-3'];
const NAME_STROKES = ['brush-3', 'brush-2'];
// A name that would wrap turns upright, so it stays readable rather than breaking across lines. Prefixed sm: because a
// phone's wide bands never need it.
const UPRIGHT_NAME =
  'sm:mt-1 sm:rotate-180 sm:brush-upright sm:px-1.5 sm:pt-3 sm:pb-3.5 sm:wrap-normal sm:[writing-mode:vertical-rl]';
// A label taller than this many lines has wrapped. The margin allows for rounding in measured heights.
const WRAPPED_LINES = 1.5;

/** Whether the amounts show as percentages or parts. Held by the stage, so the choice carries to the next recipe. */
export interface RecipeView {
  parts: boolean;
}

/** One paint's labels, which change after the column is built. */
interface PartLabels {
  amount: HTMLElement;
  name: HTMLElement;
}

/** Whether a horizontal label has run onto a second line. */
function hasWrapped(label: HTMLElement): boolean {
  const { lineHeight, paddingTop, paddingBottom } = getComputedStyle(label);
  const textHeight = label.clientHeight - parseFloat(paddingTop) - parseFloat(paddingBottom);
  return textHeight > parseFloat(lineHeight) * WRAPPED_LINES;
}

/** Turns upright each name that would wrap at the current width, measuring it horizontal first. */
function fitNames(names: readonly HTMLElement[]): void {
  const upright = UPRIGHT_NAME.split(' ');
  for (const name of names) {
    name.classList.remove(...upright);
    if (hasWrapped(name)) name.classList.add(...upright);
  }
}

/** Builds one paint's column, hidden until its turn to drop. */
function partItem(name: string, percent: number, hex: string, index: number): { item: HTMLLIElement; labels: PartLabels } {
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
  const amount = element(
    'span',
    `${PERCENT_STROKES[index % PERCENT_STROKES.length]} py-[0.14em] pr-[0.42em] pl-[0.3em] font-display leading-none text-paper ${size}`,
    `${percent}%`,
  );
  const nameLabel = element(
    'span',
    `${NAME_STROKES[index % NAME_STROKES.length]} order-first py-1.5 pr-4.5 pl-3 leading-tight wrap-anywhere text-paper sm:order-none ${tiny ? `text-[0.6875rem] ${UPRIGHT_NAME}` : 'text-[0.8125rem] sm:text-sm'}`,
    name,
  );
  item.append(amount, nameLabel);
  return { item, labels: { amount, name: nameLabel } };
}

/**
 * Draws a recipe into the working area and drops the paints in order.
 * Returns a function that stops the sequence, for when the recipe is replaced part way through.
 */
export function showRecipe(
  work: HTMLElement,
  floor: HTMLElement,
  recipe: Recipe,
  swatches: readonly Swatch[],
  view: RecipeView,
): () => void {
  const hexes = new Map(swatches.map(({ paint, hex }) => [paint.id, hex]));
  const hexOf = (id: string): string => hexes.get(id) ?? '';
  const list = element('ol', 'flex min-h-0 flex-1 flex-col overflow-hidden max-sm:overflow-y-auto sm:flex-row');
  list.setAttribute('role', 'list');
  const items = recipe.parts.map(({ paint, percent }, index) => {
    const { item, labels } = partItem(paint.name, percent, hexOf(paint.id), index);
    list.append(item);
    return { item, labels, hex: hexOf(paint.id) };
  });
  const captionText = element('p', 'min-w-0', '');
  const caption = element(
    'div',
    'flex flex-none items-center justify-between gap-2.5 bg-soot px-3.5 py-1 font-mono text-[0.6875rem] text-paper',
  );
  caption.append(captionText);
  const simple = recipe.simple;

  /** Writes the amounts and caption for the current view. A plain number reads as a part once the caption says so. */
  function showAmounts(): void {
    items.forEach(({ labels }, index) => {
      const part = simple.parts[index] ?? 0;
      labels.amount.textContent = view.parts ? String(part) : `${recipe.parts[index]?.percent}%`;
      if (view.parts) labels.amount.setAttribute('aria-label', `${part} ${part === 1 ? 'part' : 'parts'}`);
      else labels.amount.removeAttribute('aria-label');
    });
    captionText.textContent = view.parts
      ? `Parts by volume, off by ${simple.deltaE2000.toFixed(1)}: ${closeness(simple.deltaE2000)}`
      : 'Percentages by volume';
  }

  if (recipe.parts.length > 1) {
    const toggle = element('button', 'tool flex-none border border-current', '');
    toggle.type = 'button';
    const labelToggle = (): void => {
      toggle.textContent = view.parts ? 'Show percentages' : 'Simplify to parts';
    };
    toggle.addEventListener('click', () => {
      view.parts = !view.parts;
      labelToggle();
      showAmounts();
    });
    labelToggle();
    caption.append(toggle);
  }
  showAmounts();
  work.replaceChildren(list, caption);

  const names = items.map(({ labels }) => labels.name).filter((_, index) => (recipe.parts[index]?.percent ?? 0) >= TINY_PERCENT);
  const resizes = new ResizeObserver(() => fitNames(names));
  resizes.observe(list);

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
    resizes.disconnect();
  };
}
