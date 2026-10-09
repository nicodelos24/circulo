import type { FromWorklet, ToWorklet } from '../protocol';
import { SynthEngine } from './synth';

declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;

declare abstract class AudioWorkletProcessorBase {
  readonly port: MessagePort;
  constructor(options?: unknown);
  abstract process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}
declare const AudioWorkletProcessor: typeof AudioWorkletProcessorBase;

/**
 * Punto de entrada del AudioWorklet. Recibe notas por message port y entrega
 * el nivel medido unas 25 veces por segundo para el visualizador.
 * El bloque condicional evita referenciar AudioWorkletProcessor fuera del
 * navegador (por ejemplo en las pruebas unitarias de Node).
 */
if (typeof AudioWorkletProcessor !== 'undefined' && typeof registerProcessor === 'function') {
  class CirculoProcessor extends AudioWorkletProcessor {
    private readonly engine = new SynthEngine();
    private readonly pending: ToWorklet[] = [];
    private framesSinceMeter = 0;

    constructor() {
      super();
      this.port.onmessage = (event: MessageEvent) => {
        this.pending.push(event.data as ToWorklet);
      };
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
      const output = outputs[0];
      if (!output || output.length === 0) return true;
      const left = output[0];
      const right = output.length > 1 ? output[1] : output[0];
      const samples = left.length;

      while (this.pending.length > 0) {
        const message = this.pending.shift();
        if (message) this.engine.handle(message);
      }

      this.engine.render(left, right, samples, sampleRate);

      this.framesSinceMeter += 1;
      if (this.framesSinceMeter >= 16) {
        this.framesSinceMeter = 0;
        this.port.postMessage(this.engine.meterReport() as FromWorklet);
      }
      return true;
    }
  }

  registerProcessor('circulo-synth', CirculoProcessor);
}

export { SynthEngine };
