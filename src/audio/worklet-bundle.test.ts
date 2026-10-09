import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ToWorklet } from './protocol';
import { buildWorklet } from '../../scripts/build-worklet.mjs';

const WORKLET = resolve(process.cwd(), 'public/worklet/synth-processor.js');

interface ProcessorStub {
  port: {
    onmessage: ((event: { data: ToWorklet }) => void) | null;
    postMessage: (message: unknown) => void;
  };
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

let Processor: (new () => ProcessorStub) | null = null;
let posted: unknown[] = [];

/**
 * Prueba del artefacto real: se ejecuta el archivo que se sirve al navegador
 * (public/worklet/synth-processor.js) dentro de un scope de AudioWorklet
 * simulado. Si el empaquetado se rompe, falla aqui y no en el telefono.
 */
describe('worklet empaquetado', () => {
  beforeAll(async () => {
    if (!existsSync(WORKLET)) await buildWorklet();
    const source = await readFile(WORKLET, 'utf8');
    class FakeAudioWorkletProcessor {
      port = {
        onmessage: null as ((event: { data: ToWorklet }) => void) | null,
        postMessage: (message: unknown) => {
          posted.push(message);
        },
      };
      process(): boolean {
        return true;
      }
    }
    const context = vm.createContext({
      AudioWorkletProcessor: FakeAudioWorkletProcessor,
      sampleRate: 48000,
      registerProcessor: (_name: string, ctor: unknown) => {
        Processor = ctor as new () => ProcessorStub;
      },
      Float32Array,
      Math,
      console,
    });
    vm.runInContext(source, context);
  });

  const create = (messages: ToWorklet[]): ProcessorStub => {
    posted = [];
    const processor = new Processor!();
    for (const message of messages) processor.port.onmessage!({ data: message });
    return processor;
  };

  const peakOf = (processor: ProcessorStub, blocks: number, mono = false): number => {
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    let peak = 0;
    for (let block = 0; block < blocks; block += 1) {
      processor.process([], mono ? [[left]] : [[left, right]]);
      for (let i = 0; i < 128; i += 1) peak = Math.max(peak, Math.abs(left[i]));
    }
    return peak;
  };

  it('se registra como processor de audio', () => {
    expect(Processor).toBeTypeOf('function');
  });

  it('suena una nota y manda el nivel al hilo principal', () => {
    const processor = create([{ type: 'noteOn', id: 1, midi: 60, velocity: 0.9, pan: 0 }]);
    // 16 bloques: el processor manda el nivel al hilo principal cada 16.
    expect(peakOf(processor, 20)).toBeGreaterThan(0.005);
    expect(posted.length).toBeGreaterThan(0);
    expect((posted[0] as { type: string }).type).toBe('meter');
  });

  it('aplica el bend que llega por el puerto', () => {
    const processor = create([
      { type: 'noteOn', id: 7, midi: 48, velocity: 1, pan: 0 },
      { type: 'patch', id: 7, patch: { bend: 2, vibratoDepth: 0, vibratoRate: 5, pan: 0, pressure: 1 } },
    ]);
    expect(peakOf(processor, 10)).toBeGreaterThan(0.01);
  });

  it('allOff corta las voces al instante', () => {
    const processor = create([{ type: 'noteOn', id: 3, midi: 60, velocity: 1, pan: 0 }]);
    for (const id of ['drive', 'chorus', 'phaser', 'tremolo', 'delay', 'reverb', 'compressor'] as const) {
      processor.port.onmessage!({ data: { type: 'enable', module: id, enabled: false } });
    }
    peakOf(processor, 12);
    processor.port.onmessage!({ data: { type: 'allOff' } });
    expect(peakOf(processor, 12)).toBe(0);
  });

  it('funciona tambien con un unico canal de salida', () => {
    const processor = create([{ type: 'noteOn', id: 5, midi: 64, velocity: 0.7, pan: 0 }]);
    expect(peakOf(processor, 8, true)).toBeGreaterThan(0.005);
  });
});
