import { describe, expect, it } from 'vitest';
import { Arpeggiator, type ArpNote } from './arpeggiator';

interface Recorded {
  on: number[];
  off: number[];
  frames: number;
}

function makeArp(
  mode: Arpeggiator['options']['mode'],
  rate = 10,
  octaves = 1,
): { arp: Arpeggiator; log: Recorded; advance(ms: number): void } {
  let clock = 0;
  const log: Recorded = { on: [], off: [], frames: 0 };
  const arp = new Arpeggiator({
    mode,
    rate,
    octaves,
    now: () => clock,
    onNoteOn: (note) => log.on.push(note.midi),
    onNoteOff: (note) => log.off.push(note.midi),
  });
  return {
    arp,
    log,
    advance(ms: number) {
      clock += ms;
      arp.tick();
      log.frames += 1;
    },
  };
}

const note = (midi: number): ArpNote => ({ midi, velocity: 0.8, pan: 0 });

describe('arpegiador', () => {
  it('sigue apagado por defecto', () => {
    const { arp, log } = makeArp('off');
    arp.press(note(60));
    arp.tick();
    expect(log.on).toHaveLength(0);
  });

  it('en modo off el arpegio no dispara (suena la nota pelada)', () => {
    const ctx = makeArp('off');
    ctx.arp.press(note(60));
    ctx.advance(500);
    expect(ctx.log.on).toEqual([]);
  });

  it('sube por las notas pulsadas', () => {
    const ctx = makeArp('up', 1000);
    ctx.arp.press(note(60));
    ctx.arp.press(note(64));
    ctx.arp.press(note(67));
    expect(ctx.log.on).toEqual([60]);
    ctx.advance(200);
    expect(ctx.log.on).toEqual([60, 64]);
    ctx.advance(200);
    expect(ctx.log.on).toEqual([60, 64, 67]);
    ctx.advance(200);
    expect(ctx.log.on).toEqual([60, 64, 67, 60]);
  });

  it('baja con el modo down', () => {
    const ctx = makeArp('down', 1000);
    ctx.arp.press(note(60));
    ctx.arp.press(note(64));
    ctx.advance(200);
    ctx.advance(200);
    expect(ctx.log.on.slice(-1)[0]).toBe(64);
    ctx.advance(200);
    expect(ctx.log.on.slice(-1)[0]).toBe(60);
  });

  it('respeta el tempo sin disparar más de la cuenta', () => {
    const ctx = makeArp('up', 5, 1);
    ctx.arp.press(note(60));
    ctx.advance(100);
    expect(ctx.log.on).toHaveLength(1);
    ctx.advance(100);
    expect(ctx.log.on).toHaveLength(2);
  });
});

describe('arpegiador updown', () => {
  it('va y vuelve', () => {
    const ctx = makeArp('updown', 1000);
    ctx.arp.press(note(60));
    ctx.arp.press(note(62));
    ctx.arp.press(note(64));
    for (let i = 0; i < 6; i += 1) ctx.advance(200);
    expect(ctx.log.on.length).toBeGreaterThan(4);
    expect(new Set(ctx.log.on).size).toBe(3);
  });
});

describe('arpegiador aleatorio', () => {
  it('repite notas al azar', () => {
    const ctx = makeArp('random', 1000);
    ctx.arp.press(note(60));
    ctx.arp.press(note(64));
    for (let i = 0; i < 20; i += 1) ctx.advance(200);
    expect(new Set(ctx.log.on).size).toBe(2);
  });
});

describe('arpegiador de acordes', () => {
  it('dispara todas las notas a la vez', () => {
    const ctx = makeArp('chord', 1000);
    ctx.arp.press(note(60));
    ctx.arp.press(note(64));
    ctx.advance(2000);
    expect(ctx.log.on.slice(-2)).toEqual([60, 64]);
  });
});

describe('arpegiador con octavas extra', () => {
  it('extiende la secuencia una octava arriba', () => {
    const ctx = makeArp('up', 1000, 2);
    ctx.arp.press(note(60));
    ctx.arp.press(note(64));
    ctx.advance(200);
    ctx.advance(200);
    expect(ctx.log.on).toEqual([60, 64, 72]);
  });
});

describe('arpegiador al soltar', () => {
  it('libera todas las notas y se reinicia', () => {
    const ctx = makeArp('up', 1000);
    ctx.arp.press(note(60));
    ctx.arp.press(note(64));
    ctx.advance(200);
    ctx.arp.releaseAll();
    ctx.advance(500);
    expect(ctx.log.on).toHaveLength(2);
    expect(ctx.log.off.length).toBeGreaterThan(0);
  });
});
