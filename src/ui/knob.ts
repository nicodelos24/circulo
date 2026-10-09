import { clamp, formatValue, fromNormalized, toNormalized } from '../core/math';
import type { ParamDef } from '../audio/patch';
import { el } from './dom';

const DRAG_SENSITIVITY = 220;

export interface KnobOptions {
  def: ParamDef;
  value: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}

/**
 * Perilla táctil: arrastra verticalmente, funciona con rueda, flechas del
 * teclado y doble toque para volver al valor por defecto. Los parámetros con
 * opciones discretas (onda, etapas...) saltan de opción en lugar de
 * interpolar.
 */
export function knob(options: KnobOptions): { element: HTMLElement; setValue(value: number): void } {
  const { def } = options;
  let value = options.value;
  const arc = el('div', { class: 'knob-arc' });
  const fill = el('div', { class: 'knob-fill' });
  const pointer = el('div', { class: 'knob-pointer' });
  const readout = el('span', { class: 'knob-value' });
  const label = el('span', { class: 'knob-label', text: def.label });
  const dial = el('div', { class: 'knob-dial', role: 'slider', tabindex: '0', 'aria-label': def.label }, [arc, fill, pointer]);
  const element = el('div', { class: 'knob', 'data-param': def.id }, [dial, readout, label]);

  const paint = () => {
    const ratio = def.options
      ? optionsCount(def) > 1
        ? (def.options?.findIndex((option) => option.value === value) ?? 0) / (optionsCount(def) - 1)
        : 0
      : toNormalized(value, def.curve, def.min, def.max);
    const angle = -135 + ratio * 270;
    fill.style.transform = `rotate(${-135 + ratio * 270}deg)`;
    fill.style.height = `${Math.max(6, ratio * 50)}%`;
    pointer.style.transform = `rotate(${angle}deg)`;
    readout.textContent = def.options
      ? (def.options?.find((option) => option.value === value)?.label ?? formatValue(value))
      : formatValue(value, def.unit);
    element.classList.toggle('is-modified', Math.abs(value - def.default) > (def.max - def.min) * 0.005);
    element.setAttribute('aria-valuenow', String(value));
  };

  const commit = (next: number, notify: boolean) => {
    const clamped = clamp(next, def.min, def.max);
    const stepped = def.options
      ? nearestOption(def, clamped)
      : clamped;
    if (stepped === value && !notify) {
      paint();
      return;
    }
    value = stepped;
    paint();
    options.onChange(value);
    if (notify) options.onCommit?.(value);
  };

  let dragging = false;
  let startY = 0;
  let startValue = 0;
  let moved = false;

  dial.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    dragging = true;
    moved = false;
    startY = event.clientY;
    startValue = value;
    dial.setPointerCapture(event.pointerId);
    element.classList.add('is-active');
  });

  dial.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const delta = startY - event.clientY;
    if (Math.abs(delta) > 3) moved = true;
    if (def.options) {
      const steps = Math.round(delta / 26);
      const index = clamp((def.options?.findIndex((option) => option.value === nearestOption(def, value)) ?? 0) + steps, 0, (def.options?.length ?? 1) - 1);
      commit(def.options?.[index].value ?? value, false);
      return;
    }
    const next = fromNormalized(toNormalized(startValue, def.curve, def.min, def.max) + delta / DRAG_SENSITIVITY, def.curve, def.min, def.max);
    commit(next, false);
  });

  const stop = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    element.classList.remove('is-active');
    if (dial.hasPointerCapture(event.pointerId)) dial.releasePointerCapture(event.pointerId);
    if (!moved) options.onCommit?.(value);
  };
  dial.addEventListener('pointerup', stop);
  dial.addEventListener('pointercancel', stop);

  dial.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const step = (def.max - def.min) * (event.shiftKey ? 0.005 : 0.03);
      if (def.options) {
        const index = clamp((def.options?.findIndex((option) => option.value === value) ?? 0) + (event.deltaY > 0 ? 1 : -1), 0, (def.options?.length ?? 1) - 1);
        commit(def.options?.[index].value ?? value, false);
        return;
      }
      commit(value - Math.sign(event.deltaY) * step, false);
    },
    { passive: false },
  );

  dial.addEventListener('keydown', (event) => {
    const step = (def.max - def.min) * (event.shiftKey ? 0.01 : 0.05);
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') commit(value + step, false);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') commit(value - step, false);
    else if (event.key === 'Home') commit(def.default, true);
    else return;
    event.preventDefault();
  });

  dial.addEventListener('dblclick', () => commit(def.default, true));

  paint();
  return {
    element,
    setValue(next: number) {
      value = next;
      paint();
    },
  };
}

function optionsCount(def: ParamDef): number {
  return def.options?.length ?? 0;
}

function nearestOption(def: ParamDef, value: number): number {
  const options = def.options ?? [];
  let best = options[0]?.value ?? value;
  for (const option of options) {
    if (Math.abs(option.value - value) < Math.abs(best - value)) best = option.value;
  }
  return best;
}
