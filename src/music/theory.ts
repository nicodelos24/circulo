export const A4_MIDI = 69;
export const A4_FREQ = 440;

/** Nombres cromáticos con sostenidos (por defecto). */
export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Nombres cromáticos con bemoles. */
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** Nombres enarmónicos largos, útiles para etiquetas pequeñas. */
export const SOLFEGE_SHARP = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'] as const;
export const SOLFEGE_FLAT = ['Do', 'Reb', 'Re', 'Mib', 'Mi', 'Fa', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si'] as const;

/** Redondea a la octava de La 440. */
export function freqToMidi(freq: number): number {
  return A4_MIDI + 12 * Math.log2(freq / A4_FREQ);
}

/** Frecuencia en Hz de una nota MIDI. Acepta fracciones (bends incluidos). */
export function midiToFreq(midi: number): number {
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

export type AccidentalPreference = 'sharps' | 'flats';

export function midiToName(midi: number, pref: AccidentalPreference = 'sharps'): string {
  const names = pref === 'flats' ? FLAT_NAMES : SHARP_NAMES;
  return names[mod(midi, 12)];
}

export function midiToSolfege(midi: number, pref: AccidentalPreference = 'sharps'): string {
  const names = pref === 'flats' ? SOLFEGE_FLAT : SOLFEGE_SHARP;
  return names[mod(midi, 12)];
}

/** Etiqueta completa: nombre + octava, como en un afinador. */
export function midiToLabel(midi: number, pref: AccidentalPreference = 'sharps'): string {
  return `${midiToName(Math.round(midi), pref)}${Math.floor(Math.round(midi) / 12) - 1}`;
}

/** Semitonos exactos (admite bends) redondeados al semitono más cercano. */
export function quantizeToSemitone(midi: number): number {
  return Math.round(midi);
}

/** Nombre bonito para una nota fraccional: "A+0.34" o "A-1". */
export function describeBend(baseMidi: number, bendSemis: number, pref: AccidentalPreference = 'sharps'): string {
  const cents = Math.round(bendSemis * 100);
  if (cents === 0) return midiToLabel(baseMidi, pref);
  const target = baseMidi + bendSemis;
  const nearest = Math.round(target);
  const offset = Math.round((target - nearest) * 100);
  const name = midiToLabel(nearest, pref);
  if (offset === 0) return name;
  const sign = offset > 0 ? '+' : '\u2212';
  return `${name}${sign}${Math.abs(offset)}¢`;
}

export type ScaleId =
  | 'chromatic'
  | 'major'
  | 'minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'harmonicMinor'
  | 'melodicMinor'
  | 'majorPentatonic'
  | 'minorPentatonic'
  | 'blues'
  | 'wholeTone';

export interface ScaleDef {
  id: ScaleId;
  name: string;
  /** Semitonos desde la tónica; el benvenido es el índice 0. */
  intervals: number[];
}

export const SCALES: Record<ScaleId, ScaleDef> = {
  chromatic: { id: 'chromatic', name: 'Cromática', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  major: { id: 'major', name: 'Mayor', intervals: [0, 2, 4, 5, 7, 9, 11] },
  minor: { id: 'minor', name: 'Menor natural', intervals: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { id: 'dorian', name: 'Dórico', intervals: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { id: 'phrygian', name: 'Frigio', intervals: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { id: 'lydian', name: 'Lidio', intervals: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { id: 'mixolydian', name: 'Mixolidio', intervals: [0, 2, 4, 5, 7, 9, 10] },
  harmonicMinor: { id: 'harmonicMinor', name: 'Menor armónica', intervals: [0, 2, 3, 5, 7, 8, 11] },
  melodicMinor: { id: 'melodicMinor', name: 'Menor melódica', intervals: [0, 2, 3, 5, 7, 9, 11] },
  majorPentatonic: { id: 'majorPentatonic', name: 'Pentatónica mayor', intervals: [0, 2, 4, 7, 9] },
  minorPentatonic: { id: 'minorPentatonic', name: 'Pentatónica menor', intervals: [0, 3, 5, 7, 10] },
  blues: { id: 'blues', name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
  wholeTone: { id: 'wholeTone', name: 'Tonos enteros', intervals: [0, 2, 4, 6, 8, 10] },
};

export const SCALE_LIST: ScaleDef[] = Object.values(SCALES);

/** Grados (0-11) que pertenecen a la escala, como máscara de bits. */
export function scaleMask(scaleId: ScaleId): number {
  const scale = SCALES[scaleId];
  return scale.intervals.reduce((mask, semi) => mask | (1 << mod(semi, 12)), 0);
}

export function isInScale(midi: number, scaleId: ScaleId, rootPc: number): boolean {
  if (scaleId === 'chromatic') return true;
  const pc = mod(midi - rootPc, 12);
  return (scaleMask(scaleId) & (1 << pc)) !== 0;
}

/** Desplaza el valor hasta la nota de la escala más cercana (por cents). */
export function snapToScale(midi: number, scaleId: ScaleId, rootPc: number): number {
  if (scaleId === 'chromatic') return midi;
  const mask = scaleMask(scaleId);
  const base = Math.round(midi);
  let best = base;
  let bestDistance = Infinity;
  for (let delta = -12; delta <= 12; delta += 1) {
    const candidate = base + delta;
    if ((mask & (1 << mod(candidate - rootPc, 12))) === 0) continue;
    const distance = Math.abs(candidate - midi);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** Grado de la tónica dentro de la escala: -1 si no pertenece. */
export function scaleDegree(midi: number, scaleId: ScaleId, rootPc: number): number {
  const scale = SCALES[scaleId];
  const rel = mod(Math.round(midi) - rootPc, 12);
  return scale.intervals.indexOf(rel);
}

export function rootName(rootPc: number, pref: AccidentalPreference = 'sharps'): string {
  return midiToName(rootPc, pref);
}

const FLAT_PCS = new Set([1, 3, 6, 8, 10]);

/** Los bemoles se sienten naturales en Db, Eb, Gb, Ab y Bb. */
export function preferAccidentals(baseMidi: number, scaleId: ScaleId, rootPc: number): AccidentalPreference {
  if (scaleId === 'chromatic') return 'sharps';
  if (FLAT_PCS.has(mod(rootPc, 12))) return 'flats';
  const firstDegree = scaleDegree(baseMidi, scaleId, rootPc);
  return firstDegree > 0 ? 'flats' : 'sharps';
}

export function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
