// Developed by Interactive 63 (https://interactive63.com)
//
// Colour conversions: reflectance to XYZ to CIELAB, and sRGB to and from CIELAB under D65.
// CIELAB is the bridge between paint and screen. Reflectance is measured against the white of the CIE tables and
// sRGB against its own D65 white, and each maps to L* 100, a* 0, b* 0, so white paint and #ffffff agree.
import { WEIGHT_X, WEIGHT_Y, WEIGHT_Z } from '../data/cie-tables';

/** A colour in CIELAB under D65. */
export interface Lab {
  l: number;
  a: number;
  b: number;
}

/** A colour in CIE XYZ, with white at Y = 1. */
export interface Xyz {
  x: number;
  y: number;
  z: number;
}

/** An 8-bit sRGB colour, each channel a whole number from 0 to 255. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** The sRGB result of a conversion, and whether the colour fits inside sRGB before clamping. */
export interface GamutRgb {
  rgb: Rgb;
  inGamut: boolean;
}

// How far outside 0 to 1 a linear channel may fall and still count as in gamut, which absorbs rounding noise.
const GAMUT_TOLERANCE = 0.001;

// Standard sRGB matrices between linear RGB and XYZ, relative to D65.
const RGB_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
] as const;
const XYZ_TO_RGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
] as const;

// The white each side of the bridge is relative to: sRGB's from its matrix, reflectance's from the CIE tables.
const SRGB_WHITE: Xyz = {
  x: RGB_TO_XYZ[0][0] + RGB_TO_XYZ[0][1] + RGB_TO_XYZ[0][2],
  y: RGB_TO_XYZ[1][0] + RGB_TO_XYZ[1][1] + RGB_TO_XYZ[1][2],
  z: RGB_TO_XYZ[2][0] + RGB_TO_XYZ[2][1] + RGB_TO_XYZ[2][2],
};

/** Sums one weighting table, giving that channel's value for a perfect reflector. */
function tableTotal(weights: readonly number[]): number {
  return weights.reduce((total, weight) => total + weight, 0);
}

/** XYZ of a perfect reflector under the CIE tables. */
export const TABLE_WHITE: Xyz = {
  x: tableTotal(WEIGHT_X),
  y: tableTotal(WEIGHT_Y),
  z: tableTotal(WEIGHT_Z),
};

// CIELAB's break point between the cube root and its linear section near black.
const LAB_DELTA = 6 / 29;

/** The CIELAB forward function, applied to a channel already divided by its white. */
export function labForward(ratio: number): number {
  return ratio > LAB_DELTA ** 3 ? Math.cbrt(ratio) : ratio / (3 * LAB_DELTA * LAB_DELTA) + 4 / 29;
}

/** Undoes labForward. */
function labInverse(value: number): number {
  return value > LAB_DELTA ? value ** 3 : 3 * LAB_DELTA * LAB_DELTA * (value - 4 / 29);
}

/** Integrates a reflectance curve, sampled on WAVELENGTHS, against the CIE tables. */
export function reflectanceToXyz(reflectance: ArrayLike<number>): Xyz {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < reflectance.length; i++) {
    const value = reflectance[i] as number;
    x += value * (WEIGHT_X[i] as number);
    y += value * (WEIGHT_Y[i] as number);
    z += value * (WEIGHT_Z[i] as number);
  }
  return { x, y, z };
}

/** Converts channels already divided by their white to CIELAB. */
function ratiosToLab(xRatio: number, yRatio: number, zRatio: number): Lab {
  const fx = labForward(xRatio);
  const fy = labForward(yRatio);
  const fz = labForward(zRatio);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Converts XYZ measured against the CIE tables' white to CIELAB. */
export function xyzToLab(xyz: Xyz): Lab {
  return ratiosToLab(xyz.x / TABLE_WHITE.x, xyz.y / TABLE_WHITE.y, xyz.z / TABLE_WHITE.z);
}

/** Decodes one sRGB channel from 0 to 255 to linear light from 0 to 1. */
function toLinear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Encodes one linear channel from 0 to 1 back to sRGB's 0 to 1 scale. */
function fromLinear(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

/** Converts an 8-bit sRGB colour to CIELAB. */
export function rgbToLab({ r, g, b }: Rgb): Lab {
  const red = toLinear(r);
  const green = toLinear(g);
  const blue = toLinear(b);
  const [xRow, yRow, zRow] = RGB_TO_XYZ;
  return ratiosToLab(
    (xRow[0] * red + xRow[1] * green + xRow[2] * blue) / SRGB_WHITE.x,
    (yRow[0] * red + yRow[1] * green + yRow[2] * blue) / SRGB_WHITE.y,
    (zRow[0] * red + zRow[1] * green + zRow[2] * blue) / SRGB_WHITE.z,
  );
}

/** Rounds a linear channel to an 8-bit sRGB value, clamping anything out of range. */
function toByte(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  return Math.round(fromLinear(clamped) * 255);
}

/** Tells whether a linear channel falls inside sRGB. */
function channelFits(linear: number): boolean {
  return linear >= -GAMUT_TOLERANCE && linear <= 1 + GAMUT_TOLERANCE;
}

/** Converts CIELAB to 8-bit sRGB. Colours outside sRGB are clamped and flagged, as many saturated paints are. */
export function labToRgb({ l, a, b }: Lab): GamutRgb {
  const fy = (l + 16) / 116;
  const x = labInverse(fy + a / 500) * SRGB_WHITE.x;
  const y = labInverse(fy) * SRGB_WHITE.y;
  const z = labInverse(fy - b / 200) * SRGB_WHITE.z;
  const [redRow, greenRow, blueRow] = XYZ_TO_RGB;
  const red = redRow[0] * x + redRow[1] * y + redRow[2] * z;
  const green = greenRow[0] * x + greenRow[1] * y + greenRow[2] * z;
  const blue = blueRow[0] * x + blueRow[1] * y + blueRow[2] * z;
  return {
    rgb: { r: toByte(red), g: toByte(green), b: toByte(blue) },
    inGamut: channelFits(red) && channelFits(green) && channelFits(blue),
  };
}
