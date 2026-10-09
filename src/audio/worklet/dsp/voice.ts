import { Envelope } from './envelope';
import { fastSin, fastTanh } from './fastmath';
import { StateVariableFilter } from './filter';
import { createOscState, oscByShape, oscSine, type OscState, type WaveShape } from './osc';
import type { VoicePatch } from '../../protocol';

export const A4_MIDI = 69;
export const A4_FREQ = 440;

export interface VoiceParams {
  wave: number;
  detune: number;
  sub: number;
  noise: number;
  cutoff: number;
  resonance: number;
  envAmount: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** Suavizado del bend en milisegundos. */
  bendGlide: number;
}

export const DEFAULT_VOICE_PARAMS: VoiceParams = {
  wave: 0,
  detune: 12,
  sub: 0.35,
  noise: 0.04,
  cutoff: 2600,
  resonance: 0.35,
  envAmount: 0.6,
  attack: 0.01,
  decay: 0.35,
  sustain: 0.72,
  release: 0.35,
  bendGlide: 22,
};

export function midiToFreq(midi: number): number {
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

export function freqRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

const MAX_SMOOTH_BEND = 12;

/**
 * Una voz: dos osciladores desafinados, sub a la octava, ruido opcional,
 * filtro resonante con envolvente y envolvente de amplitud. El bend y el
 * vibrato se aplican sobre la frecuencia, no sobre un oscilador aparte, para
 * que el timbre se mueva como en un instrumento real.
 */
export class Voice {
  id: number;
  baseMidi: number;
  velocity: number;
  patch: VoicePatch;
  startedAt = 0;
  released = false;

  private readonly oscA: OscState = createOscState();
  private readonly oscB: OscState = createOscState();
  private readonly subOsc: OscState = createOscState();
  private readonly filter = new StateVariableFilter();
  private readonly ampEnv = new Envelope();
  private smoothBend = 0;
  private vibratoPhase = 0;
  private vibratoDepth = 0;
  private vibratoRate = 5.5;
  private noiseState = 0x1a2b3c4d;

  constructor(id: number, midi: number, velocity: number, patch: VoicePatch) {
    this.id = id;
    this.baseMidi = midi;
    this.velocity = velocity;
    this.patch = { ...patch };
    this.ampEnv.trigger();
    this.filter.reset();
  }

  /** Recicla la voz para una nota nueva (el pool tiene tamaño fijo). */
  start(id: number, midi: number, velocity: number, patch: VoicePatch, clock: number): void {
    this.id = id;
    this.baseMidi = midi;
    this.velocity = Math.max(0.05, Math.min(1, velocity));
    this.patch = { ...patch };
    this.startedAt = clock;
    this.released = false;
    this.smoothBend = 0;
    this.vibratoPhase = 0;
    this.vibratoDepth = 0;
    this.vibratoRate = patch.vibratoRate > 0 ? patch.vibratoRate : 5.5;
    this.noiseState = (midi * 2654435761 + id * 40503 + 12345) >>> 0 || 1;
    this.reset();
    this.ampEnv.trigger();
  }

  setPatch(patch: VoicePatch): void {
    this.patch = { ...patch };
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.ampEnv.enterRelease();
  }

  get active(): boolean {
    return this.ampEnv.active;
  }

  kill(): void {
    this.ampEnv.kill();
  }

  reset(): void {
    this.oscA.phase = 0;
    this.oscB.phase = 0.31;
    this.subOsc.phase = 0.17;
    this.filter.reset();
  }

  /**
   * Renderiza `samples` muestras estéreo. Devuelve false cuando la voz ya
   * terminó y puede reciclarse.
   */
  render(
    left: Float32Array,
    right: Float32Array,
    offset: number,
    samples: number,
    sampleRate: number,
    params: VoiceParams,
  ): boolean {
    const dt = 1 / sampleRate;
    const glide = Math.max(0.0005, params.bendGlide / 1000);
    const glideFactor = Math.min(1, (samples * dt) / glide);

    const target = Math.max(-MAX_SMOOTH_BEND, Math.min(MAX_SMOOTH_BEND, this.patch.bend));
    const startBend = this.smoothBend;
    const endBend = startBend + (target - startBend) * glideFactor;

    this.vibratoDepth += (this.patch.vibratoDepth - this.vibratoDepth) * glideFactor;
    this.vibratoRate += (this.patch.vibratoRate - this.vibratoRate) * glideFactor;

    this.ampEnv.prepare(sampleRate, params.attack, params.decay, params.sustain, params.release);

    const wave = (Math.round(params.wave) % 4) as WaveShape;
    const detuneRatio = freqRatio(params.detune / 100);
    const baseFreq = midiToFreq(this.baseMidi);
    const vel = Math.max(0.02, this.velocity);
    const pressure = Math.min(1, Math.max(0, this.patch.pressure));
    const envAmount = params.envAmount;
    const cutoffBase = params.cutoff * (1 + pressure * 0.8) * (0.75 + vel * 0.5);
    const resonance = params.resonance;
    const subAmount = params.sub;
    const noiseAmount = params.noise;
    const panRaw = Math.max(-1, Math.min(1, this.patch.pan));
    const angle = ((panRaw + 1) * Math.PI) / 4;
    const panL = Math.cos(angle);
    const panR = Math.sin(angle);
    const vibPhaseStart = this.vibratoPhase;
    const vibDepth = this.vibratoDepth;
    const vibRate = this.vibratoRate;
    let phase = vibPhaseStart;

    // La frecuencia se resuelve en los extremos del bloque y se interpola:
    // asi el bucle de audio no necesita ni un pow por muestra y por voz.
    const vibEnd = fastSin(phase + vibRate * samples * dt) * vibDepth;
    const freqStart = baseFreq * freqRatio(startBend + fastSin(phase) * vibDepth);
    const freqEnd = baseFreq * freqRatio(endBend + vibEnd);
    const freqStep = (freqEnd - freqStart) / samples;
    const incStep = freqStep / sampleRate;
    let inc = Math.min(0.45, freqStart / sampleRate);
    const incDetuneUp = incStep * detuneRatio;
    const incDetuneDown = incStep / detuneRatio;
    let incA = inc * detuneRatio;
    let incB = inc / detuneRatio;
    let incSub = inc * 0.5;
    const widthA = 0.5 - pressure * 0.18;
    const widthB = 0.5 + pressure * 0.12;
    const oscMix = 0.5 * (1 - subAmount * 0.25);
    const subMix = subAmount * 0.8;
    const noiseMix = noiseAmount > 0 ? noiseAmount * 0.5 : 0;
    this.filter.setCoefficients(cutoffBase * (1 + envAmount * 3.2 * this.ampEnv.level), resonance, sampleRate);
    const gain = vel * 0.32;
    let noiseState = this.noiseState;

    for (let i = 0; i < samples; i += 1) {
      const a = oscByShape(this.oscA, incA, wave, widthA);
      const b = oscByShape(this.oscB, incB, wave, widthB);
      const sub = oscSine(this.subOsc, incSub);
      let raw = a * oscMix + b * oscMix + sub * subMix;
      if (noiseMix > 0) {
        noiseState ^= noiseState << 13;
        noiseState ^= noiseState >>> 17;
        noiseState ^= noiseState << 5;
        raw += ((noiseState >>> 0) / 2147483648 - 1) * noiseMix;
      }

      const level = this.ampEnv.tick();
      const filtered = this.filter.process(raw);
      const out = fastTanh(filtered * 1.25) * level * gain;

      left[offset + i] += out * panL;
      right[offset + i] += out * panR;

      inc += incStep;
      incA += incDetuneUp;
      incB += incDetuneDown;
      incSub += incStep * 0.5;
      phase += vibRate * dt;
    }
    this.noiseState = noiseState;

    this.smoothBend = endBend;
    this.vibratoPhase = vibPhaseStart + vibRate * samples * dt;
    if (this.vibratoPhase >= 1) this.vibratoPhase -= Math.floor(this.vibratoPhase);
    return this.ampEnv.active;
  }
}
