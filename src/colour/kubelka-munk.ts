// Developed by Interactive 63 (https://interactive63.com)
//
// Two-constant Kubelka-Munk paint mixing. Each paint has an absorption curve K and a scattering curve S. Mixing adds
// those curves in proportion to volume, and the opaque film's reflectance follows from their ratio. A Saunderson
// correction then accounts for light reflected at the paint's surface.
import { WEIGHT_X, WEIGHT_Y, WEIGHT_Z } from '../data/cie-tables';
import { labForward, TABLE_WHITE, type Lab } from './convert';

/** Saunderson surface terms: k1 is external reflection and k2 internal reflection. */
export interface SurfaceTerms {
  k1: number;
  k2: number;
}

/** A paint's absorption and scattering curves, sampled on WAVELENGTHS. */
export interface PaintCurves {
  k: Float64Array;
  s: Float64Array;
}

/** Writes the L*a*b* of a mix into out: indices pick paints from the mixer's list, fractions give their volumes. */
export type MixToLab = (indices: readonly number[], fractions: readonly number[], out: Lab) => void;

/**
 * Turns a K/S ratio into the reflectance of an opaque film.
 * This is the reciprocal form of 1 + ks - sqrt(ks^2 + 2ks), which loses all its digits to cancellation at high K/S.
 */
export function ksToReflectance(ks: number): number {
  return 1 / (1 + ks + Math.sqrt(ks * ks + 2 * ks));
}

/** Turns the reflectance of an opaque film back into its K/S ratio. */
export function reflectanceToKs(reflectance: number): number {
  return (1 - reflectance) ** 2 / (2 * reflectance);
}

/** Converts internal reflectance to what is seen from outside the paint film. */
export function applySurface(reflectance: number, { k1, k2 }: SurfaceTerms): number {
  return k1 + ((1 - k1) * (1 - k2) * reflectance) / (1 - k2 * reflectance);
}

/** Mixes paints by volume and returns the visible reflectance curve. Fractions need not sum to one. */
export function mixReflectance(
  paints: readonly PaintCurves[],
  fractions: readonly number[],
  surface: SurfaceTerms,
): Float64Array {
  const size = paints[0]?.k.length ?? 0;
  const curve = new Float64Array(size);
  for (let wave = 0; wave < size; wave++) {
    let absorption = 0;
    let scattering = 0;
    paints.forEach((paint, i) => {
      const fraction = fractions[i] as number;
      absorption += fraction * (paint.k[wave] as number);
      scattering += fraction * (paint.s[wave] as number);
    });
    curve[wave] = applySurface(ksToReflectance(absorption / scattering), surface);
  }
  return curve;
}

/**
 * Builds a fast mixing function for a fixed list of paints.
 * The solver calls it hundreds of thousands of times per target, so it works on flat arrays and allocates nothing.
 * It gives the same result as mixReflectance followed by reflectanceToXyz and xyzToLab.
 */
export function createMixer(paints: readonly PaintCurves[], { k1, k2 }: SurfaceTerms): MixToLab {
  const waves = paints[0]?.k.length ?? 0;
  const flatK = new Float64Array(paints.length * waves);
  const flatS = new Float64Array(paints.length * waves);
  paints.forEach((paint, i) => {
    flatK.set(paint.k, i * waves);
    flatS.set(paint.s, i * waves);
  });
  const weightX = Float64Array.from(WEIGHT_X);
  const weightY = Float64Array.from(WEIGHT_Y);
  const weightZ = Float64Array.from(WEIGHT_Z);
  const outside = (1 - k1) * (1 - k2);

  return (indices, fractions, out) => {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let wave = 0; wave < waves; wave++) {
      let absorption = 0;
      let scattering = 0;
      for (let part = 0; part < indices.length; part++) {
        const row = (indices[part] as number) * waves + wave;
        const fraction = fractions[part] as number;
        absorption += fraction * (flatK[row] as number);
        scattering += fraction * (flatS[row] as number);
      }
      const ks = absorption / scattering;
      const inner = 1 / (1 + ks + Math.sqrt(ks * ks + 2 * ks));
      const seen = k1 + (outside * inner) / (1 - k2 * inner);
      x += seen * (weightX[wave] as number);
      y += seen * (weightY[wave] as number);
      z += seen * (weightZ[wave] as number);
    }
    const fx = labForward(x / TABLE_WHITE.x);
    const fy = labForward(y / TABLE_WHITE.y);
    const fz = labForward(z / TABLE_WHITE.z);
    out.l = 116 * fy - 16;
    out.a = 500 * (fx - fy);
    out.b = 200 * (fy - fz);
  };
}
