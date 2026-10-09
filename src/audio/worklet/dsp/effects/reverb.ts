import { OnePoleLowpass } from '../filter';
import type { EffectModule } from './modulators';

/**
 * Reverberación por banco de filtros comb en peine con realimentación
 * amortiguada y dos AllPass finales. El tamaño controla el retardo de cada
 * peine, así que un valor bajo da salas pequeñas y uno alto da catedral.
 */
interface Comb {
  buffer: Float32Array;
  index: number;
  damping: OnePoleLowpass;
  feedback: number;
}

const COMB_LENGTHS = [1116, 1188, 1277, 1356, 1422, 1491];

const ALLPASS_LENGTHS = [556, 441, 341, 225];

class CombFilter {
  readonly state: Comb;
  private readonly sampleRate: number;

  constructor(length: number, sampleRate: number) {
    this.sampleRate = sampleRate;
    this.state = {
      buffer: new Float32Array(length),
      index: 0,
      damping: new OnePoleLowpass(),
      feedback: 0.78,
    };
  }

  process(input: number, feedback: number, dampHz: number): number {
    const { buffer, index, damping } = this.state;
    const output = buffer[index];
    const filtered = damping.processWith(output, dampHz, this.sampleRate);
    buffer[index] = input + filtered * feedback;
    this.state.index = (index + 1) % buffer.length;
    return output;
  }

  reset(): void {
    this.state.buffer.fill(0);
    this.state.damping.reset();
    this.state.index = 0;
  }
}

class AllPassFilter {
  private buffer: Float32Array;
  private index = 0;
  private readonly sampleRate: number;

  constructor(length: number, sampleRate: number) {
    this.buffer = new Float32Array(length);
    this.sampleRate = sampleRate;
  }

  process(input: number, feedback: number): number {
    const buffered = this.buffer[this.index];
    const output = -input + buffered;
    this.buffer[this.index] = input + buffered * feedback;
    this.index = (this.index + 1) % this.buffer.length;
    void this.sampleRate;
    return output;
  }

  reset(): void {
    this.buffer.fill(0);
    this.index = 0;
  }
}

export class ReverbEffect implements EffectModule {
  readonly id = 'reverb';
  private size = 0.5;
  private tone = 0.55;
  private damp = 0.45;
  private mix = 0.28;
  private enabled = true;
  private combsL: CombFilter[] = [];
  private combsR: CombFilter[] = [];
  private allpassL: AllPassFilter[] = [];
  private allpassR: AllPassFilter[] = [];
  private sampleRate = 48000;
  private builtSize = -1;

  setParam(id: string, value: number): void {
    if (id === 'size') this.size = value;
    else if (id === 'tone') this.tone = value;
    else if (id === 'damp') this.damp = value;
    else if (id === 'mix') this.mix = value;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private build(sampleRate: number): void {
    this.sampleRate = sampleRate;
    this.builtSize = this.size;
    const stretch = 0.6 + this.size * 1.4;
    const tune = sampleRate / 44100;
    this.combsL = COMB_LENGTHS.map((length) => new CombFilter(Math.max(16, Math.round(length * tune * stretch)), sampleRate));
    this.combsR = COMB_LENGTHS.map((length) => new CombFilter(Math.max(16, Math.round((length + 23) * tune * stretch)), sampleRate));
    this.allpassL = ALLPASS_LENGTHS.map((length) => new AllPassFilter(Math.max(16, Math.round(length * tune)), sampleRate));
    this.allpassR = ALLPASS_LENGTHS.map((length) => new AllPassFilter(Math.max(16, Math.round((length + 11) * tune)), sampleRate));
  }

  process(left: Float32Array, right: Float32Array, samples: number, sampleRate: number): void {
    if (!this.enabled || this.mix <= 0.001) return;
    if (this.combsL.length === 0 || sampleRate !== this.sampleRate || Math.abs(this.size - this.builtSize) > 0.04) {
      this.build(sampleRate);
    }
    const feedback = 0.72 + this.size * 0.24;
    const dampHz = 1400 + (1 - this.damp) * 12000 + this.tone * 4000;
    for (let i = 0; i < samples; i += 1) {
      const inputL = left[i];
      const inputR = right[i];
      let accL = 0;
      let accR = 0;
      for (let c = 0; c < this.combsL.length; c += 1) {
        accL += this.combsL[c].process(inputL, feedback, dampHz);
        accR += this.combsR[c].process(inputR, feedback, dampHz);
      }
      for (let a = 0; a < this.allpassL.length; a += 1) {
        accL = this.allpassL[a].process(accL, 0.5);
        accR = this.allpassR[a].process(accR, 0.5);
      }
      const wetL = accL * 0.16;
      const wetR = accR * 0.16;
      left[i] = inputL + wetL * this.mix;
      right[i] = inputR + wetR * this.mix;
    }
  }

  reset(): void {
    for (const comb of [...this.combsL, ...this.combsR]) comb.reset();
    for (const ap of [...this.allpassL, ...this.allpassR]) ap.reset();
  }
}
