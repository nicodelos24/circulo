import { beforeEach, describe, expect, it } from 'vitest';
import { computeLayout } from './layout';
import { GestureRecognizer, type GestureConfig, type TouchState } from './gestures';

const layout = computeLayout({
  width: 800,
  height: 400,
  layout: 'guitar',
  octaves: 2,
  baseOctave: 3,
});

const padFor = (midi: number) => layout.pads.find((pad) => pad.midi === midi)!;

const config: GestureConfig = {
  bendTravel: 120,
  bendUp: 2,
  bendDown: 1,
  springReturn: false,
  vibratoDepth: 0.5,
  vibratoRate: 6,
  vibratoThreshold: 8,
  snapBend: true,
  scaleId: 'chromatic',
  rootPc: 0,
  multiTouch: true,
  glide: true,
  hitSlack: 1.35,
  boardWidth: 800,
};

describe('gestos', () => {
  let clock = 0;
  let recognizer: GestureRecognizer;
  let started: TouchState[];
  let stopped: TouchState[];
  let updates: { touch: TouchState; changes: Record<string, unknown> }[];

  beforeEach(() => {
    clock = 0;
    started = [];
    stopped = [];
    updates = [];
    recognizer = new GestureRecognizer(
      config,
      {
        onNoteOn: (touch) => started.push({ ...touch }),
        onNoteOff: (touch) => stopped.push({ ...touch }),
        onUpdate: (touch, changes) => updates.push({ touch: { ...touch }, changes }),
      },
      () => clock,
    );
  });

  const press = (pointerId: number, midi: number) => {
    const pad = padFor(midi);
    return recognizer.start(pointerId, layout.pads, pad.x, pad.y, 0.5);
  };

  it('inicia una nota al tocar el centro del círculo', () => {
    const touch = press(1, 60);
    expect(touch?.midi).toBe(60);
    expect(started).toHaveLength(1);
    expect(touch?.velocity).toBeGreaterThan(0.2);
  });

  it('no suena nada fuera de los círculos', () => {
    expect(recognizer.start(1, layout.pads, 4, 4, 0.5)).toBeUndefined();
    expect(started).toHaveLength(0);
  });

  it('arrastrar hacia arriba hace el bend hacia el sostenido', () => {
    const touch = press(1, 60)!;
    clock = 16;
    recognizer.move(1, layout.pads, touch.pad.x, touch.pad.y - 60, 0.5);
    expect(touch.bend).toBeGreaterThan(0.4);
    expect(touch.bend).toBeLessThanOrEqual(2);
  });

  it('arrastrar hacia abajo hace el bend hacia el bemol', () => {
    const touch = press(1, 60)!;
    clock = 16;
    recognizer.move(1, layout.pads, touch.pad.x, touch.pad.y + 60, 0.5);
    expect(touch.bend).toBeLessThan(-0.4);
    expect(touch.bend).toBeGreaterThanOrEqual(-1);
  });

  it('el bend no pasa del límite configurado', () => {
    const touch = press(1, 60)!;
    clock = 16;
    recognizer.move(1, layout.pads, touch.pad.x, touch.pad.y - 400, 0.5);
    expect(touch.bend).toBe(2);
    clock = 32;
    recognizer.move(1, layout.pads, touch.pad.x, touch.pad.y + 400, 0.5);
    expect(touch.bend).toBe(-1);
  });

  it('detecta vibrato con un vaivén del dedo', () => {
    const touch = press(1, 60)!;
    const pad = touch.pad;
    let time = 0;
    for (let cycle = 0; cycle < 6; cycle += 1) {
      for (const dy of [-18, -6, 6, 18]) {
        time += 40;
        clock = time;
        recognizer.move(1, layout.pads, pad.x, pad.y + dy, 0.5);
      }
    }
    expect(touch.vibratoDepth).toBeGreaterThan(0);
    expect(touch.vibratoRate).toBeGreaterThan(2);
  });

  it('un movimiento lento no se confunde con vibrato', () => {
    const touch = press(1, 60)!;
    const pad = touch.pad;
    for (const dy of [-20, 20, -20, 20]) {
      clock += 400;
      recognizer.move(1, layout.pads, pad.x, pad.y + dy, 0.5);
    }
    expect(touch.vibratoDepth).toBe(0);
  });

  it('el retorno elástico devuelve el bend al centro', () => {
    recognizer.setConfig({ ...config, springReturn: true });
    const touch = press(1, 60)!;
    clock = 16;
    recognizer.move(1, layout.pads, touch.pad.x, touch.pad.y - 60, 0.5);
    const bent = touch.bend;
    expect(bent).toBeGreaterThan(0);
    for (let i = 0; i < 40; i += 1) {
      clock += 60;
      recognizer.update();
    }
    expect(Math.abs(touch.bend)).toBeLessThan(bent * 0.2);
  });

  it('la fuerza sube al tocar más lejos del centro', () => {
    const pad = padFor(60);
    const centre = recognizer.start(1, layout.pads, pad.x, pad.y, 0)!;
    const edge = recognizer.start(2, layout.pads, pad.x + pad.radius * 1.2, pad.y, 0)!;
    expect(edge.velocity).toBeGreaterThan(centre.velocity);
  });

  it('usa la presión del dedo cuando el device la da', () => {
    const pad = padFor(60);
    const soft = recognizer.start(1, layout.pads, pad.x, pad.y, 0.2)!;
    const hard = recognizer.start(2, layout.pads, pad.x, pad.y, 0.95)!;
    expect(hard.velocity).toBeGreaterThan(soft.velocity);
  });

  it('arrastrar entre círculos hace glissando sin cortar', () => {
    const touch = press(1, 60)!;
    clock = 16;
    const next = padFor(62);
    recognizer.move(1, layout.pads, next.x, next.y, 0.5);
    expect(touch.midi).toBe(62);
    expect(updates.some((update) => update.changes.note === 62)).toBe(true);
    expect(stopped).toHaveLength(0);
  });

  it('sostiene varias notas a la vez', () => {
    press(1, 48);
    press(2, 55);
    press(3, 64);
    expect(recognizer.count).toBe(3);
    recognizer.end(2);
    expect(recognizer.count).toBe(2);
    expect(stopped).toHaveLength(1);
  });

  it('respeta el modo de un solo dedo', () => {
    recognizer.setConfig({ ...config, multiTouch: false });
    press(1, 48);
    expect(recognizer.start(2, layout.pads, padFor(60).x, padFor(60).y, 0.5)).toBeUndefined();
    expect(recognizer.count).toBe(1);
  });

  it('suelta todas las notas de golpe', () => {
    press(1, 48);
    press(2, 55);
    recognizer.endAll();
    expect(recognizer.isPlaying).toBe(false);
    expect(stopped).toHaveLength(2);
  });

  it('el destino del bend sugiere una nota de la escala', () => {
    recognizer.setConfig({ ...config, scaleId: 'major', rootPc: 0 });
    const touch = press(1, 60)!;
    clock = 16;
    recognizer.move(1, layout.pads, touch.pad.x, touch.pad.y - 120, 0.5);
    expect(touch.bend).toBeCloseTo(2, 5);
    expect(recognizer.targetNote(touch)).toBe(62);
  });
});
