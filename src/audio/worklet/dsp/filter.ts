/**
 * Filtro paso-bajo/topabajo resonante (SVF topología de transformación
 * directa de impedancia) con saturación en el lazo: suena analógico y no
 * puede entrar en realimentación positiva aunque se abra al máximo.
 *
 * Los coeficientes se calculan a ritmo de control (`setCoefficients`) y el
 * bucle de audio sólo hace `process`, que son cuatro multiplicaciones.
 */
export class StateVariableFilter {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private cutoffHz = 1000;

  setCoefficients(cutoff: number, resonance: number, sampleRate: number): void {
    const nyquist = sampleRate * 0.45;
    const clamped = Math.min(Math.max(cutoff, 20), nyquist);
    this.cutoffHz = clamped;
    const g = Math.tan((Math.PI * clamped) / sampleRate);
    const k = 1 - Math.min(Math.max(resonance, 0), 0.985);
    const denom = 1 + g * (g + k);
    this.a1 = 1 / denom;
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }

  process(input: number): number {
    const v3 = input - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return v2;
  }

  /** Atajo para quien no separa control y audio. */
  processWith(input: number, cutoff: number, resonance: number, sampleRate: number): number {
    this.setCoefficients(cutoff, resonance, sampleRate);
    return this.process(input);
  }

  reset(): void {
    this.ic1 = 0;
    this.ic2 = 0;
    this.cutoffHz = 1000;
  }

  get cutoff(): number {
    return this.cutoffHz;
  }
}

/** Filtro paso-bajo de un polo, usado para el tono del eco y la sala. */
export class OnePoleLowpass {
  private z = 0;
  private a = 0.5;

  setCoefficients(cutoff: number, sampleRate: number): void {
    this.a = Math.exp((-2 * Math.PI * Math.max(cutoff, 20)) / sampleRate);
  }

  process(input: number): number {
    this.z = input * (1 - this.a) + this.z * this.a;
    return this.z;
  }

  processWith(input: number, cutoff: number, sampleRate: number): number {
    this.setCoefficients(cutoff, sampleRate);
    return this.process(input);
  }

  reset(): void {
    this.z = 0;
  }
}

/** Paso todo de primer orden: la base del barrido de fase. */
export class AllPass {
  private z = 0;
  private coefficient = 0.5;

  process(input: number, cutoff: number, sampleRate: number): number {
    const g = Math.tan((Math.PI * Math.min(Math.max(cutoff, 20), sampleRate * 0.45)) / sampleRate);
    this.coefficient = (1 - g) / (1 + g);
    const y = this.coefficient * input + this.z;
    this.z = input - this.coefficient * y;
    return y;
  }

  reset(): void {
    this.z = 0;
  }
}
