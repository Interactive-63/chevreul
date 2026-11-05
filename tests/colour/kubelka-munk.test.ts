// Developed by Interactive 63 (https://interactive63.com)
//
// Tests paint mixing. The fixture holds colours computed by the reference model the curves were fitted with, so these
// tests fail if the stored data or the TypeScript drifts from it.
import { describe, expect, it } from 'vitest';

import { reflectanceToXyz, xyzToLab, type Lab } from '../../src/colour/convert';
import { HEAVY_BODY_SURFACE, loadPaints, type Paint } from '../../src/colour/dataset';
import {
  applySurface,
  createMixer,
  ksToReflectance,
  mixReflectance,
  reflectanceToKs,
} from '../../src/colour/kubelka-munk';
import reference from '../fixtures/heavy-body-reference.json';

// The stored curves are rounded, so agreement is expected to this many L*a*b* units.
const REFERENCE_TOLERANCE = 0.01;

/** Finds a paint by id. */
function paint(id: string): Paint {
  const found = loadPaints().find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No paint ${id}`);
  return found;
}

/** Runs the full model on paints and fractions. */
function labOf(paints: readonly Paint[], fractions: readonly number[]): Lab {
  return xyzToLab(reflectanceToXyz(mixReflectance(paints, fractions, HEAVY_BODY_SURFACE)));
}

describe('ksToReflectance', () => {
  it.each([1e-9, 1e-4, 0.5, 1, 40, 1e4, 1e8])('round trips a K/S of %d', (ks) => {
    expect(reflectanceToKs(ksToReflectance(ks)) / ks).toBeCloseTo(1, 6);
  });

  it('gives full reflectance with no absorption', () => {
    expect(ksToReflectance(0)).toBe(1);
  });
});

describe('applySurface', () => {
  it('leaves reflectance alone with no surface terms', () => {
    expect(applySurface(0.4, { k1: 0, k2: 0 })).toBeCloseTo(0.4, 12);
  });

  it('leaves a black paint with only its surface reflection', () => {
    expect(applySurface(0, HEAVY_BODY_SURFACE)).toBeCloseTo(HEAVY_BODY_SURFACE.k1, 12);
  });
});

describe('mixing', () => {
  const orange = paint('pyrrole-orange');
  const white = paint('titanium-white');
  const blue = paint('phthalo-blue-gs');

  it('returns the paint when mixed with itself', () => {
    const alone = labOf([orange], [1]);
    const doubled = labOf([orange, orange], [0.3, 0.7]);
    expect(doubled.l).toBeCloseTo(alone.l, 10);
    expect(doubled.a).toBeCloseTo(alone.a, 10);
    expect(doubled.b).toBeCloseTo(alone.b, 10);
  });

  it('does not depend on part order', () => {
    const forward = labOf([orange, white, blue], [0.5, 0.3, 0.2]);
    const backward = labOf([blue, white, orange], [0.2, 0.3, 0.5]);
    expect(forward.a).toBeCloseTo(backward.a, 10);
    expect(forward.b).toBeCloseTo(backward.b, 10);
  });

  it('gives the same result from the fast mixer', () => {
    const paints = [orange, white, blue];
    const fractions = [0.25, 0.6, 0.15];
    const expected = labOf(paints, fractions);
    const fast: Lab = { l: 0, a: 0, b: 0 };
    createMixer(paints, HEAVY_BODY_SURFACE)([0, 1, 2], fractions, fast);
    expect(fast.l).toBeCloseTo(expected.l, 10);
    expect(fast.a).toBeCloseTo(expected.a, 10);
    expect(fast.b).toBeCloseTo(expected.b, 10);
  });

  it.each(reference)('matches the reference model for $parts', ({ parts, lab }) => {
    const predicted = labOf(
      parts.map(([id]) => paint(id as string)),
      parts.map(([, amount]) => amount as number),
    );
    expect(Math.abs(predicted.l - (lab[0] as number))).toBeLessThan(REFERENCE_TOLERANCE);
    expect(Math.abs(predicted.a - (lab[1] as number))).toBeLessThan(REFERENCE_TOLERANCE);
    expect(Math.abs(predicted.b - (lab[2] as number))).toBeLessThan(REFERENCE_TOLERANCE);
  });
});
