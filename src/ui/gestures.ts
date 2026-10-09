import { clamp } from '../core/math';
import { snapToScale } from '../music/theory';
import type { ScaleId } from '../music/theory';
import type { NotePad } from './layout';
import { hitTest } from './layout';

export interface GestureConfig {
  /** Píxeles de recorrido vertical por semitono de bend. */
  bendTravel: number;
  bendUp: number;
  bendDown: number;
  /** Si el bend vuelve al centro al soltar el movimiento (whammy). */
  springReturn: boolean;
  vibratoDepth: number;
  vibratoRate: number;
  /** Desplazamiento mínimo (px) para considerar que hay vibrato. */
  vibratoThreshold: number;
  snapBend: boolean;
  scaleId: ScaleId;
  rootPc: number;
  multiTouch: boolean;
  glide: boolean;
  /** Distancia máxima desde el centro del círculo para considerarlo tocado. */
  hitSlack: number;
  /** Ancho del tablero en píxeles, para calcular la panorámica. */
  boardWidth: number;
}

export interface TouchState {
  pointerId: number;
  midi: number;
  pad: NotePad;
  /** Velocidad inicial 0..1. */
  velocity: number;
  /** Bend actual en semitonos (positivo = sostenido). */
  bend: number;
  /** Semitonos de vibrato (amplitud). */
  vibratoDepth: number;
  vibratoRate: number;
  /** Posición actual y de referencia del dedo. */
  x: number;
  y: number;
  originX: number;
  originY: number;
  /** Última posición con la que se calculó el bend, para el rebote. */
  lastMoveAt: number;
  startedAt: number;
  /** True cuando el dedo se ha movido a otro círculo (glissando). */
  sliding: boolean;
}

export interface GestureEvents {
  onNoteOn?(touch: TouchState): void;
  onNoteOff?(touch: TouchState): void;
  /** Se llama sólo cuando el valor cambia de verdad. */
  onUpdate?(touch: TouchState, changes: { bend?: boolean; vibrato?: boolean; velocity?: boolean; note?: number }): void;
  onPan?(touch: TouchState, pan: number): void;
}

interface MotionSample {
  time: number;
  y: number;
}

const MAX_TOUCHES = 5;

/**
 * Traduce eventos de puntero a intención musical.
 *
 * - Arrastrar hacia arriba = bend hacia el sostenido (el intervalo se
 *   estira) y hacia abajo = bemol.
 * - Mover el dedo en vaivén mientras se mantiene pulsado genera vibrato:
 *   la amplitud y la velocidad se miden de la propia trajectory.
 * - La fuerza sale de la presión del dedo o, si el device no la da, de lo
 *   cerca del centro del círculo que se tocó.
 */
export class GestureRecognizer {
  private readonly touches = new Map<number, TouchState>();
  private readonly history = new Map<number, MotionSample[]>();
  private config: GestureConfig;
  private events: GestureEvents;
  private now: () => number;

  constructor(config: GestureConfig, events: GestureEvents, now: () => number = () => performance.now()) {
    this.config = config;
    this.events = events;
    this.now = now;
  }

  setConfig(config: GestureConfig): void {
    this.config = config;
  }

  setEvents(events: GestureEvents): void {
    this.events = events;
  }

  get active(): TouchState[] {
    return [...this.touches.values()];
  }

  get isPlaying(): boolean {
    return this.touches.size > 0;
  }

  get count(): number {
    return this.touches.size;
  }

  touchState(pointerId: number): TouchState | undefined {
    return this.touches.get(pointerId);
  }

  start(pointerId: number, pads: NotePad[], x: number, y: number, pressure: number): TouchState | undefined {
    if (!this.config.multiTouch && this.touches.size > 0) return undefined;
    if (this.touches.size >= MAX_TOUCHES) return undefined;
    const pad = hitTest(pads, x, y, this.config.hitSlack);
    if (!pad) return undefined;

    const velocity = this.velocityFor(pad, x, y, pressure);
    const touch: TouchState = {
      pointerId,
      midi: pad.midi,
      pad,
      velocity,
      bend: 0,
      vibratoDepth: 0,
      vibratoRate: this.config.vibratoRate,
      x,
      y,
      originX: x,
      originY: y,
      lastMoveAt: this.now(),
      startedAt: this.now(),
      sliding: false,
    };
    this.touches.set(pointerId, touch);
    this.history.set(pointerId, [{ time: touch.startedAt, y }]);
    this.events.onNoteOn?.(touch);
    return touch;
  }

  move(pointerId: number, pads: NotePad[], x: number, y: number, pressure: number): void {
    const touch = this.touches.get(pointerId);
    if (!touch) return;

    const time = this.now();
    touch.x = x;
    touch.y = y;
    touch.lastMoveAt = time;

    const pad = hitTest(pads, x, y, this.config.hitSlack);
    const changes: { bend?: boolean; vibrato?: boolean; velocity?: boolean; note?: number } = {};

    if (pad && this.config.glide && pad.midi !== touch.midi) {
      // Glissando: se cambia de nota sin cortar el sonido.
      touch.midi = pad.midi;
      touch.pad = pad;
      touch.originY = y;
      changes.note = pad.midi;
    }

    const deltaY = y - touch.originY;
    const rawBend = clamp(-deltaY / Math.max(8, this.config.bendTravel), -1, 1);
    const bend = this.applyBendLimits(rawBend);
    if (Math.abs(bend - touch.bend) > 0.004) {
      touch.bend = bend;
      changes.bend = true;
    }

    const vib = this.analyseVibrato(pointerId, time, y);
    if (vib) {
      touch.vibratoDepth = vib.depth;
      touch.vibratoRate = vib.rate;
      changes.vibrato = true;
    }

    const velocity = this.velocityFor(touch.pad, x, y, pressure);
    if (Math.abs(velocity - touch.velocity) > 0.02) {
      touch.velocity = velocity;
      changes.velocity = true;
    }

    const pan = clamp((x / Math.max(1, this.config.boardWidth)) * 2 - 1, -1, 1) * 0.7;
    this.events.onPan?.(touch, pan);

    this.events.onUpdate?.(touch, changes);
  }

  end(pointerId: number): TouchState | undefined {
    const touch = this.touches.get(pointerId);
    if (!touch) return undefined;
    this.touches.delete(pointerId);
    this.history.delete(pointerId);
    this.events.onNoteOff?.(touch);
    return touch;
  }

  /** Suelta todas las notas (por ejemplo al perder el foco de la ventana). */
  endAll(): void {
    for (const pointerId of [...this.touches.keys()]) this.end(pointerId);
  }

  /**
   * Retorno elástico: si el dedo se queda quieto, el bend vuelve al centro
   * poco a poco, como una barra de vibrato a la que sueltas presión.
   */
  update(): void {
    const time = this.now();
    for (const touch of this.touches.values()) {
      if (!this.config.springReturn || touch.bend === 0) continue;
      const idle = time - touch.lastMoveAt;
      if (idle < 90) continue;
      const pull = Math.min(1, (idle - 90) / 220);
      const target = touch.bend * (1 - pull * 0.18);
      if (Math.abs(target - touch.bend) > 0.002) {
        touch.bend = target;
        this.events.onUpdate?.(touch, { bend: true });
      }
    }
  }

  private applyBendLimits(raw: number): number {
    // raw > 0 significa "el dedo subió": el tono se estira hacia el sostenido.
    // raw < 0 significa que bajó: el tono se afloja hacia el bemol.
    const semis = raw * (raw > 0 ? this.config.bendUp : this.config.bendDown);
    const limit = semis >= 0 ? this.config.bendUp : this.config.bendDown;
    return clamp(semis, -limit, limit);
  }

  /**
   * Nota de la escala más cercana a la altura actual (incluido el bend).
   * Se usa para iluminar el destino del bend sin quantificar el tono:
   * el dedo manda la entonación, la escala sólo señala dónde caer.
   */
  targetNote(touch: TouchState): number {
    const height = touch.midi + touch.bend;
    return Math.round(snapToScale(height, this.config.scaleId, this.config.rootPc));
  }

  private velocityFor(pad: NotePad, x: number, y: number, pressure: number): number {
    if (pressure > 0 && pressure < 1) {
      return clamp(0.35 + pressure * 0.75, 0.15, 1);
    }
    const distance = Math.hypot(pad.x - x, pad.y - y);
    const relative = clamp(distance / Math.max(1, pad.radius * this.config.hitSlack), 0, 1);
    return clamp(0.55 + relative * 0.5, 0.2, 1);
  }

  /**
   * Detecta vaivén: necesita al menos dos cambios de dirección con amplitud
   * suficiente y un periodo compatible con un vibrato musical (0.1 a 1.2 s).
   */
  private analyseVibrato(pointerId: number, time: number, y: number): { depth: number; rate: number } | null {
    const samples = this.history.get(pointerId);
    if (!samples) return null;
    samples.push({ time, y });
    while (samples.length > 2 && time - samples[0].time > 900) samples.shift();
    if (samples.length < 5) return null;

    const threshold = this.config.vibratoThreshold;
    let direction = 0;
    let turningPoints = 0;
    for (let i = 1; i < samples.length; i += 1) {
      const delta = samples[i].y - samples[i - 1].y;
      if (Math.abs(delta) < 0.4) continue;
      const sign = Math.sign(delta);
      if (direction !== 0 && sign !== direction) turningPoints += 1;
      direction = sign;
    }
    if (turningPoints < 2) return null;

    const span = samples[samples.length - 1].time - samples[0].time;
    if (span < 80) return null;
    const rate = turningPoints / (span / 1000);
    if (rate < 1.1 || rate > 14) return null;

    let min = Infinity;
    let max = -Infinity;
    for (const sample of samples) {
      min = Math.min(min, sample.y);
      max = Math.max(max, sample.y);
    }
    const amplitude = max - min;
    if (amplitude < threshold) return null;

    const amplitudeSemis = clamp((amplitude / 70) * this.config.vibratoDepth * 3.2, 0, 2.2);
    const speed = clamp(rate / 6, 0.5, 1.2);
    return { depth: amplitudeSemis * (0.55 + speed * 0.6), rate: clamp(rate, 2.5, 12) };
  }
}
