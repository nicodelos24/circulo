import { SCALES, type AccidentalPreference, type ScaleId } from '../music/theory';

export type ParamCurve = 'lin' | 'exp';

export interface ParamOption {
  value: number;
  label: string;
}

export interface ParamDef {
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
  curve: ParamCurve;
  unit?: string;
  options?: ParamOption[];
}

export type ModuleId =
  | 'voice'
  | 'drive'
  | 'chorus'
  | 'phaser'
  | 'tremolo'
  | 'delay'
  | 'reverb'
  | 'compressor'
  | 'master';

export interface ModuleDef {
  id: ModuleId;
  name: string;
  /** Descripción corta que aparece en el rack. */
  blurb: string;
  color: string;
  bypassable: boolean;
  params: ParamDef[];
}

export const WAVE_OPTIONS: ParamOption[] = [
  { value: 0, label: 'Sierra' },
  { value: 1, label: 'Pulso' },
  { value: 2, label: 'Triángulo' },
  { value: 3, label: 'Seno' },
];

export const STAGES_OPTIONS: ParamOption[] = [
  { value: 2, label: '2' },
  { value: 4, label: '4' },
  { value: 6, label: '6' },
  { value: 8, label: '8' },
];

export const SHAPE_OPTIONS: ParamOption[] = [
  { value: 0, label: 'Seno' },
  { value: 1, label: 'Cuadro' },
  { value: 2, label: 'Triángulo' },
];

export const MODULES: Record<ModuleId, ModuleDef> = {
  voice: {
    id: 'voice',
    name: 'Voz',
    blurb: 'Osciladores, filtro y envolvente de cada nota',
    color: '#7dd3fc',
    bypassable: false,
    params: [
      { id: 'wave', label: 'Onda', min: 0, max: 3, default: 0, curve: 'lin', options: WAVE_OPTIONS },
      { id: 'detune', label: 'Desfase', min: 0, max: 40, default: 12, curve: 'lin', unit: '¢' },
      { id: 'sub', label: 'Sub', min: 0, max: 1, default: 0.35, curve: 'lin' },
      { id: 'noise', label: 'Ruido', min: 0, max: 0.6, default: 0.04, curve: 'lin' },
      { id: 'cutoff', label: 'Filtro', min: 120, max: 12000, default: 2600, curve: 'exp', unit: 'Hz' },
      { id: 'resonance', label: 'Resonancia', min: 0, max: 1, default: 0.35, curve: 'lin' },
      { id: 'envAmount', label: 'Env. filtro', min: 0, max: 1, default: 0.6, curve: 'lin' },
      { id: 'attack', label: 'Ataque', min: 0.001, max: 1.2, default: 0.01, curve: 'exp', unit: 's' },
      { id: 'decay', label: 'Caída', min: 0.02, max: 3, default: 0.35, curve: 'exp', unit: 's' },
      { id: 'sustain', label: 'Sostenido', min: 0, max: 1, default: 0.72, curve: 'lin' },
      { id: 'release', label: 'Liberación', min: 0.02, max: 4, default: 0.35, curve: 'exp', unit: 's' },
      { id: 'bendGlide', label: 'Suavizado', min: 0, max: 120, default: 22, curve: 'lin', unit: 'ms' },
    ],
  },
  drive: {
    id: 'drive',
    name: 'Saturación',
    blurb: 'Armónicos y pegamento',
    color: '#fb923c',
    bypassable: true,
    params: [
      { id: 'drive', label: 'Cantidad', min: 0, max: 1, default: 0.32, curve: 'lin' },
      { id: 'tone', label: 'Tono', min: 0, max: 1, default: 0.55, curve: 'lin' },
      { id: 'mix', label: 'Mezcla', min: 0, max: 1, default: 0.6, curve: 'lin' },
    ],
  },
  chorus: {
    id: 'chorus',
    name: 'Coro',
    blurb: 'Desfase temporal con LFO',
    color: '#c084fc',
    bypassable: true,
    params: [
      { id: 'rate', label: 'Velocidad', min: 0.05, max: 8, default: 0.6, curve: 'exp', unit: 'Hz' },
      { id: 'depth', label: 'Profundidad', min: 0, max: 1, default: 0.45, curve: 'lin' },
      { id: 'mix', label: 'Mezcla', min: 0, max: 1, default: 0.5, curve: 'lin' },
      { id: 'spread', label: 'Estéreo', min: 0, max: 1, default: 0.7, curve: 'lin' },
    ],
  },
  phaser: {
    id: 'phaser',
    name: 'Fase',
    blurb: 'Barrido de fase tipo jet',
    color: '#f472b6',
    bypassable: true,
    params: [
      { id: 'rate', label: 'Velocidad', min: 0.05, max: 8, default: 0.35, curve: 'exp', unit: 'Hz' },
      { id: 'depth', label: 'Profundidad', min: 0, max: 1, default: 0.7, curve: 'lin' },
      { id: 'feedback', label: 'Realim.', min: 0, max: 0.9, default: 0.45, curve: 'lin' },
      { id: 'mix', label: 'Mezcla', min: 0, max: 1, default: 0.5, curve: 'lin' },
      { id: 'stages', label: 'Etapas', min: 2, max: 8, default: 4, curve: 'lin', options: STAGES_OPTIONS },
    ],
  },
  tremolo: {
    id: 'tremolo',
    name: 'Tremolo',
    blurb: 'Amplitud pulsante',
    color: '#38bdf8',
    bypassable: true,
    params: [
      { id: 'rate', label: 'Velocidad', min: 0.2, max: 20, default: 5.5, curve: 'exp', unit: 'Hz' },
      { id: 'depth', label: 'Profundidad', min: 0, max: 1, default: 0.5, curve: 'lin' },
      { id: 'shape', label: 'Forma', min: 0, max: 2, default: 0, curve: 'lin', options: SHAPE_OPTIONS },
    ],
  },
  delay: {
    id: 'delay',
    name: 'Eco',
    blurb: 'Repeticiones con realimentación',
    color: '#34d399',
    bypassable: true,
    params: [
      { id: 'time', label: 'Tiempo', min: 0.03, max: 1.5, default: 0.34, curve: 'exp', unit: 's' },
      { id: 'feedback', label: 'Realim.', min: 0, max: 0.9, default: 0.42, curve: 'lin' },
      { id: 'tone', label: 'Tono', min: 0, max: 1, default: 0.5, curve: 'lin' },
      { id: 'mix', label: 'Mezcla', min: 0, max: 1, default: 0.32, curve: 'lin' },
    ],
  },
  reverb: {
    id: 'reverb',
    name: 'Sala',
    blurb: 'Cola de reverberación',
    color: '#a3e635',
    bypassable: true,
    params: [
      { id: 'size', label: 'Tamaño', min: 0, max: 1, default: 0.5, curve: 'lin' },
      { id: 'tone', label: 'Tono', min: 0, max: 1, default: 0.55, curve: 'lin' },
      { id: 'damp', label: 'Absorción', min: 0, max: 1, default: 0.45, curve: 'lin' },
      { id: 'mix', label: 'Mezcla', min: 0, max: 1, default: 0.28, curve: 'lin' },
    ],
  },
  compressor: {
    id: 'compressor',
    name: 'Compresor',
    blurb: 'Control de dinámica antes del master',
    color: '#facc15',
    bypassable: true,
    params: [
      { id: 'threshold', label: 'Umbral', min: -48, max: 0, default: -20, curve: 'lin', unit: 'dB' },
      { id: 'ratio', label: 'Rango', min: 1, max: 12, default: 3, curve: 'lin', unit: ':1' },
      { id: 'attack', label: 'Ataque', min: 0.001, max: 0.2, default: 0.008, curve: 'exp', unit: 's' },
      { id: 'makeup', label: 'Compensación', min: 0, max: 2, default: 0.7, curve: 'lin' },
    ],
  },
  master: {
    id: 'master',
    name: 'Master',
    blurb: 'Volumen y safety de salida',
    color: '#e2e8f0',
    bypassable: false,
    params: [
      { id: 'volume', label: 'Volumen', min: 0, max: 1, default: 0.75, curve: 'lin' },
      { id: 'limiter', label: 'Limitador', min: 0, max: 1, default: 1, curve: 'lin' },
    ],
  },
};

export const MODULE_ORDER: ModuleId[] = [
  'drive',
  'chorus',
  'phaser',
  'tremolo',
  'delay',
  'reverb',
  'compressor',
  'master',
];

export type ModuleState = Record<ModuleId, { enabled: boolean; params: Record<string, number> }>;

export function defaultModuleState(): ModuleState {
  const state = {} as ModuleState;
  for (const def of Object.values(MODULES)) {
    const params: Record<string, number> = {};
    for (const param of def.params) params[param.id] = param.default;
    state[def.id] = { enabled: def.bypassable ? true : true, params };
  }
  return state;
}

export function cloneModuleState(state: ModuleState): ModuleState {
  const copy = {} as ModuleState;
  for (const id of Object.keys(state) as ModuleId[]) {
    copy[id] = { enabled: state[id].enabled, params: { ...state[id].params } };
  }
  return copy;
}

/** Aplica un parche preservando parámetros que el preset no menciona. */
export function mergeModuleState(base: ModuleState, patch: Partial<ModuleState>): ModuleState {
  const next = cloneModuleState(base);
  for (const id of Object.keys(patch) as ModuleId[]) {
    const incoming = patch[id];
    if (!incoming) continue;
    next[id] = {
      enabled: incoming.enabled ?? next[id].enabled,
      params: { ...next[id].params, ...incoming.params },
    };
  }
  return next;
}

export function clampParam(def: ParamDef, value: number): number {
  if (def.options) {
    const closest = def.options.reduce((best, option) =>
      Math.abs(option.value - value) < Math.abs(best - value) ? option.value : best,
    def.options[0].value);
    return closest;
  }
  return Math.min(def.max, Math.max(def.min, value));
}

export type LayoutId = 'guitar' | 'harmonica' | 'grid';

export interface AppSettings {
  layout: LayoutId;
  octaves: number;
  baseOctave: number;
  accidental: AccidentalPreference;
  labelStyle: 'notes' | 'solfege';
  showLabels: boolean;
  scaleId: ScaleId;
  rootPc: number;
  quantizeNotes: boolean;
  snapBend: boolean;
  bendUp: number;
  bendDown: number;
  bendTravel: number;
  springReturn: boolean;
  vibratoDepth: number;
  vibratoRate: number;
  tiltVibrato: boolean;
  tiltDepth: number;
  glide: boolean;
  sustainOnRelease: boolean;
  multiTouch: boolean;
  haptics: boolean;
  arpMode: 'off' | 'up' | 'down' | 'updown' | 'random' | 'chord';
  arpRate: number;
  arpOctaves: number;
  looper: boolean;
  reduceMotion: boolean;
  theme: 'noche' | 'grafito' | 'amanecer';
}

export const DEFAULT_SETTINGS: AppSettings = {
  layout: 'guitar',
  octaves: 2,
  baseOctave: 3,
  accidental: 'sharps',
  labelStyle: 'notes',
  showLabels: true,
  scaleId: 'chromatic',
  rootPc: 0,
  quantizeNotes: false,
  snapBend: true,
  bendUp: 2,
  bendDown: 1,
  bendTravel: 120,
  springReturn: true,
  vibratoDepth: 0.35,
  vibratoRate: 5.5,
  tiltVibrato: true,
  tiltDepth: 0.5,
  glide: true,
  sustainOnRelease: true,
  multiTouch: true,
  haptics: true,
  arpMode: 'off',
  arpRate: 8,
  arpOctaves: 2,
  looper: false,
  reduceMotion: false,
  theme: 'noche',
};

export function availableScales(): ScaleId[] {
  return Object.keys(SCALES) as ScaleId[];
}
