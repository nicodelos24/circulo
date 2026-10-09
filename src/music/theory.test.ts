import { describe, expect, it } from 'vitest';
import {
  A4_FREQ,
  SCALES,
  describeBend,
  freqToMidi,
  isInScale,
  midiToFreq,
  midiToLabel,
  midiToName,
  preferAccidentals,
  scaleMask,
  snapToScale,
} from './theory';

describe('teoría musical', () => {
  it('convierte entre MIDI y frecuencia', () => {
    expect(midiToFreq(69)).toBeCloseTo(A4_FREQ, 6);
    expect(midiToFreq(81)).toBeCloseTo(880, 6);
    expect(freqToMidi(A4_FREQ)).toBeCloseTo(69, 6);
    expect(midiToFreq(57)).toBeCloseTo(220, 6);
  });

  it('nombra las notas con sostenidos o bemoles', () => {
    expect(midiToName(61)).toBe('C#');
    expect(midiToName(61, 'flats')).toBe('Db');
    expect(midiToLabel(60)).toBe('C4');
    expect(midiToName(59)).toBe('B');
  });

  it('describe el bend en cents', () => {
    expect(describeBend(69, 0)).toBe('A4');
    expect(describeBend(69, 1)).toBe('A#4');
    expect(describeBend(69, 0.5)).toBe('A#4−50¢');
    expect(describeBend(69, 0.75)).toBe('A#4−25¢');
    expect(describeBend(69, -1.5)).toBe('G#4−50¢');
  });

  it('reconoce los grados de cada escala', () => {
    expect(isInScale(60, 'major', 0)).toBe(true);
    expect(isInScale(61, 'major', 0)).toBe(false);
    expect(isInScale(61, 'chromatic', 0)).toBe(true);
    expect(isInScale(63, 'minorPentatonic', 0)).toBe(true);
  });

  it('cuantiza a la nota más cercana de la escala', () => {
    expect(snapToScale(61, 'major', 0)).toBe(60);
    expect(snapToScale(62, 'major', 0)).toBe(62);
    expect(snapToScale(70.4, 'major', 0)).toBe(71);
    expect(snapToScale(61.4, 'major', 0)).toBe(62);
    expect(snapToScale(58.2, 'major', 0)).toBe(59);
    expect(snapToScale(59.6, 'major', 0)).toBe(60);
    // En menor pentatónica no hay cuarta: un Fa# cae en la quinta (Sol).
    expect(snapToScale(66.4, 'minorPentatonic', 0)).toBe(67);
    expect(Number.isInteger(snapToScale(61.37, 'chromatic', 0))).toBe(false);
  });

  it('la máscara de la escala cubre los grados', () => {
    expect(scaleMask('chromatic')).toBe(0b111111111111);
    expect(scaleMask('major')).toBe([0, 2, 4, 5, 7, 9, 11].reduce((mask, semi) => mask | (1 << semi), 0));
    expect(scaleMask('wholeTone')).toBe(0b10101010101);
    expect(scaleMask('minorPentatonic')).toBe([0, 3, 5, 7, 10].reduce((mask, semi) => mask | (1 << semi), 0));
  });

  it('todas las escalas empiezan en la tónica y caben en una octava', () => {
    for (const scale of Object.values(SCALES)) {
      expect(scale.intervals[0]).toBe(0);
      for (const interval of scale.intervals) {
        expect(interval).toBeGreaterThanOrEqual(0);
        expect(interval).toBeLessThan(12);
      }
    }
  });

  it('elige bemoles cuando la escala lo pide', () => {
    expect(preferAccidentals(61, 'major', 0)).toBe('sharps');
    expect(preferAccidentals(60, 'chromatic', 0)).toBe('sharps');
    expect(preferAccidentals(63, 'major', 10)).toBe('flats');
  });
});
