// Developed by Interactive 63 (https://interactive63.com)
//
// The paints as the interface sees them: each paint with its swatch colour, in display order, plus the basic set.
// Swatches come from the paint's own K and S through the engine, so they agree with the mixes the app predicts.
import { labToRgb, reflectanceToXyz, xyzToLab, type Rgb } from '../colour/convert';
import { HEAVY_BODY_SURFACE, loadPaints, type Paint } from '../colour/dataset';
import { mixReflectance } from '../colour/kubelka-munk';
import { rgbToHex } from './format';

/** A paint with the colour it shows on screen. */
export interface Swatch {
  paint: Paint;
  hex: string;
}

/** The six paints the "basic set" button ticks: a white, a black and the primaries. */
export const BASIC_SET: readonly string[] = [
  'titanium-white',
  'cad-yellow-medium',
  'pyrrole-orange',
  'naphthol-red-medium',
  'ultramarine-blue',
  'carbon-black',
];

// Paints whose channels sit this close together read as neutrals, so they list after the colours.
const NEUTRAL_SPREAD = 14;
const DEGREES_PER_SECTOR = 60;
const FULL_CIRCLE = 360;
// Sort key that places every neutral after all hues.
const NEUTRAL_HUE = FULL_CIRCLE + 1;

/** Computes the colour of a paint at full strength. */
function swatchRgb(paint: Paint): Rgb {
  const reflectance = mixReflectance([paint], [1], HEAVY_BODY_SURFACE);
  return labToRgb(xyzToLab(reflectanceToXyz(reflectance))).rgb;
}

/** Hue in degrees for ordering the list, or NEUTRAL_HUE for a colour with too little hue to place. */
function displayHue({ r, g, b }: Rgb): number {
  const high = Math.max(r, g, b);
  const spread = high - Math.min(r, g, b);
  if (spread < NEUTRAL_SPREAD) return NEUTRAL_HUE;
  let sector: number;
  if (high === r) sector = (g - b) / spread;
  else if (high === g) sector = (b - r) / spread + 2;
  else sector = (r - g) / spread + 4;
  return (sector * DEGREES_PER_SECTOR + FULL_CIRCLE) % FULL_CIRCLE;
}

/** Builds every swatch, ordered by hue with neutrals last and lightest first. */
export function loadSwatches(): Swatch[] {
  const keyed = loadPaints().map((paint) => {
    const rgb = swatchRgb(paint);
    return { swatch: { paint, hex: rgbToHex(rgb) }, hue: displayHue(rgb), brightness: rgb.r + rgb.g + rgb.b };
  });
  keyed.sort((first, second) => first.hue - second.hue || second.brightness - first.brightness);
  return keyed.map(({ swatch }) => swatch);
}
