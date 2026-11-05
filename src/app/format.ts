// Developed by Interactive 63 (https://interactive63.com)
//
// Small text and colour helpers for the interface: closeness wording, hex parsing and readable text colours.
import type { Rgb } from '../colour/convert';

// How far a mix may miss before the wording changes, in CIEDE2000.
export const VERY_CLOSE = 2;
export const CLOSE = 5;
export const OUT_OF_REACH = 10;

// The two text colours of the interface, matching the soot and paper tokens in styles.css.
export const SOOT = '#1c1a18';
export const PAPER = '#e8dfc8';
// The unpainted background of an empty half, matching the bare token.
export const BARE = '#2a2825';

// Standard sRGB transfer function and luminance weights, as used for WCAG contrast ratios.
const LINEAR_THRESHOLD = 0.04045;
const LINEAR_SLOPE = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_SCALE = 1.055;
const GAMMA = 2.4;
const LUMINANCE_RED = 0.2126;
const LUMINANCE_GREEN = 0.7152;
const LUMINANCE_BLUE = 0.0722;
const CONTRAST_OFFSET = 0.05;

const MAX_CHANNEL = 255;
const HEX_RADIX = 16;

/** Turns a CIEDE2000 miss into words a painter can use. */
export function closeness(off: number): string {
  if (off < VERY_CLOSE) return 'very close';
  if (off < CLOSE) return 'close';
  if (off < OUT_OF_REACH) return 'a visible difference';
  return 'out of reach';
}

/** Whether a miss is large enough to warn that the palette cannot reach the target. */
export function isOutOfReach(off: number): boolean {
  return off >= OUT_OF_REACH;
}

/** Reads a hex code as typed, accepting a missing hash and the three-digit form. Returns lower case, or null. */
export function parseHex(text: string): string | null {
  const digits = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim())?.[1];
  if (!digits) return null;
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  return `#${full.toLowerCase()}`;
}

/** Converts a six-digit hex code from parseHex to sRGB channels. */
export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), HEX_RADIX);
  return { r: (value >> 16) & MAX_CHANNEL, g: (value >> 8) & MAX_CHANNEL, b: value & MAX_CHANNEL };
}

/** Converts sRGB channels to a lower-case six-digit hex code. */
export function rgbToHex({ r, g, b }: Rgb): string {
  const pair = (channel: number): string => channel.toString(HEX_RADIX).padStart(2, '0');
  return `#${pair(r)}${pair(g)}${pair(b)}`;
}

/** Linearises one sRGB channel from 0 to 255. */
function linearChannel(channel: number): number {
  const value = channel / MAX_CHANNEL;
  return value <= LINEAR_THRESHOLD ? value / LINEAR_SLOPE : ((value + GAMMA_OFFSET) / GAMMA_SCALE) ** GAMMA;
}

/** Relative luminance of a hex colour. */
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return LUMINANCE_RED * linearChannel(r) + LUMINANCE_GREEN * linearChannel(g) + LUMINANCE_BLUE * linearChannel(b);
}

/** Chooses whichever of soot or paper has the higher contrast ratio against a hex colour. */
export function textOn(hex: string): string {
  const background = luminance(hex);
  const sootContrast = (background + CONTRAST_OFFSET) / (luminance(SOOT) + CONTRAST_OFFSET);
  const paperContrast = (luminance(PAPER) + CONTRAST_OFFSET) / (background + CONTRAST_OFFSET);
  return sootContrast > paperContrast ? SOOT : PAPER;
}
