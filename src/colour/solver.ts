// Developed by Interactive 63 (https://interactive63.com)
//
// The solver: given a target colour and a palette, finds the paint percentages whose mix comes closest.
// Trying every combination of a whole palette is impossible, so the search works up one recipe size at a time.
// Sizes up to EXHAUSTIVE_PAINTS are searched outright, and at every size the best smaller recipes are also grown by
// one paint from the whole palette. Recipes are ranked by distance plus SIMPLER_RECIPE_MARGIN per paint, so an
// extra paint has to improve the match by at least that margin to be kept. A run with a higher limit repeats a
// lower limit's work and adds to it, so raising the limit can never give a worse recipe.
//
// Usage: unmix({ r: 155, g: 14, b: 0 }, loadPaints()) returns recipes, best first.
import { ciede2000, cie76 } from './ciede2000';
import { labToRgb, rgbToLab, type Lab, type Rgb } from './convert';
import { HEAVY_BODY_SURFACE, type Paint } from './dataset';
import { createMixer, type MixToLab, type SurfaceTerms } from './kubelka-munk';

/** Options for unmix. */
export interface UnmixOptions {
  /** The most paints a recipe may use. Leave unset to make the whole palette available. */
  maxPaints?: number;
  /** How many recipes to return at most. */
  recipes?: number;
  /** Surface terms of the paint set. */
  surface?: SurfaceTerms;
}

/** One paint in a recipe. */
export interface RecipePart {
  paint: Paint;
  /** Share of the mix by volume, as a whole percentage. */
  percent: number;
}

/** A mix and how close it comes to the target. */
export interface Recipe {
  /** The paints used, largest share first. Percentages sum to 100. */
  parts: RecipePart[];
  /** The predicted colour, clamped into sRGB if needed. */
  rgb: Rgb;
  lab: Lab;
  /** Whether the predicted colour fits inside sRGB, so whether the swatch shows it faithfully. */
  inGamut: boolean;
  /** CIEDE2000 from the target, which is the score the solver minimises. */
  deltaE2000: number;
  /** CIE76 from the target. */
  deltaE76: number;
}

// Largest combination tried outright. Above this the search grows recipes instead.
const EXHAUSTIVE_PAINTS = 3;
// Largest palette the three-paint search takes whole. Bigger palettes are narrowed for that search only.
const MAX_SEARCH_PAINTS = 40;
// Paints kept for the three-paint search when a palette is narrowed.
const PRESELECT_COUNT = 40;
// Best pairs read when shortlisting paints for a narrowed palette.
const PAIR_SCOUTS = 200;
// Best candidates carried from the coarse grid to refinement, per recipe size.
const REFINE_PER_SIZE = 6;
// Distance an extra paint must save to be kept. Below this painters would not see the gain.
export const SIMPLER_RECIPE_MARGIN = 0.5;
// Recipes returned when the caller does not ask for a number.
const DEFAULT_RECIPES = 3;

// Pair fractions for the coarse grid. Spaced by ratio, since a strong paint matters at very low shares.
const PAIR_FRACTIONS = [0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.95, 0.98];
// Relative amounts combined into the coarse grid for three paints, spaced by ratio for the same reason.
const TRIPLE_LEVELS = [1, 3, 9, 27];

// Refinement moves paint between parts in steps from the first of these down to the last.
const REFINE_START_STEP = 0.04;
const REFINE_END_STEP = 0.0025;
// A move must beat the current score by this much, which stops refinement circling on rounding noise.
const MIN_IMPROVEMENT = 1e-6;

// Shares a new paint is tried at when growing a recipe.
const GROW_FRACTIONS = [0.02, 0.1, 0.3];
// Most promising new paints refined fully at each growing step.
const GROW_CANDIDATES = 3;
// Recipes of each size that are grown into the next size, as the best recipe is not always the best starting point.
const GROW_BEAM = 12;

const PERCENT = 100;
// Smallest share a paint can have in a finished recipe.
const MIN_PERCENT = 1;

/** A working recipe: indices into the palette with their fractions, and the score. */
interface Candidate {
  indices: number[];
  fractions: number[];
  score: number;
}

// Stands in for the best recipe before any exists.
const WORST_CANDIDATE: Candidate = { indices: [], fractions: [], score: Infinity };

/** Everything the search stages share for one target. */
interface Search {
  mix: MixToLab;
  target: Lab;
  scratch: Lab;
}

/** Scores a mix against the target. */
function scoreMix(search: Search, indices: readonly number[], fractions: readonly number[]): number {
  search.mix(indices, fractions, search.scratch);
  return ciede2000(search.target, search.scratch);
}

/** Lists the three-paint coarse grid once, removing compositions that differ only by scale. */
function buildTripleGrid(): number[][] {
  const seen = new Map<string, number[]>();
  for (const a of TRIPLE_LEVELS) {
    for (const b of TRIPLE_LEVELS) {
      for (const c of TRIPLE_LEVELS) {
        const total = a + b + c;
        const point = [a / total, b / total, c / total];
        seen.set(point.map((value) => value.toFixed(4)).join(), point);
      }
    }
  }
  return [...seen.values()];
}

const PAIR_GRID = PAIR_FRACTIONS.map((fraction) => [fraction, 1 - fraction]);
const TRIPLE_GRID = buildTripleGrid();

/** Keeps the lowest-scoring candidates, in score order. */
class BestList {
  readonly items: Candidate[] = [];

  constructor(private readonly size: number) {}

  /** Offers a candidate. The indices and fractions are copied only if it is kept. */
  offer(score: number, indices: readonly number[], fractions: readonly number[]): void {
    if (this.items.length === this.size && score >= (this.items.at(-1) as Candidate).score) return;
    const position = this.items.findIndex((item) => item.score > score);
    const entry = { score, indices: [...indices], fractions: [...fractions] };
    if (position === -1) this.items.push(entry);
    else this.items.splice(position, 0, entry);
    if (this.items.length > this.size) this.items.pop();
  }
}

/**
 * Narrows a large palette for the three-paint search. Scoring every pair is cheap, and the paints in the best pairs
 * are the ones that combine towards the target, which a paint's own colour does not show. White and the darkest paint
 * always stay, as they adjust lightness for almost any mix.
 */
function preselect(palette: readonly Paint[], search: Search): number[] {
  const pairs = new BestList(PAIR_SCOUTS);
  for (let a = 0; a < palette.length; a++) {
    for (let b = a + 1; b < palette.length; b++) {
      let nearest = Infinity;
      for (const fractions of PAIR_GRID) nearest = Math.min(nearest, scoreMix(search, [a, b], fractions));
      pairs.offer(nearest, [a, b], []);
    }
  }
  const chosen = new Set([lightestIndex(palette, search), darkestIndex(palette, search)]);
  for (const pair of pairs.items) {
    if (chosen.size >= PRESELECT_COUNT) break;
    for (const index of pair.indices) chosen.add(index);
  }
  return [...chosen];
}

/** Finds the palette's paint with the highest or lowest lightness, by sign. */
function extremeIndex(palette: readonly Paint[], search: Search, sign: number): number {
  let best = 0;
  let bestLightness = -Infinity;
  palette.forEach((_, index) => {
    search.mix([index], [1], search.scratch);
    const lightness = sign * search.scratch.l;
    if (lightness > bestLightness) {
      best = index;
      bestLightness = lightness;
    }
  });
  return best;
}

/** Finds the lightest paint, which stands in for white. */
function lightestIndex(palette: readonly Paint[], search: Search): number {
  return extremeIndex(palette, search, 1);
}

/** Finds the darkest paint. */
function darkestIndex(palette: readonly Paint[], search: Search): number {
  return extremeIndex(palette, search, -1);
}

/** Scores every grid point of one paint combination. */
function tryGrid(search: Search, indices: readonly number[], grid: readonly number[][], best: BestList): void {
  for (const fractions of grid) best.offer(scoreMix(search, indices, fractions), indices, fractions);
}

/** Runs the outright search for one recipe size over the given paints. */
function searchSize(search: Search, pool: readonly number[], size: number): Candidate[] {
  const best = new BestList(REFINE_PER_SIZE);
  const count = pool.length;
  for (let a = 0; a < count; a++) {
    const first = pool[a] as number;
    if (size === 1) {
      best.offer(scoreMix(search, [first], [1]), [first], [1]);
      continue;
    }
    for (let b = a + 1; b < count; b++) {
      const second = pool[b] as number;
      if (size === 2) {
        tryGrid(search, [first, second], PAIR_GRID, best);
        continue;
      }
      for (let c = b + 1; c < count; c++) {
        tryGrid(search, [first, second, pool[c] as number], TRIPLE_GRID, best);
      }
    }
  }
  return best.items;
}

/** Improves fractions by moving paint between parts, shrinking the move until it stops helping. */
function refine(search: Search, start: Candidate): Candidate {
  const { indices } = start;
  const fractions = [...start.fractions];
  let score = start.score;
  for (let step = REFINE_START_STEP; step >= REFINE_END_STEP; step /= 2) {
    let improved = true;
    while (improved) {
      improved = false;
      for (let from = 0; from < indices.length; from++) {
        for (let to = 0; to < indices.length; to++) {
          if (from === to) continue;
          const moved = Math.min(step, fractions[from] as number);
          if (moved <= 0) continue;
          fractions[from] = (fractions[from] as number) - moved;
          fractions[to] = (fractions[to] as number) + moved;
          const next = scoreMix(search, indices, fractions);
          if (next < score - MIN_IMPROVEMENT) {
            score = next;
            improved = true;
          } else {
            fractions[from] = (fractions[from] as number) + moved;
            fractions[to] = (fractions[to] as number) - moved;
          }
        }
      }
    }
  }
  return { indices: [...indices], fractions, score };
}

/** Rounds fractions to whole percentages summing to 100, giving leftovers to the largest remainders. */
function toPercents(fractions: readonly number[]): number[] {
  const exact = fractions.map((fraction) => fraction * PERCENT);
  const percents = exact.map(Math.floor);
  let spare = PERCENT - percents.reduce((total, value) => total + value, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((first, second) => second.remainder - first.remainder);
  for (const { index } of byRemainder) {
    if (spare <= 0) break;
    percents[index] = (percents[index] as number) + 1;
    spare--;
  }
  return percents;
}

/**
 * Rounds a candidate to whole percentages, then adjusts one percent at a time, as rounding can move a mix that
 * depends on a strong paint a long way. Every part keeps at least 1%, so a recipe's size never changes here.
 */
function roundCandidate(search: Search, candidate: Candidate): Candidate {
  const percents = toPercents(candidate.fractions);
  percents.forEach((value, part) => {
    if (value > 0) return;
    percents[part] = MIN_PERCENT;
    const largest = percents.indexOf(Math.max(...percents));
    percents[largest] = (percents[largest] as number) - MIN_PERCENT;
  });
  const score = (): number => scoreMix(search, candidate.indices, percents.map((value) => value / PERCENT));
  let best = score();
  let improved = true;
  while (improved) {
    improved = false;
    for (let from = 0; from < percents.length; from++) {
      for (let to = 0; to < percents.length; to++) {
        if (from === to || (percents[from] as number) <= MIN_PERCENT) continue;
        percents[from] = (percents[from] as number) - 1;
        percents[to] = (percents[to] as number) + 1;
        const next = score();
        if (next < best - MIN_IMPROVEMENT) {
          best = next;
          improved = true;
        } else {
          percents[from] = (percents[from] as number) + 1;
          percents[to] = (percents[to] as number) - 1;
        }
      }
    }
  }
  return { indices: candidate.indices, fractions: percents.map((value) => value / PERCENT), score: best };
}

/** Ranks a recipe by its distance plus the cost of each paint it uses. */
function ranking(candidate: Candidate): number {
  return candidate.score + SIMPLER_RECIPE_MARGIN * candidate.indices.length;
}

/** Tries adding each unused paint to a recipe and returns the best larger recipe. */
function grow(search: Search, base: Candidate, paletteSize: number): Candidate | undefined {
  const trials = new BestList(GROW_CANDIDATES * GROW_FRACTIONS.length);
  for (let index = 0; index < paletteSize; index++) {
    if (base.indices.includes(index)) continue;
    const indices = [...base.indices, index];
    for (const share of GROW_FRACTIONS) {
      const fractions = [...base.fractions.map((fraction) => fraction * (1 - share)), share];
      trials.offer(scoreMix(search, indices, fractions), indices, fractions);
    }
  }
  const tried = new Set<number>();
  let best: Candidate | undefined;
  for (const trial of trials.items) {
    const added = trial.indices.at(-1) as number;
    if (tried.has(added) || tried.size === GROW_CANDIDATES) continue;
    tried.add(added);
    const rounded = roundCandidate(search, refine(search, trial));
    if (!best || rounded.score < best.score) best = rounded;
  }
  return best;
}

/** Turns a finished candidate into the recipe callers receive. */
function toRecipe(palette: readonly Paint[], search: Search, candidate: Candidate): Recipe {
  const lab: Lab = { l: 0, a: 0, b: 0 };
  search.mix(candidate.indices, candidate.fractions, lab);
  const { rgb, inGamut } = labToRgb(lab);
  const parts = candidate.indices
    .map((index, part) => ({
      paint: palette[index] as Paint,
      percent: Math.round((candidate.fractions[part] as number) * PERCENT),
    }))
    .sort((first, second) => second.percent - first.percent);
  return {
    parts,
    rgb,
    lab,
    inGamut,
    deltaE2000: candidate.score,
    deltaE76: cie76(search.target, lab),
  };
}

/** Identifies a recipe by its paints and percentages, so duplicates can be removed. */
function recipeKey(candidate: Candidate): string {
  return candidate.indices
    .map((index, part) => `${index}:${Math.round((candidate.fractions[part] as number) * PERCENT)}`)
    .sort()
    .join();
}

/**
 * Finds the recipes that best recreate a target colour from a palette, best first.
 * An empty palette returns no recipes. Targets out of the palette's reach return the closest it can get.
 */
export function unmix(target: Rgb, palette: readonly Paint[], options: UnmixOptions = {}): Recipe[] {
  if (palette.length === 0) return [];
  const limit = Math.max(1, Math.min(options.maxPaints ?? palette.length, palette.length));
  const search: Search = {
    mix: createMixer(palette, options.surface ?? HEAVY_BODY_SURFACE),
    target: rgbToLab(target),
    scratch: { l: 0, a: 0, b: 0 },
  };
  const everyPaint = palette.map((_, index) => index);
  const pool = palette.length > MAX_SEARCH_PAINTS ? preselect(palette, search) : everyPaint;

  const finished = new Map<string, Candidate>();
  const keep = (candidate: Candidate): void => {
    finished.set(recipeKey(candidate), candidate);
  };
  const ranked = (): Candidate[] => [...finished.values()].sort((first, second) => ranking(first) - ranking(second));
  const ofSize = (size: number): Candidate[] =>
    [...finished.values()]
      .filter((candidate) => candidate.indices.length === size)
      .sort((first, second) => first.score - second.score);

  for (let size = 1; size <= limit; size++) {
    const before = ranking(ranked()[0] ?? WORST_CANDIDATE);
    if (size <= EXHAUSTIVE_PAINTS) {
      const paints = size === EXHAUSTIVE_PAINTS ? pool : everyPaint;
      for (const coarse of searchSize(search, paints, size)) keep(roundCandidate(search, refine(search, coarse)));
    }
    for (const seed of ofSize(size - 1).slice(0, GROW_BEAM)) {
      const larger = grow(search, seed, palette.length);
      if (larger) keep(larger);
    }
    const after = ranking(ranked()[0] ?? WORST_CANDIDATE);
    if (size > EXHAUSTIVE_PAINTS && after >= before) break;
  }

  return ranked()
    .slice(0, options.recipes ?? DEFAULT_RECIPES)
    .map((candidate) => toRecipe(palette, search, candidate));
}
