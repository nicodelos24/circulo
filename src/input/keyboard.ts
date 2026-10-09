export interface KeyboardOptions {
  onPress: (midi: number, velocity: number) => void;
  onRelease: (midi: number) => void;
  onOctave: (delta: number) => void;
  onSustain: (active: boolean) => void;
  onCommand: (command: string) => void;
}

/** Teclado de computadora: dos octavas a la vez, como un tracker. */
const NOTE_KEYS: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6,
  KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13,
  KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};

const VELOCITIES = [0.5, 0.65, 0.8, 0.95];

/** Teclas 1-4 eligen la octava extra del teclado (columna de 12 semitonos). */
const COLUMN_KEYS: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
};

export class KeyboardInput {
  /** Tecla pulsada -> nota que se tocó (para poder soltarla bien). */
  private readonly held = new Map<string, number>();
  private column = 0;
  private options: KeyboardOptions;

  constructor(options: KeyboardOptions) {
    this.options = options;
  }

  attach(target: Window | HTMLElement = window): () => void {
    const down = (event: Event) => this.handleDown(event as KeyboardEvent);
    const up = (event: Event) => this.handleUp(event as KeyboardEvent);
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    return () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
    };
  }

  setOptions(options: KeyboardOptions): void {
    this.options = options;
  }

  private handleDown(event: KeyboardEvent): void {
    if (event.repeat || event.metaKey || event.ctrlKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    if (event.code === 'ArrowUp' || event.code === 'KeyX') {
      this.options.onOctave(1);
      return;
    }
    if (event.code === 'ArrowDown' || event.code === 'KeyZ') {
      this.options.onOctave(-1);
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      this.options.onSustain(true);
      return;
    }
    if (event.code === 'Tab') {
      event.preventDefault();
      this.options.onCommand('rack');
      return;
    }
    if (event.code === 'KeyR') {
      this.options.onCommand('settings');
      return;
    }
    if (event.code === 'Escape') {
      this.options.onCommand('escape');
      return;
    }

    const column = COLUMN_KEYS[event.code];
    if (column !== undefined) {
      this.column = column;
      return;
    }

    const semitone = NOTE_KEYS[event.code];
    if (semitone === undefined || this.held.has(event.code)) return;
    const midi = semitone + this.column * 12;
    this.held.set(event.code, midi);
    const velocity = VELOCITIES[event.shiftKey ? 3 : 1];
    this.options.onPress(midi, velocity);
  }

  private handleUp(event: KeyboardEvent): void {
    if (event.code === 'Space') {
      this.options.onSustain(false);
      return;
    }
    const midi = this.held.get(event.code);
    if (midi === undefined) return;
    this.held.delete(event.code);
    this.options.onRelease(midi);
  }
}
