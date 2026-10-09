import { clamp } from '../core/math';

export interface TiltState {
  /** Inclinación en grados alrededor del eje largo (beta). */
  tilt: number;
  /** Velocidad angular aproximada en grados por segundo. */
  speed: number;
  available: boolean;
}

export interface MotionOptions {
  onChange: (state: TiltState) => void;
  enabled: () => boolean;
  depth: () => number;
}

/**
 * Sensor de inclinación: al balancear el teléfono como si fuera el mástil de
 * una guitarra, ese movimiento se convierte en vibrato. En iOS hace falta
 * pedir permiso explícito y exigir un toque previo.
 */
export class MotionInput {
  private readonly state: TiltState = { tilt: 0, speed: 0, available: false };
  private last: { gamma: number; beta: number; time: number } | null = null;
  private listening = false;
  private options: MotionOptions;

  constructor(options: MotionOptions) {
    this.options = options;
  }

  setOptions(options: MotionOptions): void {
    this.options = options;
  }

  get current(): TiltState {
    return this.state;
  }

  static get needsPermission(): boolean {
    return typeof DeviceOrientationEvent !== 'undefined' && typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function';
  }

  async requestPermission(): Promise<boolean> {
    const D = (typeof DeviceOrientationEvent === 'undefined' ? undefined : DeviceOrientationEvent) as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (!D?.requestPermission) return true;
    try {
      const result = await D.requestPermission();
      return result === 'granted';
    } catch {
      return false;
    }
  }

  start(): void {
    if (this.listening || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    this.listening = true;
    window.addEventListener('deviceorientation', this.handleOrientation);
  }

  stop(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener('deviceorientation', this.handleOrientation);
    this.state.tilt = 0;
    this.state.speed = 0;
    this.state.available = false;
  }

  private handleOrientation = (event: DeviceOrientationEvent): void => {
    if (event.beta === null && event.gamma === null) return;
    const gamma = event.gamma ?? 0;
    const beta = event.beta ?? 0;
    const now = performance.now();
    this.state.available = true;
    if (this.last) {
      const dt = Math.max(1, now - this.last.time) / 1000;
      const delta = gamma - this.last.gamma;
      this.state.speed = clamp(delta / dt, -360, 360);
    }
    this.last = { gamma, beta, time: now };
    // En horizontal el eje que interesa es gamma (inclinación izquierda/derecha).
    this.state.tilt = clamp(gamma, -45, 45);
    if (this.options.enabled()) this.options.onChange(this.state);
  };
}

/** Desbloquea la pantalla para que no se apague mientras se toca. */
export class WakeLock {
  private sentinel: { release: () => Promise<void> } | null = null;

  async acquire(): Promise<void> {
    if (this.sentinel || typeof navigator === 'undefined') return;
    const api = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (!api) return;
    try {
      this.sentinel = await api.request('screen');
    } catch {
      this.sentinel = null;
    }
  }

  release(): void {
    void this.sentinel?.release();
    this.sentinel = null;
  }
}

/** Fija el teléfono en horizontal mientras se toca, como un mástil. */
export async function lockOrientation(): Promise<boolean> {
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: string) => Promise<void> };
    if (typeof orientation?.lock === 'function') {
      await orientation.lock('landscape');
      return true;
    }
  } catch {
    /* el navegador no lo permite sin pantalla completa */
  }
  return false;
}
