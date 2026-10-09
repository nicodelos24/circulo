import { DEFAULT_SETTINGS, type AppSettings, type ModuleState } from '../audio/patch';
import { defaultModuleState } from '../audio/patch';

/** Un preset toca voz + módulos; el resto de ajustes (gestos) no se guarda. */
export interface Preset {
  id: string;
  name: string;
  hint: string;
  modules: ModuleState;
}

function module(id: keyof ModuleState, params: Record<string, number>, enabled = true) {
  return { [id]: { enabled, params } } as Partial<ModuleState>;
}

export const PRESETS: Preset[] = [
  {
    id: 'cristal',
    name: 'Cristal',
    hint: 'Sintetizador limpio y brillante para bends largos',
    modules: {
      ...defaultModuleState(),
      ...module('voice', { wave: 0, detune: 14, sub: 0.28, cutoff: 3400, resonance: 0.3, envAmount: 0.55, decay: 0.6, sustain: 0.8, release: 0.6 }),
      ...module('chorus', { rate: 0.45, depth: 0.4, mix: 0.4 }),
      ...module('delay', { time: 0.38, feedback: 0.38, mix: 0.26 }),
      ...module('reverb', { size: 0.6, mix: 0.24 }),
    },
  },
  {
    id: 'laton',
    name: 'Latón',
    hint: 'Sostenido cálido, ideal para vibrato',
    modules: {
      ...defaultModuleState(),
      ...module('voice', { wave: 1, detune: 8, sub: 0.4, cutoff: 1500, resonance: 0.5, envAmount: 0.7, attack: 0.03, decay: 0.4, sustain: 0.85, release: 0.3 }),
      ...module('drive', { drive: 0.35, tone: 0.45, mix: 0.55 }),
      ...module('reverb', { size: 0.45, mix: 0.3 }),
    },
  },
  {
    id: 'bruma',
    name: 'Bruma',
    hint: 'Pad atmosférico para glissandos largos',
    modules: {
      ...defaultModuleState(),
      ...module('voice', { wave: 0, detune: 26, sub: 0.2, cutoff: 1200, resonance: 0.25, attack: 0.25, decay: 1.2, sustain: 0.9, release: 1.6 }),
      ...module('chorus', { rate: 0.3, depth: 0.7, mix: 0.6 }),
      ...module('reverb', { size: 0.85, tone: 0.6, mix: 0.45 }),
      ...module('delay', { time: 0.6, feedback: 0.5, mix: 0.3 }),
    },
  },
  {
    id: 'pulso',
    name: 'Pulso',
    hint: 'Seco y percusivo para stabs y bends picantes',
    modules: {
      ...defaultModuleState(),
      ...module('voice', { wave: 1, detune: 4, sub: 0.5, cutoff: 900, resonance: 0.6, attack: 0.004, decay: 0.18, sustain: 0.35, release: 0.18 }),
      ...module('drive', { drive: 0.6, tone: 0.6, mix: 0.8 }),
      ...module('phaser', { rate: 0.4, depth: 0.6, mix: 0.35 }),
      ...module('compressor', { threshold: -26, ratio: 6, makeup: 0.9 }),
    },
  },
  {
    id: 'temblor',
    name: 'Temblor',
    hint: 'Tremolo agresivo para vibratos marcados',
    modules: {
      ...defaultModuleState(),
      ...module('voice', { wave: 3, detune: 18, noise: 0.1, cutoff: 5200, resonance: 0.2, attack: 0.005, decay: 0.25, sustain: 0.6, release: 0.25 }),
      ...module('tremolo', { rate: 7.5, depth: 0.7 }),
      ...module('delay', { time: 0.24, feedback: 0.55, mix: 0.35 }),
      ...module('reverb', { size: 0.35, mix: 0.2 }),
    },
  },
  {
    id: 'orbital',
    name: 'Orbital',
    hint: 'Fase amplia y estéreo para deep bends',
    modules: {
      ...defaultModuleState(),
      ...module('voice', { wave: 0, detune: 22, sub: 0.3, cutoff: 2100, resonance: 0.45, attack: 0.05, decay: 0.8, sustain: 0.85, release: 1.1 }),
      ...module('drive', { drive: 0.22, tone: 0.7 }),
      ...module('chorus', { rate: 0.8, depth: 0.6, mix: 0.55, spread: 0.9 }),
      ...module('phaser', { rate: 0.25, depth: 0.8, mix: 0.4, stages: 6 }),
      ...module('reverb', { size: 0.75, mix: 0.35 }),
    },
  },
];

export function presetById(id: string | null): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}

export function initialState(): { settings: AppSettings; modules: ModuleState; presetId: string | null } {
  return {
    settings: { ...DEFAULT_SETTINGS },
    modules: defaultModuleState(),
    presetId: PRESETS[0].id,
  };
}

/** Sanea un estado guardado en localStorage para tolerar versiones viejas. */
export function reviveState(raw: unknown): {
  settings: AppSettings;
  modules: ModuleState;
  presetId: string | null;
} {
  const base = initialState();
  if (!raw || typeof raw !== 'object') return base;
  const input = raw as { settings?: Partial<AppSettings>; modules?: unknown; presetId?: string | null };
  const settings: AppSettings = { ...base.settings, ...(input.settings ?? {}) };
  if (!SCALE_KEYS.has(settings.scaleId)) settings.scaleId = 'chromatic';
  if (!LAYOUT_KEYS.has(settings.layout)) settings.layout = 'guitar';
  if (!THEME_KEYS.has(settings.theme)) settings.theme = 'noche';
  const modules = base.modules;
  const savedModules = (input.modules ?? {}) as Partial<ModuleState>;
  for (const id of Object.keys(modules) as (keyof ModuleState)[]) {
    const incoming = savedModules[id];
    if (!incoming) continue;
    modules[id] = {
      enabled: typeof incoming.enabled === 'boolean' ? incoming.enabled : modules[id].enabled,
      params: { ...modules[id].params, ...(incoming.params ?? {}) },
    };
  }
  return { settings, modules, presetId: input.presetId ?? base.presetId };
}

const SCALE_KEYS = new Set([
  'chromatic',
  'major',
  'minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'harmonicMinor',
  'melodicMinor',
  'majorPentatonic',
  'minorPentatonic',
  'blues',
  'wholeTone',
]);
const LAYOUT_KEYS = new Set(['guitar', 'harmonica', 'grid']);
const THEME_KEYS = new Set(['noche', 'grafito', 'amanecer']);
