export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function inverseLerp(a: number, b: number, value: number): number {
  return a === b ? 0 : (value - a) / (b - a);
}

/** Interpolación exponencial independiente de la frecuencia de muestreo. */
export function smoothTowards(current: number, target: number, tau: number, dt: number): number {
  if (tau <= 0) return target;
  const factor = 1 - Math.exp(-dt / tau);
  return current + (target - current) * factor;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp(inverseLerp(edge0, edge1, value), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Convierte un valor normalizado 0..1 a la curva indicada. */
export function fromNormalized(value: number, curve: 'lin' | 'exp', min: number, max: number): number {
  const t = clamp(value, 0, 1);
  if (curve === 'exp') return min * Math.pow(max / min, t);
  return min + (max - min) * t;
}

export function toNormalized(value: number, curve: 'lin' | 'exp', min: number, max: number): number {
  if (curve === 'exp') {
    if (min <= 0) return clamp(inverseLerp(min, max, value), 0, 1);
    return clamp(Math.log(value / min) / Math.log(max / min), 0, 1);
  }
  return clamp(inverseLerp(min, max, value), 0, 1);
}

/** Formatea un valor de knob según la magnitud del rango. */
export function formatValue(value: number, unit?: string): string {
  const abs = Math.abs(value);
  let text: string;
  if (abs >= 1000) text = `${Math.round(value / 10) / 100}k`;
  else if (abs >= 100) text = Math.round(value).toString();
  else if (abs >= 10) text = value.toFixed(1);
  else text = value.toFixed(2);
  return unit ? `${text} ${unit}` : text;
}

export function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded === 0) return '0¢';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}¢`;
}

export function wrap(value: number, max: number): number {
  return ((value % max) + max) % max;
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}
