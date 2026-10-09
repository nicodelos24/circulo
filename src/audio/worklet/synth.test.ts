import { describe, expect, it } from 'vitest';
import { DEFAULT_VOICE_PARAMS, midiToFreq } from './dsp/voice';
import { SynthEngine } from './synth';
import type { ToWorklet } from '../protocol';
import type { ModuleId } from '../patch';

const SR = 48000;
const BLOCK = 128;

function renderBlocks(engine: SynthEngine, blocks: number): { left: Float32Array; right: Float32Array } {
  const left = new Float32Array(BLOCK * blocks);
  const right = new Float32Array(BLOCK * blocks);
  for (let i = 0; i < blocks; i += 1) {
    const chunkL = left.subarray(i * BLOCK, (i + 1) * BLOCK);
    const chunkR = right.subarray(i * BLOCK, (i + 1) * BLOCK);
    engine.render(chunkL, chunkR, BLOCK, SR);
  }
  return { left, right };
}

function peak(buffer: Float32Array): number {
  let max = 0;
  for (const sample of buffer) max = Math.max(max, Math.abs(sample));
  return max;
}

/**
 * Estimación de altura por autocorrelación normalizada: aguanta el ruido y
 * los armónicos, a diferencia de contar cruces de cero.
 */
function estimateFreq(buffer: Float32Array, sampleRate = SR): number {
  const window = Math.min(4096, buffer.length);
  const offset = Math.max(0, Math.floor((buffer.length - window) / 2));
  const segment = buffer.subarray(offset, offset + window);
  let energy = 0;
  for (let i = 0; i < window; i += 1) energy += segment[i] * segment[i];
  if (energy <= 1e-9) return 0;

  const minLag = Math.max(2, Math.floor(sampleRate / 2000));
  const maxLag = Math.min(window - 2, Math.floor(sampleRate / 40));
  let bestLag = minLag;
  let bestScore = -1;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = 0; i < window - lag; i += 1) sum += segment[i] * segment[i + lag];
    const score = sum / (window - lag);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  return sampleRate / bestLag;
}

/** Motor limpio: los efectos se activan a mano en los tests que los necesitan. */
function engine(): SynthEngine {
  const instance = new SynthEngine();
  for (const id of FX) instance.setEffectEnabled(id, false);
  return instance;
}

const FX: ModuleId[] = ['drive', 'chorus', 'phaser', 'tremolo', 'delay', 'reverb', 'compressor'];

describe('SynthEngine', () => {
  it('suena una nota y respeta el volumen maestro', () => {
    const synth = engine();
    synth.handle({ type: 'noteOn', id: 1, midi: 69, velocity: 1, pan: 0 });
    const { left } = renderBlocks(synth, 40);
    expect(peak(left)).toBeGreaterThan(0.05);
    expect(Number.isFinite(peak(left))).toBe(true);
    expect(synth.activeVoices).toBe(1);
  });

  it('una octava arriba suena una octava más aguda', () => {
    const measure = (midi: number): number => {
      const synth = engine();
      synth.handle({ type: 'noteOn', id: 1, midi, velocity: 1, pan: 0 });
      return estimateFreq(renderBlocks(synth, 40).left);
    };
    const low = measure(45);
    const high = measure(57);
    expect(high / low).toBeGreaterThan(1.7);
    expect(high / low).toBeLessThan(2.3);
    expect(midiToFreq(57) / midiToFreq(45)).toBeCloseTo(2, 5);
  });

  it('el bend sube la altura de la nota sostenida', () => {
    const synth = engine();
    synth.handle({ type: 'noteOn', id: 1, midi: 57, velocity: 1, pan: 0 });
    renderBlocks(synth, 60);
    synth.handle({
      type: 'patch',
      id: 1,
      patch: { bend: 2, vibratoDepth: 0, vibratoRate: 5, pan: 0, pressure: 1 },
    });
    const bent = renderBlocks(synth, 60);
    synth.handle({ type: 'patch', id: 1, patch: { bend: -1, vibratoDepth: 0, vibratoRate: 5, pan: 0, pressure: 1 } });
    const flat = renderBlocks(synth, 60);
    expect(estimateFreq(bent.left)).toBeGreaterThan(estimateFreq(flat.left));
  });

  it('el vibrato hace oscilar la frecuencia de la nota', () => {
    const synth = engine();
    synth.handle({ type: 'noteOn', id: 1, midi: 60, velocity: 1, pan: 0 });
    renderBlocks(synth, 20);
    synth.handle({
      type: 'patch',
      id: 1,
      patch: { bend: 0, vibratoDepth: 1.5, vibratoRate: 8, pan: 0, pressure: 1 },
    });
    const { left } = renderBlocks(synth, 100);
    const half = Math.floor(left.length / 2);
    const first = estimateFreq(left.subarray(0, half) as Float32Array);
    const second = estimateFreq(left.subarray(half) as Float32Array);
    expect(Math.abs(first - second) / Math.max(first, second)).toBeGreaterThan(0.02);

    synth.handle({ type: 'patch', id: 1, patch: { bend: 0, vibratoDepth: 0, vibratoRate: 8, pan: 0, pressure: 1 } });
    const steady = renderBlocks(synth, 60);
    const halfSteady = Math.floor(steady.left.length / 2);
    const a = estimateFreq(steady.left.subarray(0, halfSteady) as Float32Array);
    const b = estimateFreq(steady.left.subarray(halfSteady) as Float32Array);
    expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThan(0.01);
  });

  it('libera la voz tras noteOff y la recicla', () => {
    const synth = engine();
    synth.handle({ type: 'noteOn', id: 1, midi: 60, velocity: 1, pan: 0 });
    synth.handle({ type: 'param', module: 'voice', id: 'release', value: 0.05 });
    synth.handle({ type: 'noteOff', id: 1 });
    renderBlocks(synth, 200);
    expect(synth.activeVoices).toBe(0);
  });

  it('no rompe con más notas que voces (robo de voz)', () => {
    const synth = engine();
    for (let i = 0; i < 24; i += 1) {
      synth.handle({ type: 'noteOn', id: i + 1, midi: 48 + i, velocity: 0.8, pan: 0 });
    }
    const { left } = renderBlocks(synth, 40);
    expect(synth.activeVoices).toBeLessThanOrEqual(16);
    expect(Number.isFinite(peak(left))).toBe(true);
    expect(peak(left)).toBeLessThan(1.01);
  });

  it('toda la cadena de efectos deja la señal finita y sin clipees duros', () => {
    const synth = engine();
    for (const id of FX) synth.setEffectEnabled(id, true);
    synth.handle({ type: 'param', module: 'reverb', id: 'mix', value: 1 });
    synth.handle({ type: 'param', module: 'delay', id: 'mix', value: 1 });
    synth.handle({ type: 'param', module: 'chorus', id: 'mix', value: 1 });
    synth.handle({ type: 'noteOn', id: 1, midi: 45, velocity: 1, pan: 0 });
    const { left, right } = renderBlocks(synth, 120);
    let invalid = 0;
    let hottest = 0;
    for (let i = 0; i < left.length; i += 1) {
      if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) invalid += 1;
      hottest = Math.max(hottest, Math.abs(left[i]), Math.abs(right[i]));
    }
    expect(invalid).toBe(0);
    expect(hottest).toBeLessThanOrEqual(1.01);
  });

  it('desactivar un módulo deja la señal más limpia', () => {
    const a = engine();
    a.setEffectEnabled('reverb', true);
    a.handle({ type: 'param', module: 'reverb', id: 'mix', value: 1 });
    a.handle({ type: 'noteOn', id: 1, midi: 52, velocity: 1, pan: 0 });
    const wet = peak(renderBlocks(a, 120).left);

    const b = engine();
    b.setEffectEnabled('reverb', false);
    b.handle({ type: 'noteOn', id: 1, midi: 52, velocity: 1, pan: 0 });
    const dry = peak(renderBlocks(b, 120).left);
    expect(wet).toBeGreaterThan(dry);
  });

  it('el medidor refleja la energía de la señal', () => {
    const synth = engine();
    synth.handle({ type: 'noteOn', id: 1, midi: 69, velocity: 1, pan: 0 });
    renderBlocks(synth, 30);
    const report = synth.meterReport();
    expect(report.peak).toBeGreaterThan(0.02);
    expect(report.voices).toBe(1);
  });

  it('es determinista con los mismos mensajes', () => {
    const messages: ToWorklet[] = [
      { type: 'noteOn', id: 1, midi: 61, velocity: 0.9, pan: -0.3 },
      { type: 'param', module: 'delay', id: 'time', value: 0.25 },
    ];
    const runOnce = () => {
      const synth = engine();
      for (const message of messages) synth.handle(message);
      return renderBlocks(synth, 30).left;
    };
    const first = runOnce();
    const second = runOnce();
    expect(Array.from(first)).toEqual(Array.from(second));
  });
});

describe('parámetros por defecto', () => {
  it('mantiene valores dentro de rango utilizable', () => {
    expect(DEFAULT_VOICE_PARAMS.cutoff).toBeLessThan(20000);
    expect(DEFAULT_VOICE_PARAMS.attack).toBeLessThan(DEFAULT_VOICE_PARAMS.decay);
  });
});
