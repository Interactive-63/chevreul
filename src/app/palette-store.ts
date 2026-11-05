// Developed by Interactive 63 (https://interactive63.com)
//
// Saves the palette in localStorage and reads it back defensively. Reads never throw: missing, corrupt or old data
// gives a clean default, so a bad entry cannot stop the app loading.
//
// Usage: readPalette(knownIds) on start, writePalette(palette) after each change.

export const STORAGE_KEY = 'chevreul.palette';
export const PALETTE_VERSION = 1;
// Highest number offered in the "Paints to use" select. Recipes rarely reach it, and All stays available above it.
export const MAX_PAINT_CHOICE = 8;

/** The saved choices. A null maxPaints means every paint in the palette may be used. */
export interface Palette {
  paintIds: string[];
  maxPaints: number | null;
}

/** The result of reading saved data. */
export interface PaletteRead {
  palette: Palette;
  /** Whether storage could not be reached at all. */
  blocked: boolean;
}

/** The part of the Storage interface used here, which tests can fake. */
export type PaletteStorage = Pick<Storage, 'getItem' | 'setItem'>;

// Reaching localStorage can itself throw when a browser blocks site data, so it is only touched inside a try.
const browserStorage = (): PaletteStorage => window.localStorage;

/** Returns an empty palette, which is what a first visit starts from. */
function emptyPalette(): Palette {
  return { paintIds: [], maxPaints: null };
}

/** Returns the paint limit to use for a palette, falling back to All when a limit no longer fits. */
export function limitForPalette(maxPaints: number | null, paintCount: number): number | null {
  if (maxPaints === null || !Number.isInteger(maxPaints) || maxPaints < 1) return null;
  return maxPaints > Math.min(paintCount, MAX_PAINT_CHOICE) ? null : maxPaints;
}

/** Lists the numbers the "Paints to use" select offers after All. */
export function paintLimitChoices(paintCount: number): number[] {
  return Array.from({ length: Math.min(paintCount, MAX_PAINT_CHOICE) }, (_, index) => index + 1);
}

/** Checks parsed JSON and keeps only what is still valid. */
function cleanPalette(saved: unknown, knownIds: ReadonlySet<string>): Palette {
  if (typeof saved !== 'object' || saved === null) return emptyPalette();
  const { version, paintIds, maxPaints } = saved as Record<string, unknown>;
  if (version !== PALETTE_VERSION || !Array.isArray(paintIds)) return emptyPalette();
  const known = paintIds.filter((id): id is string => typeof id === 'string' && knownIds.has(id));
  const unique = [...new Set(known)];
  return {
    paintIds: unique,
    maxPaints: limitForPalette(typeof maxPaints === 'number' ? maxPaints : null, unique.length),
  };
}

/** Reads the saved palette, dropping paints that no longer exist. */
export function readPalette(
  knownIds: ReadonlySet<string>,
  getStorage: () => PaletteStorage = browserStorage,
): PaletteRead {
  let text: string | null;
  try {
    text = getStorage().getItem(STORAGE_KEY);
  } catch {
    return { palette: emptyPalette(), blocked: true };
  }
  if (text === null) return { palette: emptyPalette(), blocked: false };
  try {
    return { palette: cleanPalette(JSON.parse(text), knownIds), blocked: false };
  } catch {
    return { palette: emptyPalette(), blocked: false };
  }
}

/** Saves the palette and reports whether it was stored. */
export function writePalette(palette: Palette, getStorage: () => PaletteStorage = browserStorage): boolean {
  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify({ version: PALETTE_VERSION, ...palette }));
    return true;
  } catch {
    return false;
  }
}
