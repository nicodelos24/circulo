import { describe, expect, it } from 'vitest';
import { bendVisual, computeLayout, hitTest } from './layout';

const base = {
  width: 800,
  height: 400,
  layout: 'guitar' as const,
  octaves: 2,
  baseOctave: 3,
  scaleIntervals: [0, 2, 4, 5, 7, 9, 11],
  rootPc: 0,
};

describe('layout de círculos', () => {
  it('coloca todas las notas de las octavas pedidas', () => {
    const layout = computeLayout(base);
    expect(layout.pads).toHaveLength(24);
    expect(layout.pads[0].midi).toBe(48);
    expect(layout.pads[23].midi).toBe(71);
  });

  it('distingue naturales y alteraciones', () => {
    const pads = computeLayout(base).pads;
    const c = pads.find((pad) => pad.midi === 48);
    const cs = pads.find((pad) => pad.midi === 49);
    expect(c?.natural).toBe(true);
    expect(cs?.natural).toBe(false);
    expect(c!.radius).toBeGreaterThan(cs!.radius);
  });

  it('el arco eleva las notas centrales y baja los extremos', () => {
    const pads = computeLayout(base).pads.filter((pad) => pad.natural);
    const lowest = pads[0];
    const middle = pads[Math.floor(pads.length / 2)];
    const highest = pads[pads.length - 1];
    expect(middle.y).toBeLessThan(lowest.y);
    expect(middle.y).toBeLessThan(highest.y);
    // Los extremos quedan a la misma altura (simetría del mástil).
    expect(Math.abs(lowest.y - highest.y)).toBeLessThan(2);
  });

  it('mantiene los círculos dentro de la pantalla', () => {
    for (const layoutId of ['guitar', 'harmonica', 'grid'] as const) {
      const layout = computeLayout({ ...base, layout: layoutId, octaves: 4 });
      for (const pad of layout.pads) {
        expect(pad.x - pad.radius).toBeGreaterThanOrEqual(-1);
        expect(pad.x + pad.radius).toBeLessThanOrEqual(801);
        expect(pad.y - pad.radius).toBeGreaterThanOrEqual(-1);
        expect(pad.y + pad.radius).toBeLessThanOrEqual(401);
      }
    }
  });

  it('no solapa las notas naturales vecinas', () => {
    const pads = computeLayout({ ...base, width: 400 }).pads.filter((pad) => pad.natural);
    for (let i = 1; i < pads.length; i += 1) {
      const dx = pads[i].x - pads[i - 1].x;
      const dy = pads[i].y - pads[i - 1].y;
      const distance = Math.hypot(dx, dy);
      expect(distance).toBeGreaterThan(pads[i].radius * 1.6);
    }
  });

  it('marca los grados de la escala y la tónica', () => {
    const pads = computeLayout(base).pads;
    const c = pads.find((pad) => pad.midi === 60);
    const cs = pads.find((pad) => pad.midi === 61);
    expect(c?.degree).toBe(0);
    expect(c?.isTonic).toBe(true);
    expect(cs?.degree).toBe(-1);
  });

  it('acierta el círculo tocado', () => {
    const layout = computeLayout(base);
    const pad = layout.pads[6];
    expect(hitTest(layout.pads, pad.x, pad.y)?.midi).toBe(pad.midi);
    expect(hitTest(layout.pads, 5, 5)).toBeUndefined();
  });

  it('el visual del bend va de -1 a 1', () => {
    expect(bendVisual(2, 2)).toBe(-1);
    expect(bendVisual(-1, 1)).toBe(1);
    expect(bendVisual(0, 2)).toBe(0);
    expect(bendVisual(1, 0)).toBe(0);
  });

  it('ningún círculo se solapa en tamaños reales de teléfono', () => {
    const sizes: [number, number, number][] = [
      [844, 390, 1],
      [844, 390, 2],
      [932, 430, 2],
      [800, 360, 3],
      [667, 375, 2],
      [1180, 820, 4],
    ];
    for (const [width, height, octaves] of sizes) {
      const layout = computeLayout({ ...base, width, height, octaves, inset: { top: 76, bottom: 88 } });
      for (let i = 0; i < layout.pads.length; i += 1) {
        for (let j = i + 1; j < layout.pads.length; j += 1) {
          const a = layout.pads[i];
          const b = layout.pads[j];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          expect(distance, `${a.label} vs ${b.label} en ${width}x${height}`).toBeGreaterThan(a.radius + b.radius);
        }
      }
    }
  });

  it('respeta el espacio reservado por el HUD', () => {
    const inset = { top: 76, bottom: 88 };
    const layout = computeLayout({ ...base, width: 844, height: 390, inset });
    for (const pad of layout.pads) {
      expect(pad.y - pad.radius).toBeGreaterThanOrEqual(inset.top - 1);
      expect(pad.y + pad.radius).toBeLessThanOrEqual(390 - inset.bottom + 1);
    }
  });

  it('centra el tablero en el espacio libre', () => {
    const inset = { top: 76, bottom: 88 };
    const layout = computeLayout({ ...base, width: 844, height: 390, inset });
    const top = Math.min(...layout.pads.map((pad) => pad.y - pad.radius));
    const bottom = Math.max(...layout.pads.map((pad) => pad.y + pad.radius));
    const gapTop = top - inset.top;
    const gapBottom = 390 - inset.bottom - bottom;
    expect(Math.abs(gapTop - gapBottom)).toBeLessThan(2);
  });

  it('el diseño en fila ordena las notas de izquierda a derecha', () => {
    const layout = computeLayout({ ...base, layout: 'harmonica' });
    for (let i = 1; i < layout.pads.length; i += 1) {
      expect(layout.pads[i].x).toBeGreaterThan(layout.pads[i - 1].x);
    }
  });
});
