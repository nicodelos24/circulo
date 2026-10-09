import type { ModuleId } from './patch';

/** Parámetros continuos que el hilo principal manda por nota y por bloque. */
export interface VoicePatch {
  /** Bend en semitonos, positivo = sostenido. */
  bend: number;
  /** Amplitud del vibrato en semitonos. */
  vibratoDepth: number;
  /** Frecuencia del vibrato en Hz. */
  vibratoRate: number;
  /** Panorámica estéreo -1..1. */
  pan: number;
  /** Presión 0..1 (más presión = filtro más abierto). */
  pressure: number;
}

export function defaultPatch(): VoicePatch {
  return { bend: 0, vibratoDepth: 0, vibratoRate: 5.5, pan: 0, pressure: 0.6 };
}

export type ToWorklet =
  | { type: 'noteOn'; id: number; midi: number; velocity: number; pan: number }
  | { type: 'noteOff'; id: number; releaseVelocity?: number }
  | { type: 'allOff' }
  | { type: 'patch'; id: number; patch: VoicePatch }
  | { type: 'param'; module: ModuleId; id: string; value: number }
  | { type: 'enable'; module: ModuleId; enabled: boolean }
  | { type: 'pan'; id: number; pan: number };

export type FromWorklet = { type: 'meter'; peak: number; rms: number; voices: number };

export interface WorkletParamSnapshot {
  [module: string]: Record<string, number>;
}
