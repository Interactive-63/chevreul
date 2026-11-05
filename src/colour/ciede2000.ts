// Developed by Interactive 63 (https://interactive63.com)
//
// Colour difference measures. CIEDE2000 is what the solver minimises, as it tracks perceived difference closely.
// CIE76, plain distance in CIELAB, is kept for comparing against figures quoted on that older scale.
import type { Lab } from './convert';

const DEGREES = 180 / Math.PI;
const RADIANS = Math.PI / 180;
const POW_25_7 = 25 ** 7;

/** Returns a hue angle in degrees from 0 to 360, treating an achromatic colour as hue zero. */
function hueDegrees(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const hue = Math.atan2(b, a) * DEGREES;
  return hue < 0 ? hue + 360 : hue;
}

/**
 * Computes CIEDE2000 between two colours, with all weighting factors at one.
 * Follows Sharma, Wu and Dalal (2005), including their handling of hue when the angles straddle 360 degrees.
 */
export function ciede2000(first: Lab, second: Lab): number {
  const chromaMean = (Math.hypot(first.a, first.b) + Math.hypot(second.a, second.b)) / 2;
  const chromaPow = chromaMean ** 7;
  const g = 0.5 * (1 - Math.sqrt(chromaPow / (chromaPow + POW_25_7)));

  const a1 = (1 + g) * first.a;
  const a2 = (1 + g) * second.a;
  const c1 = Math.hypot(a1, first.b);
  const c2 = Math.hypot(a2, second.b);
  const h1 = hueDegrees(a1, first.b);
  const h2 = hueDegrees(a2, second.b);
  const achromatic = c1 * c2 === 0;

  let hueStep = 0;
  if (!achromatic) {
    hueStep = h2 - h1;
    if (hueStep > 180) hueStep -= 360;
    else if (hueStep < -180) hueStep += 360;
  }
  const deltaL = second.l - first.l;
  const deltaC = c2 - c1;
  const deltaH = 2 * Math.sqrt(c1 * c2) * Math.sin((hueStep / 2) * RADIANS);

  const lMean = (first.l + second.l) / 2;
  const cMean = (c1 + c2) / 2;
  let hMean = h1 + h2;
  if (!achromatic) {
    if (Math.abs(h1 - h2) <= 180) hMean = (h1 + h2) / 2;
    else hMean = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }

  const t =
    1 -
    0.17 * Math.cos((hMean - 30) * RADIANS) +
    0.24 * Math.cos(2 * hMean * RADIANS) +
    0.32 * Math.cos((3 * hMean + 6) * RADIANS) -
    0.2 * Math.cos((4 * hMean - 63) * RADIANS);
  const lShift = (lMean - 50) ** 2;
  const sl = 1 + (0.015 * lShift) / Math.sqrt(20 + lShift);
  const sc = 1 + 0.045 * cMean;
  const sh = 1 + 0.015 * cMean * t;
  const cPow = cMean ** 7;
  const rc = 2 * Math.sqrt(cPow / (cPow + POW_25_7));
  const rotation = 30 * Math.exp(-(((hMean - 275) / 25) ** 2));
  const rt = -Math.sin(2 * rotation * RADIANS) * rc;

  const lightness = deltaL / sl;
  const chroma = deltaC / sc;
  const hue = deltaH / sh;
  return Math.sqrt(lightness ** 2 + chroma ** 2 + hue ** 2 + rt * chroma * hue);
}

/** Computes CIE76, the straight-line distance between two colours in CIELAB. */
export function cie76(first: Lab, second: Lab): number {
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b);
}
