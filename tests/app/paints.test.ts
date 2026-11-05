// Developed by Interactive 63 (https://interactive63.com)
//
// Tests that swatches come out as sensible colours and that the basic set matches the paint data.
import { describe, expect, it } from 'vitest';
import { hexToRgb } from '../../src/app/format';
import { BASIC_SET, loadSwatches } from '../../src/app/paints';

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
