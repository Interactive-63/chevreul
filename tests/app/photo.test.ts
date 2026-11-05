// Developed by Interactive 63 (https://interactive63.com)
//
// Tests that sampling averages only opaque pixels and stays inside the image.
import { describe, expect, it } from 'vitest';
import { sampleArea, type PixelGrid } from '../../src/app/photo';

/** Builds a grid from a function giving each pixel's RGBA. */
function grid(width: number, height: number, pixel: (x: number, y: number) => number[]): PixelGrid {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { data, width, height } as PixelGrid;
}

describe('sampleArea', () => {
  it('averages a known area', () => {
    const image = grid(3, 3, (x) => (x === 1 ? [30, 60, 90, 255] : [0, 0, 0, 255]));
    expect(sampleArea(image, 1, 1, 1)).toEqual({ r: 10, g: 20, b: 30 });
  });

  it('reads a single pixel at radius zero', () => {
    const image = grid(2, 2, (x, y) => [x * 100, y * 100, 7, 255]);
    expect(sampleArea(image, 1, 1, 0)).toEqual({ r: 100, g: 100, b: 7 });
  });

  it('clamps at every corner', () => {
    const image = grid(4, 4, (x, y) => [x * 10, y * 10, 0, 255]);
    expect(sampleArea(image, 0, 0, 1)).toEqual({ r: 5, g: 5, b: 0 });
    expect(sampleArea(image, 3, 0, 1)).toEqual({ r: 25, g: 5, b: 0 });
    expect(sampleArea(image, 0, 3, 1)).toEqual({ r: 5, g: 25, b: 0 });
    expect(sampleArea(image, 3, 3, 1)).toEqual({ r: 25, g: 25, b: 0 });
  });

  it('leaves transparent and part-transparent pixels out of the average', () => {
    const image = grid(3, 1, (x) => [[200, 0, 0, 255], [0, 255, 0, 0], [0, 0, 255, 128]][x] as number[]);
    expect(sampleArea(image, 1, 0, 1)).toEqual({ r: 200, g: 0, b: 0 });
  });

  it('gives null when nothing under the pin is opaque', () => {
    expect(sampleArea(grid(2, 2, () => [9, 9, 9, 0]), 0, 0, 1)).toBeNull();
  });
});
