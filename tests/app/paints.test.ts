// Developed by Interactive 63 (https://interactive63.com)
//
// Tests that swatches come out as sensible colours, that the basic set matches the paint data, and the rules behind
// the setup list's filter and tick-all button.
import { describe, expect, it } from 'vitest';
import { hexToRgb } from '../../src/app/format';
import { BASIC_SET, loadSwatches, paintShown, setShownPaints } from '../../src/app/paints';

const swatches = loadSwatches();
const byId = new Map(swatches.map((swatch) => [swatch.paint.id, swatch]));

describe('loadSwatches', () => {
  it('gives every paint a swatch', () => {
    expect(swatches.length).toBeGreaterThan(0);
    for (const { hex } of swatches) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('shows white paint light and black paint dark', () => {
    const white = hexToRgb(byId.get('titanium-white')?.hex ?? '#000000');
    const black = hexToRgb(byId.get('carbon-black')?.hex ?? '#ffffff');
    expect(Math.min(white.r, white.g, white.b)).toBeGreaterThan(200);
    expect(Math.max(black.r, black.g, black.b)).toBeLessThan(70);
  });
});

describe('BASIC_SET', () => {
  it('names six paints that exist', () => {
    expect(BASIC_SET).toHaveLength(6);
    for (const id of BASIC_SET) expect(byId.has(id)).toBe(true);
  });
});

describe('paintShown', () => {
  it('applies the tick filter', () => {
    expect(paintShown('Titanium White', true, '', 'ticked')).toBe(true);
    expect(paintShown('Titanium White', false, '', 'ticked')).toBe(false);
    expect(paintShown('Titanium White', true, '', 'unticked')).toBe(false);
    expect(paintShown('Titanium White', false, '', 'unticked')).toBe(true);
    expect(paintShown('Titanium White', false, '', 'all')).toBe(true);
  });

  it('needs the search text to match as well, ignoring case', () => {
    expect(paintShown('Titanium White', true, 'white', 'ticked')).toBe(true);
    expect(paintShown('Titanium White', true, 'blue', 'ticked')).toBe(false);
  });
});

describe('setShownPaints', () => {
  it('adds only paints not already ticked, keeping their order', () => {
    expect(setShownPaints(['b'], ['a', 'b', 'c'], true)).toEqual(['b', 'a', 'c']);
  });

  it('removes only the paints on show', () => {
    expect(setShownPaints(['a', 'b', 'c'], ['a', 'c'], false)).toEqual(['b']);
  });
});
