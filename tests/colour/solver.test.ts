// Developed by Interactive 63 (https://interactive63.com)
//
// Tests the solver's guarantees: valid percentages, the paint limit, the cost of an extra paint and its edge cases.
import { describe, expect, it } from 'vitest';

import { labToRgb, reflectanceToXyz, xyzToLab, type Rgb } from '../../src/colour/convert';
import { HEAVY_BODY_SURFACE, loadPaints, type Paint } from '../../src/colour/dataset';
import { mixReflectance } from '../../src/colour/kubelka-munk';
import { SIMPLER_RECIPE_MARGIN, unmix, type Recipe } from '../../src/colour/solver';

const paints = loadPaints();
const TARGETS: Rgb[] = [
  { r: 155, g: 14, b: 0 },
  { r: 96, g: 120, b: 80 },
  { r: 0, g: 196, b: 106 },
  { r: 210, g: 190, b: 160 },
  { r: 36, g: 80, b: 160 },
];
const SMALL_PALETTE = [0, 7, 15, 31, 47, 63, 79, 95, 111].map((index) => paints[index] as Paint);
// Recovering a known mix should land well inside what a painter could see.
const RECOVERY_LIMIT = 1;
// Allowance for tests that run the solver on the whole palette many times.
const SLOW_TEST_MS = 60_000;
// A target whose best three-paint recipe is easy to miss when a large palette is narrowed too soon.
const HARD_TARGET: Rgb = { r: 72, g: 55, b: 182 };
const HARD_TARGET_LIMIT = 3.5;

/** Finds a paint by id. */
function paint(id: string): Paint {
  const found = paints.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`No paint ${id}`);
  return found;
}

/** Returns the best recipe for a target. */
function best(target: Rgb, palette: readonly Paint[], maxPaints?: number): Recipe {
  const [recipe] = unmix(target, palette, maxPaints === undefined ? {} : { maxPaints });
  if (!recipe) throw new Error('No recipe returned');
  return recipe;
}

/** Checks the promises every recipe makes. */
function expectValid(recipe: Recipe): void {
  expect(recipe.parts.reduce((total, part) => total + part.percent, 0)).toBe(100);
  for (const part of recipe.parts) {
    expect(Number.isInteger(part.percent)).toBe(true);
    expect(part.percent).toBeGreaterThanOrEqual(1);
  }
  expect(new Set(recipe.parts.map((part) => part.paint.id)).size).toBe(recipe.parts.length);
  expect(Number.isFinite(recipe.deltaE2000)).toBe(true);
  expect(Number.isFinite(recipe.deltaE76)).toBe(true);
}

describe('unmix', () => {
  it.each(TARGETS)('gives valid recipes for %o', (target) => {
    const recipes = unmix(target, paints);
    expect(recipes.length).toBeGreaterThan(0);
    recipes.forEach(expectValid);
  });

  it('scores the rounded recipe as reported', () => {
    const recipe = best(TARGETS[0] as Rgb, SMALL_PALETTE);
    const lab = xyzToLab(
      reflectanceToXyz(
        mixReflectance(
          recipe.parts.map((part) => part.paint),
          recipe.parts.map((part) => part.percent / 100),
          HEAVY_BODY_SURFACE,
        ),
      ),
    );
    expect(lab.l).toBeCloseTo(recipe.lab.l, 8);
    expect(lab.a).toBeCloseTo(recipe.lab.a, 8);
    expect(lab.b).toBeCloseTo(recipe.lab.b, 8);
  });

  it.each([1, 2, 3, 4, 5])(
    'honours a limit of %d paints',
    (maxPaints) => {
      for (const target of TARGETS) {
        for (const recipe of unmix(target, paints, { maxPaints })) {
          expectValid(recipe);
          expect(recipe.parts.length).toBeLessThanOrEqual(maxPaints);
        }
      }
    },
    SLOW_TEST_MS,
  );

  it('treats a limit above the palette size as no limit', () => {
    const target = TARGETS[1] as Rgb;
    expect(best(target, SMALL_PALETTE, 500).parts).toEqual(best(target, SMALL_PALETTE).parts);
  });

  it(
    'never gives a worse recipe when the limit rises',
    () => {
      for (const target of TARGETS) {
        let previous = Infinity;
        for (const maxPaints of [1, 2, 3, 4, 5, undefined]) {
          const { deltaE2000 } = best(target, paints, maxPaints);
          expect(deltaE2000).toBeLessThanOrEqual(previous + 1e-9);
          previous = deltaE2000;
        }
      }
    },
    SLOW_TEST_MS,
  );

  it('finds a three-paint recipe that narrowing could miss', () => {
    expect(best(HARD_TARGET, paints, 3).deltaE2000).toBeLessThan(HARD_TARGET_LIMIT);
  });

  it(
    'keeps an extra paint only when it saves the margin',
    () => {
      for (const target of TARGETS) {
        const free = best(target, paints);
        if (free.parts.length < 2) continue;
        const smaller = best(target, paints, free.parts.length - 1);
        expect(smaller.deltaE2000 - free.deltaE2000).toBeGreaterThanOrEqual(SIMPLER_RECIPE_MARGIN - 1e-9);
      }
    },
    SLOW_TEST_MS,
  );

  it('recovers a target made from known paints in a known ratio', () => {
    const mixes: [string[], number[]][] = [
      [['titanium-white', 'yellow-oxide', 'ultramarine-blue'], [0.6, 0.3, 0.1]],
      [['pyrrole-orange', 'burnt-sienna'], [0.75, 0.25]],
      [['quin-magenta', 'titanium-white', 'cobalt-blue'], [0.2, 0.5, 0.3]],
    ];
    for (const [ids, fractions] of mixes) {
      const lab = xyzToLab(reflectanceToXyz(mixReflectance(ids.map(paint), fractions, HEAVY_BODY_SURFACE)));
      const { rgb, inGamut } = labToRgb(lab);
      expect(inGamut).toBe(true);
      expect(best(rgb, paints).deltaE2000).toBeLessThan(RECOVERY_LIMIT);
    }
  });
});

describe('unmix edge cases', () => {
  it('returns no recipes for an empty palette', () => {
    expect(unmix({ r: 10, g: 20, b: 30 }, [])).toEqual([]);
  });

  it('returns the paint for a one-paint palette', () => {
    const recipes = unmix({ r: 200, g: 40, b: 40 }, [paint('phthalo-blue-gs')]);
    expect(recipes).toHaveLength(1);
    expect(recipes[0]?.parts).toEqual([{ paint: paint('phthalo-blue-gs'), percent: 100 }]);
  });

  it.each([
    ['black', { r: 0, g: 0, b: 0 }],
    ['white', { r: 255, g: 255, b: 255 }],
    ['a green no paint reaches', { r: 0, g: 255, b: 0 }],
    ['a blue no paint reaches', { r: 0, g: 0, b: 255 }],
  ])('returns the closest reach for %s', (_, target) => {
    expectValid(best(target, paints));
    expectValid(best(target, SMALL_PALETTE));
  });

  it('treats a limit of zero as one paint', () => {
    expect(best(TARGETS[0] as Rgb, SMALL_PALETTE, 0).parts).toHaveLength(1);
  });
});
