import { clamp } from '../core/math';
import { describeBend, type AccidentalPreference } from '../music/theory';
import type { Layout, NotePad } from './layout';
import { bendVisual } from './layout';
import type { TouchState } from './gestures';

export interface BoardTheme {
  background: [string, string];
  naturalFill: string;
  naturalStroke: string;
  accidentalFill: string;
  accidentalStroke: string;
  text: string;
  dimText: string;
  accent: string;
  shadow: string;
  inScale: string;
}

export const THEMES: Record<string, BoardTheme> = {
  noche: {
    background: ['#080b18', '#131a35'],
    naturalFill: 'rgba(148, 197, 255, 0.14)',
    naturalStroke: 'rgba(190, 220, 255, 0.55)',
    accidentalFill: 'rgba(56, 189, 248, 0.10)',
    accidentalStroke: 'rgba(125, 211, 252, 0.42)',
    text: '#eaf2ff',
    dimText: 'rgba(200, 216, 245, 0.55)',
    accent: '#7dd3fc',
    shadow: 'rgba(0, 0, 0, 0.55)',
    inScale: '#a78bfa',
  },
  grafito: {
    background: ['#0b0b0c', '#1c1c1f'],
    naturalFill: 'rgba(240, 240, 240, 0.10)',
    naturalStroke: 'rgba(255, 255, 255, 0.45)',
    accidentalFill: 'rgba(255, 255, 255, 0.06)',
    accidentalStroke: 'rgba(255, 255, 255, 0.3)',
    text: '#f5f5f5',
    dimText: 'rgba(240, 240, 240, 0.5)',
    accent: '#f4f4f5',
    shadow: 'rgba(0, 0, 0, 0.6)',
    inScale: '#fca5a5',
  },
  amanecer: {
    background: ['#1a1026', '#3d1f3f'],
    naturalFill: 'rgba(255, 214, 170, 0.16)',
    naturalStroke: 'rgba(255, 226, 190, 0.6)',
    accidentalFill: 'rgba(255, 150, 120, 0.12)',
    accidentalStroke: 'rgba(255, 180, 150, 0.45)',
    text: '#fff6ec',
    dimText: 'rgba(255, 232, 214, 0.6)',
    accent: '#fbbf8c',
    shadow: 'rgba(20, 6, 18, 0.55)',
    inScale: '#f9a8d4',
  },
};

export interface RenderOptions {
  theme: BoardTheme;
  accidental: AccidentalPreference;
  labelStyle: 'notes' | 'solfege';
  showLabels: boolean;
  bendUp: number;
  bendDown: number;
  reduceMotion: boolean;
  level: number;
  time: number;
  scaleHint: number | null;
  activeNotes: Set<number>;
}

export interface BoardMetrics {
  width: number;
  height: number;
  dpr: number;
}

export function resizeCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number): BoardMetrics {
  const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
  canvas.width = Math.max(1, Math.round(cssWidth * dpr));
  canvas.height = Math.max(1, Math.round(cssHeight * dpr));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const context = canvas.getContext('2d');
  if (context) context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: cssWidth, height: cssHeight, dpr };
}

/**
 * Dibuja el tablero de círculos. Todo se pinta en canvas (no DOM) para que
 * los 60 fps no dependan del layout del navegador: en un celular las
 * transformaciones de muchos nodos se notan.
 */
export function renderBoard(
  context: CanvasRenderingContext2D,
  layout: Layout,
  touches: TouchState[],
  options: RenderOptions,
): void {
  const { width, height } = layout.bounds;
  context.clearRect(0, 0, width, height);
  paintBackground(context, width, height, options);

  for (const pad of layout.pads) {
    paintPad(context, pad, options, null);
  }
  for (const touch of touches) {
    paintTouch(context, touch, options);
  }
}

function paintBackground(context: CanvasRenderingContext2D, width: number, height: number, options: RenderOptions): void {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, options.theme.background[0]);
  gradient.addColorStop(1, options.theme.background[1]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  // Halo reactivo al nivel general: da sensación de "el instrumento respira".
  if (!options.reduceMotion && options.level > 0.001) {
    const glow = context.createRadialGradient(
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      Math.max(width, height) * (0.3 + options.level * 0.35),
    );
    glow.addColorStop(0, `rgba(125, 211, 252, ${0.14 * options.level})`);
    glow.addColorStop(1, 'rgba(125, 211, 252, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }
}

function paintPad(
  context: CanvasRenderingContext2D,
  pad: NotePad,
  options: RenderOptions,
  touch: TouchState | null,
): void {
  const theme = options.theme;
  const inScale = pad.degree >= 0;
  const pressed = options.activeNotes.has(pad.midi) && !touch;
  const radius = pad.radius * (pad.natural ? 1 : 0.94);

  context.save();
  context.shadowColor = theme.shadow;
  context.shadowBlur = pad.natural ? 18 : 10;

  context.beginPath();
  context.arc(pad.x, pad.y, radius, 0, Math.PI * 2);
  context.fillStyle = pad.natural ? theme.naturalFill : theme.accidentalFill;
  context.fill();
  context.shadowBlur = 0;

  context.lineWidth = pressed ? 2.6 : 1.4;
  context.strokeStyle = inScale ? theme.inScale : pad.natural ? theme.naturalStroke : theme.accidentalStroke;
  if (pad.isTonic) {
    context.setLineDash([radius * 0.45, radius * 0.28]);
  }
  context.stroke();
  context.setLineDash([]);

  if (inScale && pad.degree === 0) {
    context.beginPath();
    context.arc(pad.x, pad.y, radius * 0.82, 0, Math.PI * 2);
    context.strokeStyle = theme.inScale;
    context.globalAlpha = 0.35;
    context.lineWidth = 1;
    context.stroke();
    context.globalAlpha = 1;
  }

  if (options.showLabels) {
    const label = options.labelStyle === 'solfege' ? pad.solfege : pad.label;
    context.fillStyle = inScale ? theme.text : theme.dimText;
    context.font = `${Math.round(radius * (label.length > 2 ? 0.52 : 0.72))}px "SF Mono", ui-monospace, system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, pad.x, pad.y);
  }
  context.restore();
}

function paintTouch(context: CanvasRenderingContext2D, touch: TouchState, options: RenderOptions): void {
  const theme = options.theme;
  const pad = touch.pad;
  const radius = pad.radius * (pad.natural ? 1 : 0.94);
  const active = options.activeNotes.has(touch.midi);

  context.save();

  // Halo de la nota sonando.
  const glowRadius = radius * (1.5 + (active ? 0.35 : 0));
  const glow = context.createRadialGradient(pad.x, pad.y, radius * 0.4, pad.x, pad.y, glowRadius);
  glow.addColorStop(0, `rgba(125, 211, 252, ${active ? 0.45 : 0.12})`);
  glow.addColorStop(1, 'rgba(125, 211, 252, 0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(pad.x, pad.y, glowRadius, 0, Math.PI * 2);
  context.fill();

  // Anillo de fuerza: crece con la velocidad de la pulsación.
  const velocityRadius = radius * (1 + touch.velocity * 0.32);
  context.beginPath();
  context.arc(pad.x, pad.y, velocityRadius, 0, Math.PI * 2);
  context.strokeStyle = `rgba(226, 240, 255, ${0.25 + touch.velocity * 0.5})`;
  context.lineWidth = 2.2;
  context.stroke();

  if (Math.abs(touch.bend) > 0.01) {
    paintBendArc(context, pad, radius, touch, options);
  }

  if (touch.vibratoDepth > 0.01) {
    paintVibrato(context, pad, radius, touch, options);
  }

  context.fillStyle = theme.text;
  const readout = describeBend(touch.midi, touch.bend, options.accidental);
  context.font = `600 ${Math.round(radius * 0.44)}px ui-monospace, system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(readout, pad.x, pad.y);
  context.restore();
}

function paintBendArc(
  context: CanvasRenderingContext2D,
  pad: NotePad,
  radius: number,
  touch: TouchState,
  options: RenderOptions,
): void {
  const up = options.bendUp > 0;
  const down = options.bendDown > 0;
  const arcRadius = radius * 1.22;
  const start = -Math.PI * 0.5;

  if (up) {
    const sweep = Math.PI * 0.42 * Math.max(0, bendVisual(touch.bend, options.bendUp));
    if (sweep > 0.01) paintArcSegment(context, pad.x, pad.y, arcRadius, start - sweep, start, '#7dd3fc', 3.4);
  }
  if (down) {
    const sweep = Math.PI * 0.42 * Math.max(0, -bendVisual(touch.bend, options.bendDown));
    if (sweep > 0.01) paintArcSegment(context, pad.x, pad.y, arcRadius, start, start + sweep, '#f9a8d4', 3.4);
  }

  // Marca de la nota de destino dentro de la escala.
  const cents = touch.bend * 100;
  context.fillStyle = '#e2e8f0';
  context.font = `600 ${Math.round(radius * 0.36)}px ui-monospace, system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(`${cents > 0 ? '+' : cents < 0 ? '−' : ''}${Math.abs(Math.round(cents))}¢`, pad.x, pad.y - radius * 1.55);
}

function paintArcSegment(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  from: number,
  to: number,
  color: string,
  width: number,
): void {
  context.beginPath();
  context.arc(cx, cy, radius, from, to);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.stroke();
}

function paintVibrato(
  context: CanvasRenderingContext2D,
  pad: NotePad,
  radius: number,
  touch: TouchState,
  options: RenderOptions,
): void {
  const depth = clamp(touch.vibratoDepth / 2, 0, 1);
  const amplitude = radius * (0.1 + depth * 0.4);
  const wavelength = radius * 1.5;
  const phase = options.time * touch.vibratoRate * 0.9;
  context.beginPath();
  for (let i = 0; i <= 32; i += 1) {
    const t = i / 32;
    const x = pad.x - wavelength + t * wavelength * 2;
    const y = pad.y + radius * 1.32 + Math.sin(phase + t * Math.PI * 3) * amplitude;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.strokeStyle = `rgba(167, 139, 250, ${0.35 + depth * 0.5})`;
  context.lineWidth = 1.8;
  context.stroke();
}
