// Developed by Interactive 63 (https://interactive63.com)
//
// Palette setup: the roll pulled up to full height as a modal dialog. The list on one side ticks paints, and the bench
// on the other hangs them as columns. Clicking a column or unticking a row takes the paint off again.
import { BASIC_SET, paintShown, setShownPaints, type Swatch, type TickFilter } from '../app/paints';
import type { AppState, Store } from '../app/state';
import { animationsDone, byId, element, stackLayer } from './dom';

// Above this many paints the bench labels turn upright to fit. Above the crowd limit they are hidden.
const MANY_PAINTS = 7;
const CROWD_PAINTS = 24;
// What the list says when the filter alone leaves it empty.
const EMPTY_FILTER: Record<TickFilter, string> = {
  all: '',
  ticked: 'No paints ticked yet.',
  unticked: 'Every paint is ticked.',
};
// Listed in full so Tailwind can see each class.
const SWATCH_MASKS = ['brush-mask-1', 'brush-mask-2', 'brush-mask-3'];

/** One row of the paint list. */
interface Row {
  label: HTMLLabelElement;
  box: HTMLInputElement;
  name: string;
}

/** Builds a row of the paint list. */
function buildRow({ paint, hex }: Swatch, index: number): Row {
  const label = element(
    'label',
    'grid min-h-11 grid-cols-[1.125rem_3.625rem_minmax(0,1fr)] items-center gap-2.25 px-3.5 py-1.5 text-sm leading-tight hover:bg-paper-dim sm:min-h-8',
  );
  const box = element('input', 'size-4.5 accent-ink');
  box.type = 'checkbox';
  const swatch = element('span', `block h-5 bg-(--paint) ${SWATCH_MASKS[index % SWATCH_MASKS.length]}`);
  swatch.style.setProperty('--paint', hex);
  label.append(box, swatch, element('span', '', paint.name));
  return { label, box, name: paint.name.toLowerCase() };
}

/** Connects palette setup to the store. */
export function mountSetup(store: Store, swatches: readonly Swatch[]): void {
  const dialog = byId<HTMLDialogElement>('setup');
  const list = byId('paint-list');
  const none = byId('paint-none');
  const search = byId<HTMLInputElement>('paint-search');
  const filter = byId<HTMLSelectElement>('paint-filter');
  const tickAll = byId<HTMLButtonElement>('tick-all');
  const bench = byId('bench');
  const benchFloor = byId('bench-floor');
  const count = byId('paint-count');
  const done = byId<HTMLButtonElement>('setup-done');
  const byPaintId = new Map(swatches.map((swatch) => [swatch.paint.id, swatch]));
  const rows = new Map(swatches.map((swatch, index) => [swatch.paint.id, buildRow(swatch, index)]));
  const leaving = new Set<string>();
  let shownIds: readonly string[] | null = null;

  /** Lists the rows the search and filter leave showing. */
  function visibleIds(): string[] {
    return [...rows].filter(([, { label }]) => !label.hidden).map(([id]) => id);
  }

  /** Applies the search text and tick filter to the list, and sets the tick-all button to match what is left. */
  function filterList(): void {
    const query = search.value.trim().toLowerCase();
    const tickFilter = filter.value as TickFilter;
    for (const { label, box, name } of rows.values()) {
      label.hidden = !paintShown(name, box.checked, query, tickFilter);
      // A row can vanish under the keyboard when its tick changes, so focus moves to the filter that hid it.
      if (label.hidden && label.contains(document.activeElement)) filter.focus();
    }
    const shown = visibleIds();
    const noMatch = query ? `No paints match "${search.value}". Try a shorter name.` : EMPTY_FILTER[tickFilter];
    none.hidden = shown.length > 0;
    none.textContent = shown.length > 0 ? '' : noMatch;
    const everyTicked = shown.length > 0 && shown.every((id) => rows.get(id)?.box.checked);
    const scope = query || tickFilter !== 'all' ? 'shown' : 'paints';
    tickAll.textContent = `${everyTicked ? 'Untick' : 'Tick'} all ${scope}`;
    tickAll.disabled = shown.length === 0;
  }

  /** Peels a paint off the bench, then removes it and leaves its layer on the floor. */
  async function takeOff(id: string): Promise<void> {
    if (leaving.has(id)) return;
    leaving.add(id);
    const column = bench.querySelector<HTMLElement>(`[data-paint="${id}"]`);
    column?.classList.add('motion-safe:animate-peel');
    if (column) await animationsDone(column);
    leaving.delete(id);
    const returnFocus = column !== null && document.activeElement === column;
    const position = store.getState().paintIds.indexOf(id);
    stackLayer(benchFloor, byPaintId.get(id)?.hex ?? '');
    store.setPaints(store.getState().paintIds.filter((paintId) => paintId !== id));
    if (returnFocus) {
      const columns = bench.querySelectorAll('button');
      (columns[position] ?? columns[position - 1] ?? search).focus();
    }
  }

  /** Builds one bench column. New paints drop in. */
  function buildColumn(id: string, index: number, isNew: boolean): HTMLButtonElement {
    const swatch = byPaintId.get(id);
    const name = swatch?.paint.name ?? '';
    const column = element(
      'button',
      `flex min-w-0 flex-[1_1_0] items-end justify-start overflow-hidden bg-(--paint) px-1 py-2 text-left text-[0.8125rem] leading-tight sm:px-1.5 sm:py-2.5 group-data-crowd:p-0 ${isNew ? 'motion-safe:animate-drop' : ''}`,
    );
    column.type = 'button';
    column.dataset.paint = id;
    column.title = `Take off ${name}`;
    column.setAttribute('aria-label', `Take off ${name}`);
    column.style.setProperty('--paint', swatch?.hex ?? '');
    const stroke = index % 2 === 0 ? 'sm:not-group-data-many:brush-1' : 'sm:not-group-data-many:brush-3';
    column.append(
      element(
        'span',
        `min-w-0 rotate-180 brush-upright px-1.25 pt-3 pb-3.5 text-paper [writing-mode:vertical-rl] group-data-crowd:hidden sm:not-group-data-many:rotate-0 sm:not-group-data-many:px-3.5 sm:not-group-data-many:py-1.5 sm:not-group-data-many:[writing-mode:horizontal-tb] sm:not-group-data-many:text-sm ${stroke}`,
        name,
      ),
    );
    return column;
  }

  /** Redraws the bench, the ticks and the count for the palette. */
  function renderPalette(paintIds: readonly string[]): void {
    const previous = new Set(shownIds ?? paintIds);
    shownIds = paintIds;
    bench.toggleAttribute('data-many', paintIds.length > MANY_PAINTS);
    bench.toggleAttribute('data-crowd', paintIds.length > CROWD_PAINTS);
    if (paintIds.length === 0) {
      const empty = element('div', 'flex flex-1 flex-col items-start justify-end gap-2 p-3.5 sm:p-8');
      empty.append(
        element('h2', 'max-w-[18ch] font-display text-[clamp(1.625rem,3.5vw,2.5rem)] leading-tight text-balance', 'Tick the paints you own'),
        element('p', 'max-w-[44ch] leading-normal max-sm:hidden', 'Each one hangs here as a column. Recipes only use the paints on this bench.'),
      );
      bench.replaceChildren(empty);
    } else {
      bench.replaceChildren(...paintIds.map((id, index) => buildColumn(id, index, !previous.has(id))));
    }
    const ticked = new Set(paintIds);
    for (const [id, { box }] of rows) box.checked = ticked.has(id);
    filterList();

    const total = paintIds.length;
    const hasWhite = paintIds.some((id) => /white/i.test(byPaintId.get(id)?.paint.name ?? ''));
    const nudge = hasWhite ? '' : '. No white yet: most lighter colours need one.';
    count.textContent = total === 0 ? 'Tick at least one paint to start.' : `${total} ${total === 1 ? 'paint' : 'paints'}${nudge}`;
    done.disabled = total === 0;
  }

  /** Follows the store: redraws on palette changes and opens or closes the dialog. */
  function render({ paintIds, firstRun, setupOpen }: AppState): void {
    if (paintIds !== shownIds) renderPalette(paintIds);
    done.textContent = firstRun ? 'Start mixing' : 'Done';
    if (setupOpen && !dialog.open) {
      search.value = '';
      filter.value = 'all';
      filterList();
      dialog.showModal();
    } else if (!setupOpen && dialog.open) {
      dialog.close();
    }
  }

  list.append(...[...rows.values()].map(({ label }) => label));
  for (const [id, { box }] of rows) {
    box.addEventListener('change', () => {
      if (box.checked) store.setPaints([...store.getState().paintIds, id]);
      else void takeOff(id);
    });
  }
  bench.addEventListener('click', (event) => {
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-paint]')?.dataset.paint;
    if (id) void takeOff(id);
  });
  search.addEventListener('input', filterList);
  filter.addEventListener('change', filterList);
  tickAll.addEventListener('click', () => {
    const shown = visibleIds();
    const tick = !shown.every((id) => rows.get(id)?.box.checked);
    store.setPaints(setShownPaints(store.getState().paintIds, shown, tick));
  });
  byId('basic-set').addEventListener('click', () => {
    const { paintIds } = store.getState();
    store.setPaints([...paintIds, ...BASIC_SET.filter((id) => !paintIds.includes(id))]);
  });
  done.addEventListener('click', () => store.closeSetup());
  // A palette is required before mixing, so Esc does nothing until there is one. The close handler backs this up, as
  // browsers let a second Esc past a prevented cancel.
  dialog.addEventListener('cancel', (event) => {
    if (store.getState().paintIds.length === 0) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    if (store.getState().paintIds.length === 0) dialog.showModal();
    else if (store.getState().setupOpen) store.closeSetup();
  });

  store.subscribe(render);
  render(store.getState());
}
