import { describe, expect, it } from 'vitest';
import { Looper, type LoopEvent } from './looper';

interface Recorded {
  clock: number;
  events: LoopEvent[];
  stops: number;
}

function makeLooper(): { looper: Looper; log: Recorded; advance(ms: number): void } {
  let clock = 0;
  const log: Recorded = { clock: 0, events: [], stops: 0 };
  const looper = new Looper({
    loopBeats: 4,
    bpm: 120,
    now: () => clock,
    onTrigger: (event) => log.events.push(event),
    onStop: () => {
      log.stops += 1;
    },
  });
  return {
    looper,
    log,
    advance(ms: number) {
      clock += ms;
      looper.tick();
      log.clock = clock;
    },
  };
}

describe('looper', () => {
  it('graba la frase y la repite', () => {
    const ctx = makeLooper();
    ctx.looper.startRecording();
    ctx.looper.noteOn(60, 0.9, 0);
    ctx.advance(100);
    ctx.looper.noteOff(60);
    ctx.advance(100);
    ctx.looper.noteOn(64, 0.7, 0);
    ctx.advance(100);
    ctx.looper.noteOff(64);
    ctx.looper.stopRecording();

    expect(ctx.looper.length).toBe(2);
    expect(ctx.looper.isRecording).toBe(false);
    expect(ctx.log.events).toHaveLength(0);

    // La vuelta dura 2 s a 120 bpm con 4 pulsos: al repetirla debe sonar.
    // Se avanza frame a frame, como haría la app en cada requestAnimationFrame.
    for (let frame = 0; frame < 160; frame += 1) ctx.advance(16);
    expect(ctx.log.events.length).toBeGreaterThanOrEqual(2);
    expect(ctx.log.events.slice(0, 2).map((event) => event.midi)).toEqual([60, 64]);
    // La vuelta se repite entera: 4 eventos = 2 vueltas de 2 notas.
    expect(ctx.log.events.length % 2).toBe(0);
    expect(ctx.log.stops).toBeGreaterThan(0);
  });

  it('mantiene la duración de cada nota', () => {
    const ctx = makeLooper();
    ctx.looper.startRecording();
    ctx.looper.noteOn(60, 0.9, 0);
    ctx.advance(250);
    ctx.looper.noteOff(60);
    ctx.looper.stopRecording();
    const [event] = ctx.looper.events_snapshot();
    expect(event.duration).toBeGreaterThan(200);
    expect(event.duration).toBeLessThan(350);
  });

  it('no repite nada si no hay frase grabada', () => {
    const ctx = makeLooper();
    ctx.advance(5000);
    expect(ctx.log.events).toHaveLength(0);
  });

  it('clear borra la frase', () => {
    const ctx = makeLooper();
    ctx.looper.startRecording();
    ctx.looper.noteOn(60, 0.9, 0);
    ctx.looper.stopRecording();
    expect(ctx.looper.length).toBe(1);
    ctx.looper.clear();
    expect(ctx.looper.length).toBe(0);
    ctx.advance(3000);
    expect(ctx.log.events).toHaveLength(0);
  });

  it('toggle alterna grabación', () => {
    const ctx = makeLooper();
    expect(ctx.looper.toggle()).toBe(true);
    expect(ctx.looper.toggle()).toBe(false);
  });
});
