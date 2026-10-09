export type EnvStage = 'idle' | 'attack' | 'decay' | 'sustain' | 'release';

const CURVE = 6.9; // queda ~0.1% del nivel al terminar el tiempo configurado

/**
 * Envolvente ADSR con coeficientes precalculados por bloque: el ataque es
 * lineal y la caída exponencial, así que un tick por muestra es sólo
 * multiplicar y sumar (nada de exp en el bucle de audio).
 */
export class Envelope {
  stage: EnvStage = 'idle';
  level = 0;

  private attackStep = 0;
  private decayCoeff = 0;
  private releaseCoeff = 0;
  private sustain = 0.7;

  configure(attack: number, decay: number, sustain: number, release: number): void {
    const a = Math.max(0.0008, attack);
    const d = Math.max(0.01, decay);
    const r = Math.max(0.01, release);
    this.attackStep = 1 / (a * 48000);
    this.decayCoeff = Math.exp(-CURVE / (d * 48000));
    this.releaseCoeff = Math.exp(-CURVE / (r * 48000));
    this.sustain = sustain;
  }

  /** Recalcula los coeficientes con la frecuencia de muestreo real. */
  prepare(sampleRate: number, attack: number, decay: number, sustain: number, release: number): void {
    const a = Math.max(0.0008, attack);
    const d = Math.max(0.01, decay);
    const r = Math.max(0.01, release);
    this.attackStep = 1 / (a * sampleRate);
    this.decayCoeff = Math.exp(-CURVE / (d * sampleRate));
    this.releaseCoeff = Math.exp(-CURVE / (r * sampleRate));
    this.sustain = sustain;
  }

  trigger(): void {
    this.stage = 'attack';
    this.level = 0;
  }

  enterRelease(): void {
    if (this.stage !== 'idle') this.stage = 'release';
  }

  kill(): void {
    this.stage = 'idle';
    this.level = 0;
  }

  get active(): boolean {
    return this.stage !== 'idle';
  }

  /** Avanza una muestra y devuelve el nivel resultante. */
  tick(): number {
    switch (this.stage) {
      case 'attack': {
        this.level += this.attackStep;
        if (this.level >= 1) {
          this.level = 1;
          this.stage = 'decay';
        }
        break;
      }
      case 'decay': {
        this.level = this.sustain + (this.level - this.sustain) * this.decayCoeff;
        if (this.level <= this.sustain + 1e-4) {
          this.level = this.sustain;
          this.stage = 'sustain';
        }
        break;
      }
      case 'sustain':
        break;
      case 'release': {
        this.level *= this.releaseCoeff;
        if (this.level < 1e-4) {
          this.level = 0;
          this.stage = 'idle';
        }
        break;
      }
      default:
        this.level = 0;
        break;
    }
    return this.level;
  }
}
