import type { AppSettings } from '../audio/patch';

export interface ArpNote {
  midi: number;
  velocity: number;
  pan: number;
}

export interface ArpOptions {
  mode: AppSettings['arpMode'];
  rate: number;
  octaves: number;
  onNoteOn: (note: ArpNote) => void;
  onNoteOff: (note: ArpNote) => void;
  now: () => number;
}

/**
 * Arpegiador: reparte las notas pulsadas en un patrón temporal. Con
 * varias notas suena como acorde y el "chord" las dispara a la vez.
 */
export class Arpeggiator {
  private held: ArpNote[] = [];
  private index = 0;
  private direction = 1;
  private nextAt = 0;
  private current: ArpNote | null = null;
  private options: ArpOptions;

  constructor(options: ArpOptions) {
    this.options = options;
    this.nextAt = options.now();
  }

  setOptions(patch: Partial<ArpOptions>): void {
    this.options = { ...this.options, ...patch };
  }

  press(note: ArpNote): void {
    if (this.held.some((held) => held.midi === note.midi)) return;
    const isFirst = this.held.length === 0;
    this.held.push(note);
    this.held.sort((a, b) => a.midi - b.midi);
    // Sólo la primera nota dispara el arpegio: las siguientes se suman al
    // patrón y toman el turno en el siguiente compás.
    if (isFirst && this.options.mode !== 'off') {
      this.fire();
      this.nextAt = this.options.now() + 1000 / Math.max(0.5, this.options.rate);
    }
  }

  release(note: ArpNote): void {
    this.held = this.held.filter((held) => held.midi !== note.midi);
    if (this.current?.midi === note.midi) this.stopCurrent();
    if (this.held.length === 0) this.reset();
  }

  releaseAll(): void {
    this.held = [];
    this.stopCurrent();
    this.reset();
  }

  private reset(): void {
    this.index = 0;
    this.direction = 1;
    this.nextAt = this.options.now();
  }

  private stopCurrent(): void {
    if (this.current) {
      this.options.onNoteOff(this.current);
      this.current = null;
    }
  }

  private fire(): void {
    const { mode } = this.options;
    if (this.held.length === 0 || mode === 'off') return;
    if (mode === 'chord') {
      this.stopCurrent();
      const chord = this.expanded();
      for (const note of chord) this.options.onNoteOn(note);
      this.current = chord[0];
      return;
    }

    const sequence = this.sequence();
    if (sequence.length === 0) return;
    if (this.index >= sequence.length) this.index = 0;
    const note = sequence[this.index];
    this.stopCurrent();
    this.options.onNoteOn(note);
    this.current = note;

    if (mode === 'up') this.index += 1;
    else if (mode === 'down') {
      this.index -= 1;
      if (this.index < 0) this.index = sequence.length - 1;
    } else if (mode === 'updown') {
      this.index += this.direction;
      if (this.index >= sequence.length - 1) this.direction = -1;
      if (this.index <= 0) this.direction = 1;
    } else if (mode === 'random') {
      this.index = Math.floor(Math.random() * sequence.length);
    }
  }

  /** Notas del arpegio incluyendo las octavas extra por encima. */
  private expanded(): ArpNote[] {
    const out: ArpNote[] = [];
    const extra = Math.max(1, Math.round(this.options.octaves));
    for (let octave = 0; octave < extra; octave += 1) {
      for (const note of this.held) {
        out.push({ ...note, midi: note.midi + octave * 12, pan: note.pan * (octave === 0 ? 1 : -1) });
      }
    }
    return out;
  }

  private sequence(): ArpNote[] {
    const base = this.held;
    if (base.length <= 1) return base;
    const extra = Math.max(1, Math.round(this.options.octaves));
    const out: ArpNote[] = [];
    for (let octave = 0; octave < extra; octave += 1) {
      for (const note of base) out.push({ ...note, midi: note.midi + octave * 12 });
    }
    return out;
  }

  /** Llamar en cada frame: dispara la nota que toque. */
  tick(): void {
    if (this.options.mode === 'off' || this.held.length === 0) return;
    const time = this.options.now();
    if (time < this.nextAt) return;
    const period = 1000 / Math.max(0.5, this.options.rate);
    this.nextAt = time + period;
    this.fire();
  }
}
