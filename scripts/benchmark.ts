// Developed by Interactive 63 (https://interactive63.com)
//
// Checks the TypeScript model against a private set of held-back mixes, then times the solver.
// The held-back file is not in the repo, so that part is skipped cleanly on a fresh clone.
// Usage: npx tsx scripts/benchmark.ts
import { existsSync, readFileSync } from 'node:fs';

import { cie76 } from '../src/colour/ciede2000';
import type { Lab, Rgb } from '../src/colour/convert';
import { HEAVY_BODY_SURFACE, loadPaints } from '../src/colour/dataset';
import { createMixer } from '../src/colour/kubelka-munk';
import { unmix } from '../src/colour/solver';

const HELD_BACK_PATH = '.claude/docs/reference/engine-pilot/heldout.json';
const PALETTE_SIZES = [12, 24, 112];
const TARGETS: Rgb[] = [
  { r: 155, g: 14, b: 0 },
  { r: 96, g: 120, b: 80 },
  { r: 0, g: 196, b: 106 },
  { r: 210, g: 190, b: 160 },
  { r: 36, g: 80, b: 160 },
];

/** One held-back colour: the amounts mixed and the L*a*b* it should give. */
interface HeldBack {
  parts: [string, number][];
  lab: [number, number, number];
}

/** Returns a percentile of sorted values. */
function percentile(sorted: readonly number[], share: number): number {
  const position = (sorted.length - 1) * share;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const first = sorted[low] as number;
  return first + ((sorted[high] as number) - first) * (position - low);
}

/** Scores the model on the held-back colours. */
function checkHeldBack(): void {
  if (!existsSync(HELD_BACK_PATH)) {
    console.log('Held-back mixes not found, so that check was skipped.');
    return;
  }
  const paints = loadPaints();
  const positions = new Map(paints.map((paint, index) => [paint.id, index]));
  const mix = createMixer(paints, HEAVY_BODY_SURFACE);
  const heldBack = JSON.parse(readFileSync(HELD_BACK_PATH, 'utf8')) as HeldBack[];
  const predicted: Lab = { l: 0, a: 0, b: 0 };
  const errors = heldBack
    .map(({ parts, lab }) => {
      mix(
        parts.map(([id]) => positions.get(id) as number),
        parts.map(([, amount]) => amount),
        predicted,
      );
      return cie76(predicted, { l: lab[0], a: lab[1], b: lab[2] });
    })
    .sort((first, second) => first - second);
  console.log(
    `Held-back colours: ${errors.length}, median ${percentile(errors, 0.5).toFixed(3)}, ` +
      `p95 ${percentile(errors, 0.95).toFixed(3)}, worst ${(errors.at(-1) as number).toFixed(3)}`,
  );
}

/** Spreads a palette of the given size evenly through the paint list, so it holds a range of colours. */
function samplePalette(size: number) {
  const paints = loadPaints();
  return Array.from({ length: size }, (_, index) => paints[Math.floor((index * paints.length) / size)]!);
}

/** Times the solver with no paint limit, and reports how close and how large its recipes are. */
function timeSolver(): void {
  for (const size of PALETTE_SIZES) {
    const palette = samplePalette(size);
    let slowest = 0;
    let total = 0;
    const results: string[] = [];
    for (const target of TARGETS) {
      const started = performance.now();
      const [best] = unmix(target, palette);
      const elapsed = performance.now() - started;
      slowest = Math.max(slowest, elapsed);
      total += elapsed;
      results.push(`${best!.deltaE2000.toFixed(2)} (${best!.parts.length})`);
    }
    console.log(
      `${size} paints: mean ${(total / TARGETS.length).toFixed(0)} ms, slowest ${slowest.toFixed(0)} ms, ` +
        `distance (paints): ${results.join(', ')}`,
    );
  }
}

checkHeldBack();
timeSolver();
