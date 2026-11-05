// Developed by Interactive 63 (https://interactive63.com)
//
// Tests that saved palettes read back safely whatever is in storage, and that the paint limit falls back to All.
import { describe, expect, it } from 'vitest';
import {
  limitForPalette,
  MAX_PAINT_CHOICE,
  PALETTE_VERSION,
  paintLimitChoices,
  readPalette,
  STORAGE_KEY,
  writePalette,
  type PaletteStorage,
} from '../../src/app/palette-store';

const KNOWN = new Set(['white', 'black', 'red']);
const EMPTY = { paintIds: [], maxPaints: null };

/** Builds in-memory storage, optionally holding some text under the palette key. */
function fakeStorage(text?: string): () => PaletteStorage {
  const values = new Map<string, string>(text === undefined ? [] : [[STORAGE_KEY, text]]);
  const storage: PaletteStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
  return () => storage;
}

/** Storage whose very access throws, as it does when a browser blocks site data. */
function blockedStorage(): PaletteStorage {
  throw new DOMException('Blocked', 'SecurityError');
}

/** Saved text in the current format. */
function saved(paintIds: unknown, maxPaints: unknown = null, version: unknown = PALETTE_VERSION): string {
  return JSON.stringify({ version, paintIds, maxPaints });
}

describe('readPalette', () => {
  it('gives an empty palette when nothing is saved', () => {
    expect(readPalette(KNOWN, fakeStorage())).toEqual({ palette: EMPTY, blocked: false });
  });

  it('reads back what was written', () => {
    const storage = fakeStorage();
    expect(writePalette({ paintIds: ['white', 'red'], maxPaints: 2 }, storage)).toBe(true);
    expect(readPalette(KNOWN, storage).palette).toEqual({ paintIds: ['white', 'red'], maxPaints: 2 });
  });

  it('ignores corrupt data', () => {
    for (const text of ['{not json', 'null', '7', '"text"', saved('white')]) {
      expect(readPalette(KNOWN, fakeStorage(text)).palette).toEqual(EMPTY);
    }
  });

  it('ignores data from another version', () => {
    expect(readPalette(KNOWN, fakeStorage(saved(['white'], null, 0))).palette).toEqual(EMPTY);
  });

  it('drops unknown, duplicate and non-string ids', () => {
    const text = saved(['white', 'retired', 'white', 4, 'black']);
    expect(readPalette(KNOWN, fakeStorage(text)).palette.paintIds).toEqual(['white', 'black']);
  });

  it('reports storage that throws', () => {
    expect(readPalette(KNOWN, blockedStorage)).toEqual({ palette: EMPTY, blocked: true });
  });

  it('falls back to All when the saved limit is above the palette size', () => {
    expect(readPalette(KNOWN, fakeStorage(saved(['white', 'black'], 3))).palette.maxPaints).toBeNull();
  });

  it('falls back to All when the saved limit is not a usable number', () => {
    for (const limit of [0, -1, 1.5, '2']) {
      expect(readPalette(KNOWN, fakeStorage(saved(['white', 'black'], limit))).palette.maxPaints).toBeNull();
    }
  });
});

describe('writePalette', () => {
  it('reports storage that throws', () => {
    expect(writePalette(EMPTY, blockedStorage)).toBe(false);
  });
});

describe('paint limit', () => {
  it('keeps a limit that fits', () => {
    expect(limitForPalette(2, 2)).toBe(2);
  });

  it('keeps All on a growing palette', () => {
    expect(limitForPalette(null, 50)).toBeNull();
  });

  it('offers up to the palette size, capped at the largest choice', () => {
    expect(paintLimitChoices(3)).toEqual([1, 2, 3]);
    expect(paintLimitChoices(100)).toHaveLength(MAX_PAINT_CHOICE);
  });
});
