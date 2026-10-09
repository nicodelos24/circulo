export interface LoopEvent {
  time: number;
  midi: number;
  velocity: number;
  pan: number;
  duration: number;
}

export interface LooperOptions {
  loopBeats: number;
  bpm: number;
  now: () => number;
  /** Dispara una nota de la vuelta: recibe la voz asignada para poder apagarla. */
  onTrigger: (event: LoopEvent, voiceId: number) => void;
  onStop: (voiceId: number) => void;
}

const MAX_EVENTS = 256;

/**
 * Looper de frases: graba lo que tocas (nota, fuerza, cuándo entra y
 * cuánto dura) y lo repite en bucle mientras esté activo.
 */
export class Looper {
  private events: LoopEvent[] = [];
  private recording = false;
  private startAt = 0;
  /** Voces del loop que todavía suenan: id -> instante en que expiran. */
  private readonly active = new Map<number, number>();
  private voiceSeq = 0;
  private cycleStart = 0;
  private index = 0;
  private options: LooperOptions;

  constructor(options: LooperOptions) {
    this.options = options;
  }

  setOptions(patch: Partial<LooperOptions>): void {
    this.options = { ...this.options, ...patch };
  }

  get length(): number {
    return this.events.length;
  }

  get isRecording(): boolean {
    return this.recording;
  }

  toggle(): boolean {
    if (this.recording) this.stopRecording();
    else this.startRecording();
    return this.recording;
  }

  startRecording(): void {
    this.recording = true;
    this.events = [];
    this.startAt = this.options.now();
  }

  stopRecording(): void {
    this.recording = false;
  }

  clear(): void {
    this.recording = false;
    this.events = [];
    this.cycleStart = 0;
    this.index = 0;
    this.stopAll();
  }

  private stopAll(): void {
    for (const voiceId of this.active.keys()) this.options.onStop(voiceId);
    this.active.clear();
  }

  noteOn(midi: number, velocity: number, pan: number): void {
    const time = this.options.now();
    if (!this.recording) return;
    if (this.events.length >= MAX_EVENTS) return;
    this.events.push({ time: time - this.startAt, midi, velocity, pan, duration: 0 });
  }

  noteOff(midi: number): void {
    if (!this.recording) return;
    const time = this.options.now() - this.startAt;
    for (let i = this.events.length - 1; i >= 0; i -= 1) {
      const event = this.events[i];
      if (event.midi === midi && event.duration === 0) {
        event.duration = Math.max(50, time - event.time);
        return;
      }
    }
  }

  private get period(): number {
    const beats = Math.max(1, this.options.loopBeats);
    return (60 / Math.max(40, this.options.bpm)) * 1000 * beats;
  }

  /** Llamar en cada frame: dispara los eventos de la vuelta actual. */
  tick(): void {
    if (this.recording || this.events.length === 0) return;
    const period = this.period;
    const now = this.options.now();
    if (this.cycleStart === 0) {
      this.cycleStart = now;
      this.index = 0;
    }
    const ordered = [...this.events].sort((a, b) => a.time - b.time);
    while (this.index < ordered.length) {
      const event = ordered[this.index];
      const at = this.cycleStart + event.time;
      if (at > now) break;
      this.voiceSeq += 1;
      const voiceId = 900_000 + this.voiceSeq;
      this.options.onTrigger(event, voiceId);
      this.active.set(voiceId, now + event.duration);
      this.index += 1;
    }
    for (const [voiceId, endsAt] of [...this.active]) {
      if (now >= endsAt) {
        this.active.delete(voiceId);
        this.options.onStop(voiceId);
      }
    }
    if (now - this.cycleStart >= period) {
      const cycles = Math.floor((now - this.cycleStart) / period);
      this.cycleStart += cycles * period;
      this.index = 0;
    }
  }

  events_snapshot(): LoopEvent[] {
    return [...this.events];
  }
}
