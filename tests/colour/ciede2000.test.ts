// Developed by Interactive 63 (https://interactive63.com)
//
// Tests the colour difference measures. The fixture holds the 34 pairs published by Sharma, Wu and Dalal (2005) and
// the 10 worked examples from RIT's CIEDE2000 workbook.
import { describe, expect, it } from 'vitest';

import { cie76, ciede2000 } from '../../src/colour/ciede2000';
import type { Lab } from '../../src/colour/convert';
import pairs from '../fixtures/ciede2000-pairs.json';

/** Reads a fixture colour. */
function lab(values: number[]): Lab {
  return { l: values[0] as number, a: values[1] as number, b: values[2] as number };
}

describe('ciede2000', () => {
  it('holds both published sets', () => {
    expect(pairs.filter((pair) => pair.source === 'Sharma')).toHaveLength(34);
    expect(pairs.filter((pair) => pair.source === 'RIT')).toHaveLength(10);
  });

  it.each(pairs)('matches the published value of $deltaE', ({ a, b, deltaE }) => {
    expect(ciede2000(lab(a), lab(b))).toBeCloseTo(deltaE, 3);
  });

  it('is symmetric', () => {
    const first = { l: 50, a: 2.5, b: 0 };
    const second = { l: 73, a: 25, b: -18 };
    expect(ciede2000(first, second)).toBeCloseTo(ciede2000(second, first), 10);
  });

  it('is zero for identical colours, including black', () => {
    expect(ciede2000({ l: 0, a: 0, b: 0 }, { l: 0, a: 0, b: 0 })).toBe(0);
    expect(ciede2000({ l: 40, a: 12, b: -30 }, { l: 40, a: 12, b: -30 })).toBe(0);
  });
});

describe('cie76', () => {
  it('is the straight-line distance in CIELAB', () => {
    expect(cie76({ l: 50, a: 0, b: 0 }, { l: 53, a: 4, b: 0 })).toBeCloseTo(5, 10);
  });
});
