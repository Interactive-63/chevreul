// Developed by Interactive 63 (https://interactive63.com)
//
// The stage around the target: the closest mix half, the working area and its messages, the roll, and the notices.
// The working area is rebuilt only when what it should show changes, so moving a photo pin never redraws the photo.
import { BARE, closeness, rgbToHex } from '../app/format';
import type { MixClient } from '../app/mixer';
import type { Swatch } from '../app/paints';
import { runMix, type AppState, type NoticeKind, type Store } from '../app/state';
import { byId, element } from './dom';
import { showPhotoPane } from './photo';
import { showRecipe } from './recipe';

const NOTICES: Record<NoticeKind, string> = {
  storage: "This browser is blocking saved data, so you'll need to tick your paints again next visit.",
  photo: "This file won't open. Save it as a JPG or PNG and try again.",
  reach: "Your paints can't reach this colour. This is the closest they get.",
};

/** Words for the closest mix half when no recipe is showing. */
function mixNote({ target, mixing, mixFailed }: AppState): string {
  if (mixing) return 'Finding the mix';
  if (mixFailed) return 'No mix yet.';
  return target ? 'Press Find the mix to see it.' : 'Appears here next.';
}

/** Builds a message that sits at the foot of the working area, like a paint name. */
function message(title: string, body: string, action?: { label: string; run: () => void }): HTMLElement {
  const box = element('div', 'flex flex-1 flex-col items-start justify-end gap-2 p-[clamp(0.875rem,3vw,2rem)]');
  box.append(
    element('h2', 'max-w-[18ch] font-display text-[clamp(1.625rem,3.5vw,2.5rem)] leading-tight text-balance', title),
    element('p', 'max-w-[44ch] leading-normal', body),
  );
  if (action) {
    const button = element('button', 'tool bg-paper text-soot', action.label);
    button.type = 'button';
    button.addEventListener('click', action.run);
    box.append(button);
  }
  return box;
}

/** A short key for what the working area should show. A recipe is matched by identity, as each one is new. */
function workKey({ pane, photo, recipe, mixing, mixFailed, target }: AppState): unknown {
  if (pane === 'photo') return photo ? 'photo' : 'drop';
  if (recipe) return recipe;
  if (mixing) return 'mixing';
  if (mixFailed) return 'failed';
  return target ? 'ready' : 'empty';
}

/** Connects the stage to the store. */
export function mountStage(store: Store, mixer: MixClient, swatches: readonly Swatch[]): void {
  const work = byId('work');
  const floor = byId('floor');
  const mixHalf = byId('mix-half');
  const mixNoteText = byId('mix-note');
  const notice = byId('notice');
  const noticeText = byId('notice-text');
  const roll = byId('roll');
  const hexes = new Map(swatches.map(({ paint, hex }) => [paint.id, hex]));
  const names = new Map(swatches.map(({ paint }) => [paint.id, paint.name]));
  let shownKey: unknown = null;
  let shownRoll: readonly string[] | null = null;
  let leaveWork = (): void => {};

  /** Rebuilds the working area for the current state. */
  function renderWork(state: AppState): void {
    leaveWork();
    leaveWork = () => {};
    floor.replaceChildren();
    work.setAttribute('aria-label', state.pane === 'photo' ? 'Photo' : 'Recipe');
    if (state.pane === 'photo') leaveWork = showPhotoPane(work, store);
    else if (state.recipe) leaveWork = showRecipe(work, floor, state.recipe, swatches);
    else if (state.mixing) work.replaceChildren(message('Finding the mix', 'Working through your paints.'));
    else if (state.mixFailed) {
      work.replaceChildren(
        message(
          'The mix stopped before it finished',
          'Your target and paints are still here. Try again, and reload the page if it keeps stopping.',
          { label: 'Try again', run: () => void runMix(store, mixer) },
        ),
      );
    } else if (state.target) {
      work.replaceChildren(message('Ready to mix', 'Press Find the mix to work it out from your paints.'));
    } else {
      work.replaceChildren(
        message('Choose a colour to match', 'Use the colour box, type a hex code, or pick from a photo.'),
      );
    }
  }

  /** Draws the paints in the roll when the palette changes. */
  function renderRoll(paintIds: readonly string[]): void {
    if (paintIds === shownRoll) return;
    shownRoll = paintIds;
    roll.replaceChildren(
      ...paintIds.map((id) => {
        const chip = element('li', 'h-8.5 w-5.5 flex-none border border-soot bg-(--paint)');
        chip.style.setProperty('--paint', hexes.get(id) ?? '');
        chip.title = names.get(id) ?? '';
        return chip;
      }),
    );
  }

  /** Redraws the stage from the store. */
  function render(state: AppState): void {
    const { recipe } = state;
    const mixHex = recipe ? rgbToHex(recipe.rgb) : null;
    mixHalf.style.setProperty('--paint', mixHex ?? BARE);
    mixNoteText.textContent =
      recipe && mixHex
        ? `${mixHex.toUpperCase()}, off by ${recipe.deltaE2000.toFixed(1)}: ${closeness(recipe.deltaE2000)}`
        : mixNote(state);

    notice.hidden = state.notice === null;
    noticeText.textContent = state.notice ? NOTICES[state.notice] : '';

    renderRoll(state.paintIds);

    const key = workKey(state);
    if (key !== shownKey) {
      shownKey = key;
      renderWork(state);
    }
  }

  byId('notice-close').addEventListener('click', () => store.dismissNotice());
  byId('edit-paints').addEventListener('click', () => store.openSetup());

  store.subscribe(render);
  render(store.getState());
}
