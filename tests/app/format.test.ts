// Developed by Interactive 63 (https://interactive63.com)
//
// Tests the closeness wording boundaries, hex parsing and the choice of readable text colour.
import { describe, expect, it } from 'vitest';
import {
  CLOSE,
  closeness,
  hexToRgb,
  isOutOfReach,
  OUT_OF_REACH,
  PAPER,
  parseHex,
  rgbToHex,
  SOOT,
  textOn,
  VERY_CLOSE,
} from '../../src/app/format';

describe('closeness', () => {
  it('changes wording exactly at each boundary', () => {
    expect(closeness(VERY_CLOSE - 0.01)).toBe('very close');
    expect(closeness(VERY_CLOSE)).toBe('close');
    expect(closeness(CLOSE - 0.01)).toBe('close');
    expect(closeness(CLOSE)).toBe('a visible difference');
    expect(closeness(OUT_OF_REACH - 0.01)).toBe('a visible difference');
    expect(closeness(OUT_OF_REACH)).toBe('out of reach');
  });

  it('agrees with the out of reach check', () => {
    expect(isOutOfReach(OUT_OF_REACH - 0.01)).toBe(false);
    expect(isOutOfReach(OUT_OF_REACH)).toBe(true);
  });
});

describe('parseHex', () => {
  it('accepts six digits with or without the hash', () => {
    expect(parseHex('#9B0E00')).toBe('#9b0e00');
    expect(parseHex('9b0e00')).toBe('#9b0e00');
  });

  it('expands the short form', () => {
    expect(parseHex('#f80')).toBe('#ff8800');
    expect(parseHex('F80')).toBe('#ff8800');
  });

  it('ignores surrounding spaces', () => {
    expect(parseHex('  #000000 ')).toBe('#000000');
  });

  it('rejects anything else', () => {
    for (const text of ['', '#', '#12', '#1234', '#12345', '#1234567', '#gggggg', 'red']) {
      expect(parseHex(text)).toBeNull();
    }
  });
});

describe('hex conversion', () => {
  it('round-trips through channels', () => {
    expect(hexToRgb('#9b0e00')).toEqual({ r: 155, g: 14, b: 0 });
    expect(rgbToHex({ r: 155, g: 14, b: 0 })).toBe('#9b0e00');
    expect(rgbToHex({ r: 0, g: 0, b: 5 })).toBe('#000005');
  });
});

describe('textOn', () => {
  it('uses soot on white and paper on black', () => {
    expect(textOn('#ffffff')).toBe(SOOT);
    expect(textOn('#000000')).toBe(PAPER);
  });

  it('chooses by contrast on mid tones', () => {
    expect(textOn('#ffcb00')).toBe(SOOT);
    expect(textOn('#2b3a5c')).toBe(PAPER);
    expect(textOn('#808080')).toBe(SOOT);
  });
});
