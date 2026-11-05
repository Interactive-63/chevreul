// Developed by Interactive 63 (https://interactive63.com)
//
// Tests colour conversions, which everything else in the engine rests on.
import { describe, expect, it } from 'vitest';

import { labToRgb, reflectanceToXyz, rgbToLab, TABLE_WHITE, xyzToLab } from '../../src/colour/convert';
import { WAVELENGTHS, WEIGHT_Y } from '../../src/data/cie-tables';

// Spacing between samples of the sRGB cube when checking round trips.
const CUBE_STEP = 17;

describe('CIE tables', () => {
  it('normalise a perfect reflector to Y = 1', () => {
    expect(WEIGHT_Y.reduce((total, value) => total + value, 0)).toBeCloseTo(1, 10);
  });

  it('give a white close to the standard D65 white', () => {
    expect(TABLE_WHITE.x).toBeCloseTo(0.9504, 2);
    expect(TABLE_WHITE.z).toBeCloseTo(1.0888, 2);
  });
});

describe('xyzToLab', () => {
  it('puts a perfect reflector at L* 100, a* 0, b* 0', () => {
    const lab = xyzToLab(reflectanceToXyz(new Float64Array(WAVELENGTHS.length).fill(1)));
    expect(lab.l).toBeCloseTo(100, 8);
    expect(lab.a).toBeCloseTo(0, 8);
    expect(lab.b).toBeCloseTo(0, 8);
  });

  it('puts a perfect absorber at L* 0', () => {
    expect(xyzToLab(reflectanceToXyz(new Float64Array(WAVELENGTHS.length))).l).toBeCloseTo(0, 8);
  });
});

describe('sRGB and CIELAB', () => {
  it('maps sRGB white to the same point as a perfect reflector', () => {
    const lab = rgbToLab({ r: 255, g: 255, b: 255 });
    expect(lab.l).toBeCloseTo(100, 3);
    expect(lab.a).toBeCloseTo(0, 3);
    expect(lab.b).toBeCloseTo(0, 3);
  });

  it('returns the same 8-bit value across a sample of the cube', () => {
    for (let r = 0; r <= 255; r += CUBE_STEP) {
      for (let g = 0; g <= 255; g += CUBE_STEP) {
        for (let b = 0; b <= 255; b += CUBE_STEP) {
          const result = labToRgb(rgbToLab({ r, g, b }));
          expect(result.rgb).toEqual({ r, g, b });
          expect(result.inGamut).toBe(true);
        }
      }
    }
  });

  it('clamps and flags a colour outside sRGB', () => {
    const { rgb, inGamut } = labToRgb({ l: 60, a: -120, b: 80 });
    expect(inGamut).toBe(false);
    for (const channel of [rgb.r, rgb.g, rgb.b]) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });
});
