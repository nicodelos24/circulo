import { OnePoleLowpass } from './filter';

/** Lectura con interpolación lineal dentro de una línea de retardo circular. */
export function readInterpolated(buffer: Float32Array, position: number, size: number): number {
  const wrapped = ((position % size) + size) % size;
  const i0 = Math.floor(wrapped);
  const frac = wrapped - i0;
  const a = buffer[(i0 - 1 + size) % size];
  const b = buffer[i0];
  return a + (b - a) * frac;
}

/** Eco en peine con realimentación cruzada y filtro de tono en la repetitions. */
export class PingPongDelay {
  private bufferL = new Float32Array(0);
  private bufferR = new Float32Array(0);
  private indexL = 0;
  private indexR = 0;
  private readonly toneL = new OnePoleLowpass();
  private readonly toneR = new OnePoleLowpass();
  private size = 0;

  private ensure(sampleRate: number, seconds: number): void {
    const wanted = Math.max(128, Math.ceil(sampleRate * seconds));
    if (wanted !== this.size) {
      this.bufferL = new Float32Array(wanted);
      this.bufferR = new Float32Array(wanted);
      this.indexL = 0;
      this.indexR = Math.floor(wanted / 2);
      this.size = wanted;
    }
  }

  process(
    left: Float32Array,
    right: Float32Array,
    samples: number,
    time: number,
    feedback: number,
    tone: number,
    mix: number,
    sampleRate: number,
  ): void {
    if (mix <= 0.001) return;
    this.ensure(sampleRate, time + 0.05);
    const bufL = this.bufferL;
    const bufR = this.bufferR;
    const size = this.size;
    const delaySamples = Math.min(size - 2, Math.max(1, time * sampleRate));
    const toneHz = 400 + tone * tone * 14000;
    for (let i = 0; i < samples; i += 1) {
      const wetL = this.toneL.processWith(readInterpolated(bufL, this.indexL - delaySamples, size), toneHz, sampleRate);
      const wetR = this.toneR.processWith(readInterpolated(bufR, this.indexR - delaySamples, size), toneHz, sampleRate);
      bufL[this.indexL] = left[i] + wetR * feedback;
      bufR[this.indexR] = right[i] + wetL * feedback;
      left[i] += wetL * mix;
      right[i] += wetR * mix;
      this.indexL = (this.indexL + 1) % size;
      this.indexR = (this.indexR + 1) % size;
    }
  }

  reset(): void {
    this.bufferL.fill(0);
    this.bufferR.fill(0);
    this.toneL.reset();
    this.toneR.reset();
  }
}
