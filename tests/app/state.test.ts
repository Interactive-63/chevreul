// Developed by Interactive 63 (https://interactive63.com)
//
// Tests the rule that a result never outlives its inputs, and how a mix run and a failed save are recorded.
import { describe, expect, it, vi } from 'vitest';
import type { MixClient } from '../../src/app/mixer';
import type { Palette } from '../../src/app/palette-store';
import { createStore, runMix, type StoreEffects } from '../../src/app/state';
import { OUT_OF_REACH } from '../../src/app/format';
import type { Recipe } from '../../src/colour/solver';

const PALETTE: Palette = { paintIds: ['white', 'black', 'red'], maxPaints: null };
const CLOSE_RECIPE = { deltaE2000: 1 } as Recipe;
const FAR_RECIPE = { deltaE2000: OUT_OF_REACH } as Recipe;

/** Builds a store with spy effects. */
function setUp(palette: Palette = PALETTE, save: StoreEffects['save'] = () => true) {
  const cancelMix = vi.fn();
  return { store: createStore(palette, { save, cancelMix }), cancelMix };
}

describe('createStore', () => {
  it('opens setup only when no palette is saved', () => {
    expect(setUp().store.getState().setupOpen).toBe(false);
    const first = setUp({ paintIds: [], maxPaints: null }).store.getState();
    expect(first.setupOpen).toBe(true);
    expect(first.firstRun).toBe(true);
  });

  it('clears the recipe when the target, palette or limit changes', () => {
    const { store } = setUp();
    const changes = [
      () => store.setTarget('#000000'),
      () => store.setPaints(['white']),
      () => store.setMaxPaints(1),
    ];
    for (const change of changes) {
      store.finishMix(CLOSE_RECIPE);
      change();
      expect(store.getState().recipe).toBeNull();
    }
  });

  it('keeps the recipe when nothing actually changed', () => {
    const { store } = setUp();
    store.setTarget('#112233');
    store.finishMix(CLOSE_RECIPE);
    store.setTarget('#112233');
    store.setPaints([...PALETTE.paintIds]);
    store.setMaxPaints(null);
    store.openSetup();
    store.closeSetup();
    expect(store.getState().recipe).toBe(CLOSE_RECIPE);
  });

  it('cancels a running mix when the target changes', () => {
    const { store, cancelMix } = setUp();
    store.setTarget('#112233');
    store.startMix();
    store.setTarget('#445566');
    expect(cancelMix).toHaveBeenCalledOnce();
    expect(store.getState().mixing).toBe(false);
  });

  it('warns when a recipe is out of reach, and clears the warning with the recipe', () => {
    const { store } = setUp();
    store.finishMix(FAR_RECIPE);
    expect(store.getState().notice).toBe('reach');
    store.setTarget('#000000');
    expect(store.getState().notice).toBeNull();
  });

  it('drops a paint limit the smaller palette cannot meet', () => {
    const { store } = setUp();
    store.setMaxPaints(3);
    store.setPaints(['white']);
    expect(store.getState().maxPaints).toBeNull();
  });

  it('saves palette and limit changes', () => {
    const save = vi.fn(() => true);
    const { store } = setUp(PALETTE, save);
    store.setMaxPaints(2);
    expect(save).toHaveBeenLastCalledWith({ paintIds: PALETTE.paintIds, maxPaints: 2 });
  });

  it('warns once about a failed save, and waits for setup to close', () => {
    const { store } = setUp({ paintIds: [], maxPaints: null }, () => false);
    store.setPaints(['white']);
    expect(store.getState().notice).toBeNull();
    store.closeSetup();
    expect(store.getState().notice).toBe('storage');
    store.dismissNotice();
    store.setPaints(['white', 'black']);
    store.closeSetup();
    expect(store.getState().notice).toBeNull();
  });
});

describe('runMix', () => {
  /** A client that resolves or rejects as a test says. */
  function client(mix: MixClient['mix']): MixClient {
    return { mix, cancel: () => {} };
  }

  it('does nothing without a target', async () => {
    const { store } = setUp();
    const mix = vi.fn(async () => CLOSE_RECIPE);
    await runMix(store, client(mix));
    expect(mix).not.toHaveBeenCalled();
  });

  it('records the recipe', async () => {
    const { store } = setUp();
    store.setTarget('#ff0000');
    const mix = vi.fn(async () => CLOSE_RECIPE);
    await runMix(store, client(mix));
    expect(mix).toHaveBeenCalledWith({ r: 255, g: 0, b: 0 }, PALETTE.paintIds, null);
    expect(store.getState()).toMatchObject({ recipe: CLOSE_RECIPE, mixing: false });
  });

  it('keeps the target and palette when a mix fails', async () => {
    const { store } = setUp();
    store.setTarget('#ff0000');
    await runMix(store, client(async () => Promise.reject(new Error('stopped'))));
    expect(store.getState()).toMatchObject({ mixFailed: true, mixing: false, target: '#ff0000' });
  });

  it('leaves no trace of a cancelled mix', async () => {
    const { store } = setUp();
    store.setTarget('#ff0000');
    await runMix(store, client(async () => null));
    store.setTarget('#00ff00');
    expect(store.getState()).toMatchObject({ recipe: null, mixFailed: false, target: '#00ff00' });
  });
});
