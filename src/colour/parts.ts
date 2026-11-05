// Developed by Interactive 63 (https://interactive63.com)
//
// Simple whole parts for a recipe. Percentages rarely share a common factor, so 86:7:7 cannot be reduced exactly, yet
// 12:1:1 mixes to almost the same colour. This tries each total number of parts from the smallest up and keeps the
// first whose mix a painter could not tell from the exact recipe. Judging by colour rather than by share matters
// because strong paints are sensitive: 1% of a dark blue cannot round up to one part in ten.
//
// Usage: simplestParts([86, 7, 7], shiftOf) gives [12, 1, 1], where shiftOf reports how far those parts move the mix.

// How far simple parts may move the mix from the exact recipe, in CIEDE2000. Around the smallest visible difference.
export const MAX_PARTS_SHIFT = 1;
// Percentages sum to this, so this total always reproduces the recipe exactly and the search always ends.
const PERCENT_TOTAL = 100;

/** Finds the largest whole number dividing both values. */
function greatestDivisor(first: number, second: number): number {
  return second === 0 ? first : greatestDivisor(second, first % second);
}

/**
 * Shares out a total number of parts in proportion to the percentages, giving every paint at least one part and
 * leftovers to the largest remainders. Returns null when the total is too small to give every paint a part.
 */
export function shareParts(percents: readonly number[], total: number): number[] | null {
  if (total < percents.length) return null;
  const exact = percents.map((percent) => (percent * total) / PERCENT_TOTAL);
  const parts = exact.map((value) => Math.max(1, Math.floor(value)));
  let spare = total - parts.reduce((sum, value) => sum + value, 0);
  // Raising small paints to one part can overshoot the total, so the excess comes off the largest.
  for (; spare < 0; spare++) {
    const largest = parts.indexOf(Math.max(...parts));
    parts[largest] = (parts[largest] as number) - 1;
  }
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - (parts[index] as number) }))
    .sort((first, second) => second.remainder - first.remainder);
  for (const { index } of byRemainder) {
    if (spare <= 0) break;
    parts[index] = (parts[index] as number) + 1;
    spare--;
  }
  return parts;
}

/**
 * Finds the smallest whole parts whose mix stays within MAX_PARTS_SHIFT of the exact recipe.
 * shiftOf reports the CIEDE2000 distance between a set of parts and the exact recipe.
 */
export function simplestParts(percents: readonly number[], shiftOf: (parts: readonly number[]) => number): number[] {
  for (let total = percents.length; total < PERCENT_TOTAL; total++) {
    const parts = shareParts(percents, total);
    if (!parts || shiftOf(parts) > MAX_PARTS_SHIFT) continue;
    const divisor = parts.reduce(greatestDivisor);
    return parts.map((value) => value / divisor);
  }
  const divisor = percents.reduce(greatestDivisor);
  return percents.map((percent) => percent / divisor);
}
