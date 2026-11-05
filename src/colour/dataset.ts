// Developed by Interactive 63 (https://interactive63.com)
//
// The paint data: spectral data from heavy body acrylic paint, as K and S curves on the shared 10 nm grid.
// loadPaints() turns the stored JSON into the typed curves the mixing code works with.
import { WAVELENGTHS } from '../data/cie-tables';
import data from '../data/heavy-body-acrylic.json';
import type { PaintCurves, SurfaceTerms } from './kubelka-munk';

/** One paint a palette can hold. */
export interface Paint extends PaintCurves {
  /** Stable id, safe to save in a user's palette. */
  id: string;
  /** The name shown to painters. */
  name: string;
  /** Density relative to the white paint. */
  density: number;
}

/** Surface terms shared by every paint in the set. */
export const HEAVY_BODY_SURFACE: SurfaceTerms = data.surface;

let paints: readonly Paint[] | undefined;

/** Builds the paint list once and returns the same list on later calls. */
export function loadPaints(): readonly Paint[] {
  paints ??= data.paints.map((paint) => {
    if (paint.k.length !== WAVELENGTHS.length || paint.s.length !== WAVELENGTHS.length) {
      throw new Error(`Paint ${paint.id} is not on the shared wavelength grid.`);
    }
    return { ...paint, k: Float64Array.from(paint.k), s: Float64Array.from(paint.s) };
  });
  return paints;
}
