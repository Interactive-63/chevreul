// Developed by Interactive 63 (https://interactive63.com)
//
// Photo handling with no page layout: decoding a file to pixels, and averaging the pixels under the pin.
// Everything stays on the device. Nothing here sends the file anywhere or stores it.
import type { Rgb } from '../colour/convert';

// Longest edge kept after decoding, which bounds memory on very large phone photos.
export const MAX_PHOTO_EDGE = 1600;
// Half-width in pixels of the square averaged under the pin, so one stray pixel cannot set the target.
export const SAMPLE_RADIUS = 4;

// Alpha of a fully opaque pixel, and the number of bytes per pixel in canvas data.
const OPAQUE_ALPHA = 255;
const PIXEL_BYTES = 4;

/** A decoded photo. */
export interface DecodedPhoto {
  canvas: HTMLCanvasElement;
  pixels: ImageData;
}

/** The part of ImageData sampleArea reads, which tests can build by hand. */
export type PixelGrid = Pick<ImageData, 'data' | 'width' | 'height'>;

/** Keeps a value inside a range. */
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Decodes a file to a canvas capped at MAX_PHOTO_EDGE, the right way up. Rejects when the file cannot be decoded. */
export async function decodePhoto(file: Blob): Promise<DecodedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser could not prepare the photo.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { canvas, pixels: context.getImageData(0, 0, canvas.width, canvas.height) };
}

/**
 * Averages the opaque pixels in a square around a point, clamped at the image edges.
 * Returns null when the square holds no opaque pixels, as nothing there can be a target colour.
 */
export function sampleArea({ data, width, height }: PixelGrid, x: number, y: number, radius: number): Rgb | null {
  const left = clamp(x - radius, 0, width - 1);
  const right = clamp(x + radius, 0, width - 1);
  const top = clamp(y - radius, 0, height - 1);
  const bottom = clamp(y + radius, 0, height - 1);
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let row = top; row <= bottom; row++) {
    for (let column = left; column <= right; column++) {
      const start = (row * width + column) * PIXEL_BYTES;
      if (data[start + 3] !== OPAQUE_ALPHA) continue;
      red += data[start] as number;
      green += data[start + 1] as number;
      blue += data[start + 2] as number;
      count++;
    }
  }
  if (count === 0) return null;
  return { r: Math.round(red / count), g: Math.round(green / count), b: Math.round(blue / count) };
}
