// Developed by Interactive 63 (https://interactive63.com)
//
// Tests the search for simple whole parts: sharing out, the colour limit, and that real recipes stay within it.
import { describe, expect, it } from 'vitest';
import { loadPaints } from '../../src/colour/dataset';
import { MAX_PARTS_SHIFT, shareParts, simplestParts } from '../../src/colour/parts';
import { unmix } from '../../src/colour/solver';

const PERCENT_TOTAL = 100;
// A test colour measure: the largest change in any paint's share, scaled so one point counts as one unit of shift.
function shareShift(percents: readonly number[]): (parts: readonly number[]) => number {
  return (parts) => {
    const total = parts.reduce((sum, value) => sum + value, 0);
    return Math.max(...parts.map((value, index) => Math.abs((value / total) * PERCENT_TOTAL - (percents[index] as number))));
  };
}

describe('shareParts', () => {
  it('shares a total in proportion and uses all of it', () => {
    expect(shareParts([50, 30, 20], 10)).toEqual([5, 3, 2]);
    expect(shareParts([86, 7, 7], 14)).toEqual([12, 1, 1]);
  });

  it('gives every paint at least one part', () => {
    expect(shareParts([98, 1, 1], 10)).toEqual([8, 1, 1]);
  });

  it('refuses a total that cannot give every paint a part', () => {
    expect(shareParts([40, 30, 30], 2)).toBeNull();
  });
});

describe('simplestParts', () => {
  it('takes an exact reduction when one exists', () => {
    const percents = [50, 30, 20];
    expect(simplestParts(percents, shareShift(percents))).toEqual([5, 3, 2]);
  });

  it('finds near ratios that have no common factor', () => {
    const percents = [86, 7, 7];
    expect(simplestParts(percents, shareShift(percents))).toEqual([12, 1, 1]);
  });

  it('keeps the exact recipe when nothing simpler stays within the limit', () => {
    const percents = [61, 23, 16];
    expect(simplestParts(percents, () => MAX_PARTS_SHIFT + 1)).toEqual(percents);
  });

  it('always returns parts in lowest terms', () => {
    const percents = [50, 25, 25];
    expect(simplestParts(percents, () => 0)).toEqual([1, 1, 1]);
    expect(simplestParts([60, 40], (parts) => (parts[0] === 3 ? 0 : MAX_PARTS_SHIFT + 1))).toEqual([3, 2]);
  });

  it('handles a single paint', () => {
    expect(simplestParts([100], () => 0)).toEqual([1]);
  });
});

describe('recipe parts', () => {
  it('match each paint in a solved recipe and stay in lowest terms', () => {
    const [recipe] = unmix({ r: 155, g: 14, b: 0 }, loadPaints().slice(0, 8));
    expect(recipe?.simple.parts).toHaveLength(recipe?.parts.length ?? 0);
    for (const value of recipe?.simple.parts ?? []) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
    }
    // The limit is on the shift from the exact mix, so the miss can only grow by about that much.
    expect(recipe?.simple.deltaE2000).toBeLessThan((recipe?.deltaE2000 ?? 0) + MAX_PARTS_SHIFT * 2);
  });
});
