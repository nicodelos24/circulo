import { fastTanh } from '../fastmath';
import type { EffectModule } from './modulators';

/** Compresor de curva suave con ataque y caída en tiempo real. */
export class CompressorEffect implements EffectModule {
  readonly id = 'compressor';
  private thresholdDb = -20;
  private ratio = 3;
  private attack = 0.008;
  private makeup = 0.7;
  private enabled = true;
  private envelope = 0;

  setParam(id: string, value: number): void {
    if (id === 'threshold') this.thresholdDb = value;
    else if (id === 'ratio') this.ratio = value;
    else if (id === 'attack') this.attack = value;
    else if (id === 'makeup') this.makeup = value;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  process(left: Float32Array, right: Float32Array, samples: number, sampleRate: number): void {
    if (!this.enabled || this.ratio <= 1.01) return;
    const threshold = Math.pow(10, this.thresholdDb / 20);
    const makeupGain = Math.pow(10, (this.makeup * 9) / 20);
    const attackCoef = Math.exp(-1 / (Math.max(0.0005, this.attack) * sampleRate));
    const releaseCoef = Math.exp(-1 / (0.18 * sampleRate));
    const slope = 1 - 1 / Math.max(1.01, this.ratio);
    let envelope = this.envelope;

    for (let i = 0; i < samples; i += 1) {
      const peak = Math.max(Math.abs(left[i]), Math.abs(right[i]));
      const coef = peak > envelope ? attackCoef : releaseCoef;
      envelope = coef * envelope + (1 - coef) * peak;
      let gain = 1;
      if (envelope > threshold && envelope > 1e-6) {
        const overDb = 20 * Math.log10(envelope / threshold);
        gain = Math.pow(10, (-overDb * slope) / 20);
      }
      left[i] *= gain * makeupGain;
      right[i] *= gain * makeupGain;
    }
    this.envelope = envelope;
  }

  reset(): void {
    this.envelope = 0;
  }
}

/** Master: volumen, saturación suave y limitador de seguridad. */
export class MasterEffect implements EffectModule {
  readonly id = 'master';
  private volume = 0.75;
  private limiter = 1;
  private enabled = true;
  private release = 0;

  setParam(id: string, value: number): void {
    if (id === 'volume') this.volume = value;
    else if (id === 'limiter') this.limiter = value;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  process(left: Float32Array, right: Float32Array, samples: number, sampleRate: number): void {
    if (!this.enabled) return;
    const gain = this.volume;
    const useLimiter = this.limiter > 0.5;
    const releaseCoef = Math.exp(-1 / (0.12 * sampleRate));
    let release = this.release;
    for (let i = 0; i < samples; i += 1) {
      let l = fastTanh(left[i] * gain * 1.1);
      let r = fastTanh(right[i] * gain * 1.1);
      if (useLimiter) {
        const peak = Math.max(Math.abs(l), Math.abs(r));
        release = release > peak ? release * releaseCoef : peak;
        const ceiling = 0.97;
        if (release > ceiling) {
          const scale = ceiling / release;
          l *= scale;
          r *= scale;
        }
      }
      left[i] = l;
      right[i] = r;
    }
    this.release = release;
  }

  reset(): void {
    this.release = 0;
  }
}
