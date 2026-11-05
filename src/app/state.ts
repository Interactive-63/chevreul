// Developed by Interactive 63 (https://interactive63.com)
//
// The single store for the app: palette, target, photo and recipe. Screens subscribe and redraw from it.
// Any change to the target, palette or paint limit clears the result, so a recipe never sits beside a target it was
// not made for. The store holds no DOM code beyond the photo it is handed.
import type { Recipe } from '../colour/solver';
import { hexToRgb, isOutOfReach } from './format';
import type { MixClient } from './mixer';
import { limitForPalette, type Palette } from './palette-store';
import type { DecodedPhoto } from './photo';

/** What fills the working area: the recipe side, or the photo side. */
export type Pane = 'mix' | 'photo';

/** The warnings shown across the top of the page. */
export type NoticeKind = 'storage' | 'photo' | 'reach';

/** A decoded photo and the source pixel the pin sits on, null until first placed. */
export interface PhotoPick extends DecodedPhoto {
  pin: { x: number; y: number } | null;
}

/** Everything the screens draw from. */
export interface AppState {
  paintIds: readonly string[];
  maxPaints: number | null;
  /** The target as a lower-case hex code, or null before one is chosen. */
  target: string | null;
  photo: PhotoPick | null;
  pane: Pane;
  recipe: Recipe | null;
  mixing: boolean;
  mixFailed: boolean;
  setupOpen: boolean;
  /** True until the first palette is finished, which changes the wording of setup. */
  firstRun: boolean;
  notice: NoticeKind | null;
}

/** What the store needs from outside. */
export interface StoreEffects {
  /** Saves the palette and reports whether it was stored. */
  save: (palette: Palette) => boolean;
  /** Abandons any running mix. */
  cancelMix: () => void;
}

/** The store's reads and actions. */
export interface Store {
  getState(): AppState;
  /** Registers a listener for every change, and returns a function that removes it. */
  subscribe(listener: (state: AppState) => void): () => void;
  setTarget(hex: string): void;
  setPaints(paintIds: readonly string[]): void;
  setMaxPaints(maxPaints: number | null): void;
  setPhoto(photo: DecodedPhoto | null): void;
  /** Moves the pin and sets the target from what sits under it. */
  pickFromPhoto(x: number, y: number, hex: string): void;
  showPane(pane: Pane): void;
  openSetup(): void;
  closeSetup(): void;
  startMix(): void;
  finishMix(recipe: Recipe): void;
  failMix(): void;
  showNotice(kind: NoticeKind): void;
  dismissNotice(): void;
}

/** Whether two lists hold the same ids in the same order. */
function sameIds(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

/** Creates the store from the saved palette. Setup opens by itself when no palette is saved. */
export function createStore(palette: Palette, effects: StoreEffects): Store {
  const firstRun = palette.paintIds.length === 0;
  let state: AppState = {
    paintIds: palette.paintIds,
    maxPaints: palette.maxPaints,
    target: null,
    photo: null,
    pane: 'mix',
    recipe: null,
    mixing: false,
    mixFailed: false,
    setupOpen: firstRun,
    firstRun,
    notice: null,
  };
  const listeners = new Set<(state: AppState) => void>();
  let unsaved = false;
  let warnedUnsaved = false;

  /** Applies a change and tells every listener. */
  function update(change: Partial<AppState>): void {
    state = { ...state, ...change };
    for (const listener of listeners) listener(state);
  }

  /** The change that removes any result, stopping a running mix first. */
  function clearedResult(): Partial<AppState> {
    if (state.mixing) effects.cancelMix();
    return {
      recipe: null,
      mixing: false,
      mixFailed: false,
      notice: state.notice === 'reach' ? null : state.notice,
    };
  }

  /** Raises the storage warning the first time saving fails. It waits for setup, which would otherwise hide it. */
  function warnIfUnsaved(): void {
    if (!unsaved || warnedUnsaved || state.setupOpen) return;
    warnedUnsaved = true;
    update({ notice: 'storage' });
  }

  /** Saves the current palette, remembering any failure. */
  function persist(): void {
    if (!effects.save({ paintIds: [...state.paintIds], maxPaints: state.maxPaints })) unsaved = true;
    warnIfUnsaved();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setTarget(hex) {
      if (hex !== state.target) update({ ...clearedResult(), target: hex });
    },
    setPaints(paintIds) {
      if (sameIds(paintIds, state.paintIds)) return;
      update({ ...clearedResult(), paintIds, maxPaints: limitForPalette(state.maxPaints, paintIds.length) });
      persist();
    },
    setMaxPaints(maxPaints) {
      if (maxPaints === state.maxPaints) return;
      update({ ...clearedResult(), maxPaints });
      persist();
    },
    setPhoto(photo) {
      update({ photo: photo && { ...photo, pin: null }, pane: 'photo' });
    },
    pickFromPhoto(x, y, hex) {
      if (!state.photo) return;
      const moved = { ...state.photo, pin: { x, y } };
      if (hex === state.target) update({ photo: moved });
      else update({ ...clearedResult(), photo: moved, target: hex });
    },
    showPane(pane) {
      update({ pane });
    },
    openSetup() {
      update({ setupOpen: true });
    },
    closeSetup() {
      update({ setupOpen: false, firstRun: false });
      warnIfUnsaved();
    },
    startMix() {
      update({ ...clearedResult(), mixing: true, pane: 'mix' });
    },
    finishMix(recipe) {
      const unreachable = isOutOfReach(recipe.deltaE2000);
      update({ recipe, mixing: false, notice: unreachable ? 'reach' : state.notice });
    },
    failMix() {
      update({ mixing: false, mixFailed: true });
    },
    showNotice(kind) {
      update({ notice: kind });
    },
    dismissNotice() {
      update({ notice: null });
    },
  };
}

/** Runs a mix for the current target and palette, and records how it ended. A cancelled mix leaves no trace. */
export async function runMix(store: Store, mixer: MixClient): Promise<void> {
  const { target, paintIds, maxPaints, mixing } = store.getState();
  if (target === null || mixing) return;
  store.startMix();
  try {
    const recipe = await mixer.mix(hexToRgb(target), paintIds, maxPaints);
    if (recipe) store.finishMix(recipe);
  } catch {
    store.failMix();
  }
}
