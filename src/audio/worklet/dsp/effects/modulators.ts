import { AllPass, OnePoleLowpass } from '../filter';
import { readInterpolated } from '../delayline';
import { fastSin, fastTanh } from '../fastmath';

export type ParamMap = Record<string, number>;

export { readInterpolated } from '../delayline';

export interface EffectModule {
  readonly id: string;
  setParam(id: string, value: number): void;
  setEnabled(enabled: boolean): void;
  process(left: Float32Array, right: Float32Array, samples: number, sampleRate: number): void;
  reset(): void;
}

/** Saturación con control de tono: aporta armónicos y cuerpo al ataque. */
export class DriveEffect implements EffectModule {
  readonly id = 'drive';
  private drive = 0.32;
  private tone = 0.55;
  private mix = 0.6;
  private enabled = true;
  private readonly preL = new OnePoleLowpass();
  private readonly preR = new OnePoleLowpass();
  private readonly postL = new OnePoleLowpass();
  private readonly postR = new OnePoleLowpass();

  setParam(id: string, value: number): void {
    if (id === 'drive') this.drive = value;
    else if (id === 'tone') this.tone = value;
    else if (id === 'mix') this.mix = value;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  process(left: Float32Array, right: Float32Array, samples: number, sampleRate: number): void {
    if (!this.enabled || this.drive <= 0.001) return;
    const gain = 1 + this.drive * this.drive * 22;
    const wet = this.mix;
    const preHz = 300 + this.tone * 6000;
    const postHz = 900 + this.tone * this.tone * 15000;
    for (let i = 0; i < samples; i += 1) {
      const dryL = this.preL.processWith(left[i], preHz, sampleRate);
      const dryR = this.preR.processWith(right[i], preHz, sampleRate);
      const wetL = this.postL.processWith(fastTanh(dryL * gain) * 0.85, postHz, sampleRate);
      const wetR = this.postR.processWith(fastTanh(dryR * gain) * 0.85, postHz, sampleRate);
      left[i] = dryL + (wetL - dryL) * wet;
      right[i] = dryR + (wetR - dryR) * wet;
    }
  }

  reset(): void {
    this.preL.reset();
    this.preR.reset();
    this.postL.reset();
    this.postR.reset();
  }
}

/** Coro: dos líneas de retardo moduladas en fases opuestas (seudo estéreo). */
export class ChorusEffect implements EffectModule {
  readonly id = 'chorus';
  private rate = 0.6;
  private depth = 0.45;
  private mix = 0.5;
  private spread = 0.7;
  private enabled = true;
  private phaseL = 0;
  private phaseR = 0.25;
  private bufferL = new Float32Array(0);
  private bufferR = new Float32Array(0);
  private index = 0;
  private size = 0;

  setParam(id: string, value: number): void {
    if (id === 'rate') this.rate = value;
    else if (id === 'depth') this.depth = value;
    else if (id === 'mix') this.mix = value;
    else if (id === 'spread') this.spread = value;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private ensure(sampleRate: number): void {
    const wanted = Math.max(1024, Math.ceil(sampleRate * 0.06));
    if (wanted !== this.size) {
      this.bufferL = new Float32Array(wanted);
      this.bufferR = new Float32Array(wanted);
      this.size = wanted;
      this.index = 0;
    }
  }

  process(left: Float32Array, right: Float32Array, samples: number, sampleRate: number): void {
    if (!this.enabled || this.mix <= 0.001) return;
    this.ensure(sampleRate);
    const bufL = this.bufferL;
    const bufR = this.bufferR;
    const baseDelay = sampleRate * 0.012;
    const modRange = sampleRate * 0.006 * this.depth;
    const dt = 1 / sampleRate;
    const stereoSpread = this.spread;

    for (let i = 0; i < samples; i += 1) {
      this.phaseL += this.rate * dt;
      this.phaseR += this.rate * (1 + stereoSpread * 0.15) * dt;
      if (this.phaseL >= 1) this.phaseL -= 1;
      if (this.phaseR >= 1) this.phaseR -= 1;

      const dL = baseDelay + fastSin(this.phaseL) * modRange;
      const dR = baseDelay + fastSin(this.phaseR) * modRange * (0.5 + stereoSpread);
      const readL = (this.index - dL + this.size) % this.size;
      const readR = (this.index - dR + this.size) % this.size;

      bufL[this.index] = left[i];
      bufR[this.index] = right[i];
      left[i] += readInterpolated(bufL, readL, this.size) * this.mix;
      right[i] += readInterpolated(bufR, readR, this.size) * this.mix;
      this.index = (this.index + 1) % this.size;
    }
  }

  reset(): void {
    this.bufferL.fill(0);
    this.bufferR.fill(0);
    this.index = 0;
  }
}

/** Barrido de fase tipo jet: etapas de paso todo con realimentación. */
export class PhaserEffect implements EffectModule {
  readonly id = 'phaser';
  private rate = 0.35;
  private depth = 0.7;
  private feedback = 0.45;
  private mix = 0.5;
  private stages = 4;
  private enabled = true;
  private phase = 0;
  private filters: AllPass[] = [];
  private feedbackL = 0;
  private feedbackR = 0;

  setParam(id: string, value: number): void {
    if (id === 'rate') this.rate = value;
    else if (id === 'depth') this.depth = value;
    else if (id === 'feedback') this.feedback = value;
    else if (id === 'mix') this.mix = value;
    else if (id === 'stages') {
      this.stages = Math.max(2, Math.round(value));
      this.filters = [];
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private stage(index: number): AllPass {
    while (this.filters.length <= index) this.filters.push(new AllPass());
    return this.filters[index];
  }

  process(left: Float32Array, right: Float32Array, samples: number, sampleRate: number): void {
    if (!this.enabled || this.mix <= 0.001) return;
    const stages = Math.max(2, Math.min(8, Math.round(this.stages)));
    const total = stages * 2;
    const dt = 1 / sampleRate;
    const fbk = this.feedback * 0.85;
    for (let i = 0; i < samples; i += 1) {
      this.phase += this.rate * dt;
      if (this.phase >= 1) this.phase -= 1;
      const lfo = (fastSin(this.phase) * 0.5 + 0.5) * this.depth;
      const cutoff = 260 + lfo * 6500;

      let l = left[i] + this.feedbackL * fbk;
      let r = right[i] + this.feedbackR * fbk;
      for (let s = 0; s < total; s += 1) {
        if (s < stages) l = this.stage(s).process(l, cutoff, sampleRate);
        else r = this.stage(s).process(r, cutoff, sampleRate);
      }
      this.feedbackL = l;
      this.feedbackR = r;
      left[i] += l * this.mix;
      right[i] += r * this.mix;
    }
  }

  reset(): void {
    for (const filter of this.filters) filter.reset();
    this.feedbackL = 0;
    this.feedbackR = 0;
  }
}

/** Modulación de amplitud con forma seleccionable. */
export class TremoloEffect implements EffectModule {
  readonly id = 'tremolo';
  private rate = 5.5;
  private depth = 0.5;
  private shape = 0;
  private enabled = true;
  private phase = 0;

  setParam(id: string, value: number): void {
    if (id === 'rate') this.rate = value;
    else if (id === 'depth') this.depth = value;
    else if (id === 'shape') this.shape = Math.round(value);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private modulation(): number {
    const s = (fastSin(this.phase) + 1) * 0.5;
    if (this.shape === 1) return this.phase < 0.5 ? 1 : 0;
    if (this.shape === 2) return 1 - Math.abs(this.phase * 2 - 1);
    return s;
  }

  process(left: Float32Array, right: Float32Array, samples: number, sampleRate: number): void {
    if (!this.enabled || this.depth <= 0.001) return;
    const dt = 1 / sampleRate;
    for (let i = 0; i < samples; i += 1) {
      this.phase += this.rate * dt;
      if (this.phase >= 1) this.phase -= 1;
      const gain = 1 - this.depth * (1 - this.modulation());
      left[i] *= gain;
      right[i] *= gain;
    }
  }

  reset(): void {
    /* sin estado */
  }
}
