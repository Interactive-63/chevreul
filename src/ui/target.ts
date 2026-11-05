// Developed by Interactive 63 (https://interactive63.com)
//
// The target half of the left column: colour box, hex field, paint limit, and the photo and Find the mix buttons.
import { BARE, PAPER, parseHex, textOn } from '../app/format';
import type { MixClient } from '../app/mixer';
import { paintLimitChoices } from '../app/palette-store';
import { runMix, type AppState, type Store } from '../app/state';
import { byId, element } from './dom';

const NO_TARGET_NOTE = 'Choose a colour here.';
// The value of the All option in the paint limit select.
const ALL_PAINTS = 'all';

/** Connects the target controls to the store. */
export function mountTarget(store: Store, mixer: MixClient): void {
  const half = byId('target-half');
  const note = byId('target-note');
  const colourBox = byId<HTMLInputElement>('colour-box');
  const hexField = byId<HTMLInputElement>('hex');
  const hexError = byId('hex-error');
  const limit = byId<HTMLSelectElement>('paint-limit');
  const usePhoto = byId<HTMLButtonElement>('use-photo');
  const findMix = byId<HTMLButtonElement>('find-mix');
  let limitOptionsFor = -1;

  /** Shows or hides the hex error, keeping the field's invalid state in step. */
  function showHexError(visible: boolean): void {
    hexError.hidden = !visible;
    if (visible) hexField.setAttribute('aria-invalid', 'true');
    else hexField.removeAttribute('aria-invalid');
  }

  /** Rebuilds the limit options when the palette size changes. */
  function renderLimitOptions(paintCount: number): void {
    if (paintCount === limitOptionsFor) return;
    limitOptionsFor = paintCount;
    const all = element('option', '', 'All');
    all.value = ALL_PAINTS;
    const numbers = paintLimitChoices(paintCount).map((choice) => {
      const option = element('option', '', String(choice));
      option.value = String(choice);
      return option;
    });
    limit.replaceChildren(all, ...numbers);
  }

  /** Redraws the half from the store. */
  function render({ target, paintIds, maxPaints, mixing, pane, photo }: AppState): void {
    half.style.setProperty('--paint', target ?? BARE);
    half.style.setProperty('--on', target ? textOn(target) : PAPER);
    note.textContent = target ? target.toUpperCase() : NO_TARGET_NOTE;
    if (target) {
      colourBox.value = target;
      if (document.activeElement !== hexField) {
        hexField.value = target.toUpperCase();
        showHexError(false);
      }
    }
    renderLimitOptions(paintIds.length);
    limit.value = maxPaints === null ? ALL_PAINTS : String(maxPaints);
    usePhoto.textContent = pane === 'photo' ? 'Close photo' : photo ? 'Back to photo' : 'Use a photo';
    findMix.disabled = target === null || mixing;
    findMix.textContent = mixing ? 'Finding the mix' : 'Find the mix';
  }

  colourBox.addEventListener('input', () => store.setTarget(colourBox.value));
  hexField.addEventListener('input', () => showHexError(false));
  hexField.addEventListener('change', () => {
    if (hexField.value.trim() === '') return;
    const hex = parseHex(hexField.value);
    showHexError(hex === null);
    if (hex) {
      store.setTarget(hex);
      hexField.value = hex.toUpperCase();
    }
  });
  limit.addEventListener('change', () => {
    store.setMaxPaints(limit.value === ALL_PAINTS ? null : Number(limit.value));
  });
  usePhoto.addEventListener('click', () => {
    store.showPane(store.getState().pane === 'photo' ? 'mix' : 'photo');
  });
  findMix.addEventListener('click', () => void runMix(store, mixer));

  store.subscribe(render);
  render(store.getState());
}
