import { clamp } from '../core/math';
import type { LayoutId } from '../audio/patch';
import { mod } from '../music/theory';

export interface NotePad {
  midi: number;
  /** Nombre corto para pintar dentro del círculo (C, C#, D...). */
  label: string;
  /** Etiqueta larga opcional (Do#, Re♭). */
  solfege: string;
  natural: boolean;
  x: number;
  y: number;
  radius: number;
  /** Semitonos desde la tónica de la escala activa (-1 si no pertenece). */
  degree: number;
  /** Nota más grave/alta del vecindario: sirve para el color del aro. */
  isTonic: boolean;
}

export interface LayoutInput {
  width: number;
  height: number;
  /** Espacio reservado arriba y abajo por el HUD: el tablero se centra en lo que queda. */
  inset?: { top: number; bottom: number };
  layout: LayoutId;
  octaves: number;
  /** Octava del Do más grave (0 = C0). */
  baseOctave: number;
  /** Cuánto se elevan las notas del centro respecto a los extremos, en fracción del alto. */
  arcAmount?: number;
  /** Intervalos de la escala activa (para resaltar los grados). */
  scaleIntervals?: number[];
  rootPc?: number;
}

export interface Layout {
  pads: NotePad[];
  /** Rectángulo útil del tablero (respeta los safe areas). */
  bounds: { x: number; y: number; width: number; height: number };
  radius: number;
  layout: LayoutId;
}

const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const SHARP_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SOLFEGE_LABELS = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

/**
 * Calcula la posición de cada círculo.
 *
 * Idea ergonómica: el pulgar y el meñique sólo alcanzan bien las zonas
 * externas de la pantalla, así que el arco invierte la curvatura: los
 * extremos (notas graves y agudas) quedan más abajo y hacia las esquinas,
 * y las notas centrales se elevan. Es la misma idea que elculata de un
 * mástil, donde el pulgar llega cómodo a la parte alta del arco.
 */
export function computeLayout(input: LayoutInput): Layout {
  const { width, height, layout, octaves, baseOctave } = input;
  const insetTop = Math.max(0, input.inset?.top ?? 0);
  const insetBottom = Math.max(0, input.inset?.bottom ?? 0);
  const band = { top: insetTop, height: Math.max(80, height - insetTop - insetBottom) };
  const safe = { x: 0, y: 0, width, height };
  const count = octaves * 12;
  const arcAmount = input.arcAmount ?? 0.26;

  const pads: NotePad[] = [];
  if (count <= 0 || width <= 0 || height <= 0) {
    return { pads, bounds: safe, radius: 0, layout };
  }

  if (layout === 'grid') {
    const cols = Math.min(12, count);
    const rows = Math.ceil(count / cols);
    const cellW = width / cols;
    const cellH = band.height / rows;
    const radius = Math.min(cellW, cellH) * 0.42;
    for (let i = 0; i < count; i += 1) {
      const midi = baseMidi(i, baseOctave);
      const col = i % cols;
      const row = Math.floor(i / cols);
      pads.push(makePad(midi, col * cellW + cellW / 2, band.top + row * cellH + cellH / 2, radius * 0.92, input));
    }
    return { pads, bounds: safe, radius, layout };
  }

  if (layout === 'harmonica') {
    const margin = Math.max(8, Math.min(width, height) * 0.06);
    const usable = width - margin * 2;
    const step = usable / Math.max(1, count - 1);
    const radius = Math.min(step * 0.46, band.height * 0.34);
    const centerY = band.top + band.height * 0.5;
    for (let i = 0; i < count; i += 1) {
      const midi = baseMidi(i, baseOctave);
      const x = margin + step * i;
      const wobble = Math.sin((i / Math.max(1, count - 1)) * Math.PI) * band.height * 0.04;
      pads.push(makePad(midi, x, centerY - wobble, radius, input));
    }
    return { pads, bounds: safe, radius, layout };
  }

  // Guitarra: arco con notas naturales grandes y alteraciones encima.
  const margin = Math.max(10, Math.min(width, height) * 0.045);
  const usableWidth = width - margin * 2;
  const naturals = padsForLayout(count, input).filter((pad) => pad.natural);
  const items = padsForLayout(count, input);
  const steps = Math.max(1, naturals.length - 1);
  // Radio y paso horizontal dependen uno del otro: se resuelven juntos para
  // que el círculo de los extremos no se salga de la pantalla.
  let baseRadius = Math.min((usableWidth / steps) * 0.46, band.height * 0.24);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const room = Math.max(24, width - 2 * (margin + baseRadius));
    baseRadius = Math.min((room / steps) * 0.46, band.height * 0.24);
  }
  const stepX = Math.max(24, (width - 2 * (margin + baseRadius)) / steps);

  /** Coloca el arco con un radio y una elevación dados. */
  const build = (radius: number, arcPeak: number): NotePad[] => {
    const accidentalRadius = radius * 0.64;
    const axis = band.top + band.height * 0.5;
    const arcAt = (index: number) => Math.sin((naturals.length > 1 ? index / (naturals.length - 1) : 0.5) * Math.PI) * arcPeak;
    const naturalY = (midi: number) => {
      const index = naturals.findIndex((natural) => natural.midi === midi);
      return index >= 0 ? axis - arcAt(index) : axis;
    };
    const naturalX = (midi: number) => {
      const index = naturals.findIndex((natural) => natural.midi === midi);
      return index >= 0 ? left + stepX * index : left;
    };

    const left = margin + radius;
    const out: NotePad[] = [];
    for (const item of items) {
      if (item.natural) {
        out.push(makePad(item.midi, naturalX(item.midi), naturalY(item.midi), radius, input));
        continue;
      }
      // La alteración se apoya arriba, entre dos naturales, sin tocarlas.
      const dx = stepX * 0.5;
      const minDistance = radius + accidentalRadius + 5;
      const dy = Math.sqrt(Math.max(0, minDistance * minDistance - dx * dx));
      // Toda alteración vive entre la natural de abajo (midi-1) y la de arriba (midi+1).
      const baseY = Math.min(naturalY(item.midi - 1), naturalY(item.midi + 1));
      out.push(makePad(item.midi, naturalX(item.midi - 1) + dx, baseY - dy, accidentalRadius, input));
    }
    return out;
  };

  // Se ajusta el tamaño hasta que el tablero entra justo en la banda libre.
  let scale = 1;
  let placed = build(baseRadius, band.height * arcAmount);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const needed = Math.max(...placed.map((pad) => pad.y + pad.radius)) - Math.min(...placed.map((pad) => pad.y - pad.radius));
    if (needed <= band.height) break;
    scale *= Math.max(0.55, (band.height / needed) * 0.98);
    placed = build(baseRadius * scale, band.height * arcAmount * scale);
  }

  const top = Math.min(...placed.map((pad) => pad.y - pad.radius));
  const bottom = Math.max(...placed.map((pad) => pad.y + pad.radius));
  const shift = band.top + (band.height - (bottom - top)) / 2 - top;
  for (const pad of placed) pad.y += shift;
  pads.push(...placed);
  const radius = placed.find((pad) => pad.natural)?.radius ?? 0;

  return { pads, bounds: safe, radius, layout };
}

function padsForLayout(count: number, input: LayoutInput): { midi: number; natural: boolean }[] {
  const list: { midi: number; natural: boolean }[] = [];
  for (let i = 0; i < count; i += 1) {
    const midi = baseMidi(i, input.baseOctave);
    list.push({ midi, natural: NATURAL_PCS.has(mod(midi, 12)) });
  }
  return list;
}

function baseMidi(index: number, baseOctave: number): number {
  return (baseOctave + 1) * 12 + index;
}

function makePad(midi: number, x: number, y: number, radius: number, input: LayoutInput): NotePad {
  const pc = mod(midi, 12);
  const rootPc = input.rootPc ?? 0;
  const relative = mod(pc - rootPc, 12);
  const intervals = input.scaleIntervals;
  const degree = intervals ? intervals.indexOf(relative) : -1;
  return {
    midi,
    label: SHARP_LABELS[pc],
    solfege: SOLFEGE_LABELS[pc],
    natural: NATURAL_PCS.has(pc),
    x,
    y,
    radius,
    degree,
    isTonic: relative === 0,
  };
}

/** Círculo tocado más cercano (o undefined si está lejos). */
export function hitTest(pads: NotePad[], x: number, y: number, slack = 1): NotePad | undefined {
  let best: NotePad | undefined;
  let bestDistance = Infinity;
  for (const pad of pads) {
    const distance = Math.hypot(pad.x - x, pad.y - y);
    if (distance <= pad.radius * slack && distance < bestDistance) {
      best = pad;
      bestDistance = distance;
    }
  }
  return best;
}

/** Coordenada normalizada del arco de un círculo: -1 (arriba) a 1 (abajo). */
export function bendVisual(bendSemis: number, bendUp: number): number {
  if (bendUp <= 0) return 0;
  const value = clamp(-bendSemis / bendUp, -1, 1);
  return value === 0 ? 0 : value;
}
