/**
 * Osciladores con corrección PolyBLEP: eliminan el aliasing-hardware de las
 * ondas discontinuas (sierra y pulso) sin necesidad de tablas de wavetable.
 */

import { fastSin } from './fastmath';

export interface OscState {
  phase: number;
  tri: number;
}

export function createOscState(): OscState {
  return { phase: 0, tri: 0 };
}

/** Residuo de banda limitada en el punto de discontinuidad. */
export function polyBlep(t: number, dt: number): number {
  if (dt <= 0) return 0;
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

function advance(state: OscState, inc: number): void {
  state.phase += inc;
  if (state.phase >= 1) state.phase -= 1;
  else if (state.phase < 0) state.phase += 1;
}

export function oscSine(state: OscState, inc: number): number {
  const value = fastSin(state.phase);
  advance(state, inc);
  return value;
}

export function oscSaw(state: OscState, inc: number): number {
  const t = state.phase;
  const value = 2 * t - 1 - polyBlep(t, inc);
  advance(state, inc);
  return value;
}

/** Pulso con ancho variable (0.5 = cuadrada). */
export function oscPulse(state: OscState, inc: number, width = 0.5): number {
  const t = state.phase;
  let value = t < width ? 1 : -1;
  value += polyBlep(t, inc);
  let shifted = t - width;
  if (shifted < 0) shifted += 1;
  value -= polyBlep(shifted, inc);
  advance(state, inc);
  return value;
}

/** Triángulo por integración con fuga de un pulso ya limitado en banda. */
export function oscTriangle(state: OscState, inc: number): number {
  const t = state.phase;
  let square = t < 0.5 ? 1 : -1;
  square += polyBlep(t, inc);
  let shifted = t - 0.5;
  if (shifted < 0) shifted += 1;
  square -= polyBlep(shifted, inc);
  state.tri = 0.5 * (state.tri + square);
  advance(state, inc);
  return state.tri * 2;
}

export type WaveShape = 0 | 1 | 2 | 3;

export function oscByShape(state: OscState, inc: number, shape: WaveShape, width = 0.5): number {
  switch (shape) {
    case 0:
      return oscSaw(state, inc);
    case 1:
      return oscPulse(state, inc, width);
    case 2:
      return oscTriangle(state, inc);
    default:
      return oscSine(state, inc);
  }
}

/** Onda de pulso modulada en frecuencia por un LFO (timbre Sweep). */
export interface SwooshState extends OscState {
  modPhase: number;
  modDepth: number;
  modRate: number;
}

export function createSwooshState(): SwooshState {
  return { phase: 0, tri: 0, modPhase: 0, modDepth: 0, modRate: 2 };
}

export function oscSwoosh(state: SwooshState, inc: number): number {
  const lfo = fastSin(state.modPhase) * state.modDepth;
  const modulated = inc * Math.pow(2, lfo);
  const value = oscSaw(state, modulated);
  state.modPhase += state.modRate / 44100;
  if (state.modPhase >= 1) state.modPhase -= 1;
  return value;
}

let noiseSeed = 0x9e3779b9;

export function noise(): number {
  noiseSeed ^= noiseSeed << 13;
  noiseSeed ^= noiseSeed >>> 17;
  noiseSeed ^= noiseSeed << 5;
  return ((noiseSeed >>> 0) / 0xffffffff) * 2 - 1;
}

export function seedNoise(seed: number): void {
  noiseSeed = seed >>> 0 || 1;
}
