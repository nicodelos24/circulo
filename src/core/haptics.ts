type HapticPattern = 'tick' | 'press' | 'release' | 'bend' | 'error' | 'confirm';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tick: 8,
  press: 14,
  release: 10,
  bend: 18,
  error: [12, 40, 12],
  confirm: [10, 30, 22],
};

let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

/**
 * Vibración háptica best-effort. En iOS Safari el motor de vibración no está
 * disponible, pero no rompe nada: la app sigue siendo usable al tacto.
 */
export function haptic(pattern: HapticPattern = 'tick'): void {
  if (!enabled) return;
  const nav =
    typeof navigator === 'undefined'
      ? undefined
      : (navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean }).vibrate;
  if (!nav) return;
  try {
    (nav as (pattern: number | number[]) => boolean).call(navigator, PATTERNS[pattern]);
  } catch {
    /* ignorado a propósito */
  }
}
