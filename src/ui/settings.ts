import { SCALE_LIST, midiToLabel } from '../music/theory';
import { haptic } from '../core/haptics';
import type { AppSettings, ModuleState } from '../audio/patch';
import type { LayoutId } from '../audio/patch';
import { el, segmented } from './dom';

const LAYOUT_LABELS: Record<LayoutId, string> = {
  guitar: 'Guitarra',
  harmonica: 'Fila',
  grid: 'Cuadrícula',
};

export interface SettingsPanelOptions {
  getSettings: () => AppSettings;
  getModules: () => ModuleState;
  onSettings: (patch: Partial<AppSettings>) => void;
  onModuleParam: (module: keyof ModuleState, id: string, value: number) => void;
  onReset: () => void;
}

/** Ajustes de ergonomía y de tono, en una hoja inferior. */
export function buildSettingsPanel(options: SettingsPanelOptions): { element: HTMLElement; refresh(): void } {
  const element = el('div', { class: 'settings' });
  const refreshers: (() => void)[] = [];

  const row = (title: string, hint: string, control: HTMLElement) =>
    el('div', { class: 'setting' }, [
      el('div', { class: 'setting-text' }, [el('strong', { text: title }), el('span', { text: hint })]),
      control,
    ]);

  const slider = (
    _label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    set: (value: number) => void,
    format: (value: number) => string = (value) => value.toFixed(2),
  ) => {
    const input = el('input', { type: 'range', min, max, step, value: get() });
    const out = el('span', { class: 'setting-value', text: format(get()) });
    input.addEventListener('input', () => {
      const value = Number(input.value);
      out.textContent = format(value);
      set(value);
    });
    refreshers.push(() => {
      input.value = String(get());
      out.textContent = format(get());
    });
    return el('label', { class: 'setting-control' }, [out, input]);
  };

  const toggle = (get: () => boolean, set: (value: boolean) => void) => {
    const button = el('button', { class: 'switch', type: 'button', role: 'switch' }, [el('span', { class: 'switch-knob' })]);
    const paint = () => {
      const on = get();
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-checked', String(on));
    };
    button.addEventListener('click', () => {
      set(!get());
      paint();
      haptic('tick');
    });
    paint();
    refreshers.push(paint);
    return button;
  };

  const choose = <T extends string>(
    values: T[],
    get: () => T,
    set: (value: T) => void,
    label: (value: T) => string = (value) => value,
  ) => {
    const control = segmented(
      values.map((value) => ({ value, label: label(value) })),
      get(),
      (value) => {
        set(value);
        haptic('tick');
      },
    );
    refreshers.push(() => control.setActive(get()));
    return control.element;
  };

  // --- Ergonomía -------------------------------------------------------
  const S = () => options.getSettings();
  element.append(
    el('h3', { class: 'settings-group', text: 'Ergonomía' }),
    row('Diseño', 'guitarra en arco, fila o cuadrícula', choose<LayoutId>(
      ['guitar', 'harmonica', 'grid'],
      () => S().layout,
      (value) => options.onSettings({ layout: value }),
      (value) => LAYOUT_LABELS[value],
    )),
    row('Octavas', 'cuántas notas caben en la pantalla', slider('octaves', 1, 4, 1, () => S().octaves, (value) => options.onSettings({ octaves: value }), (value) => String(value))),
    row('Octava base', 'nota más grave del tablero', slider('base', 1, 6, 1, () => S().baseOctave, (value) => options.onSettings({ baseOctave: value }), (value) => `C${value}`)),
    row('Etiquetas', 'nombres de nota o solfeo', choose(['notes', 'solfege'] as const, () => S().labelStyle, (value) => options.onSettings({ labelStyle: value }))),
    row('Bemoles', 'escribir los accidentales con bemol', toggle(() => S().accidental === 'flats', (value) => options.onSettings({ accidental: value ? 'flats' : 'sharps' }))),
    row('Mostrar nombres', 'texto dentro de los círculos', toggle(() => S().showLabels, (value) => options.onSettings({ showLabels: value }))),
    row('Multi-táctil', 'varias notas simultáneas con varios dedos', toggle(() => S().multiTouch, (value) => options.onSettings({ multiTouch: value }))),
    row('Glissando', 'arrastrar entre notas sin cortar', toggle(() => S().glide, (value) => options.onSettings({ glide: value }))),
    row('Vibración', 'respuesta háptica al tocar y al doblar', toggle(() => S().haptics, (value) => options.onSettings({ haptics: value }))),

    el('h3', { class: 'settings-group', text: 'Bend y vibrato' }),
    row('Bend máximo ▲', 'semitonos hacia el sostenido', slider('bendUp', 0, 5, 1, () => S().bendUp, (value) => options.onSettings({ bendUp: value }), (value) => `+${value}`)),
    row('Bend máximo ▼', 'semitonos hacia el bemol', slider('bendDown', 0, 5, 1, () => S().bendDown, (value) => options.onSettings({ bendDown: value }), (value) => `-${value}`)),
    row('Recorrido', 'píxeles para el bend completo', slider('travel', 40, 260, 5, () => S().bendTravel, (value) => options.onSettings({ bendTravel: value }), (value) => `${value}px`)),
    row('Retorno elástico', 'el bend vuelve al centro si paras el dedo', toggle(() => S().springReturn, (value) => options.onSettings({ springReturn: value }))),
    row('Marcar escala', 'el Bend sugiere la nota de destino', toggle(() => S().snapBend, (value) => options.onSettings({ snapBend: value }))),
    row('Vibrato', 'sensibilidad al vaivén del dedo', slider('vib', 0, 1, 0.05, () => S().vibratoDepth, (value) => options.onSettings({ vibratoDepth: value }))),
    row('Vibrato por balanceo', 'mover el teléfono aplica vibrato', toggle(() => S().tiltVibrato, (value) => options.onSettings({ tiltVibrato: value }))),
    row('Amplitud por balanceo', 'cuánto vibra el teléfono', slider('tilt', 0, 1, 0.05, () => S().tiltDepth, (value) => options.onSettings({ tiltDepth: value }))),

    el('h3', { class: 'settings-group', text: 'Música' }),
    row('Escala', 'para resaltar los grados', choose(
      SCALE_LIST.map((scale) => scale.id),
      () => S().scaleId,
      (value) => options.onSettings({ scaleId: value }),
      (value) => SCALE_LIST.find((scale) => scale.id === value)?.name ?? value,
    )),
    row('Tónica', 'nota de referencia', slider('root', 0, 11, 1, () => S().rootPc, (value) => options.onSettings({ rootPc: value }), (value) => midiToLabel(60 + value))),
    row('Cuantizar', 'las notas nuevas caen en la escala', toggle(() => S().quantizeNotes, (value) => options.onSettings({ quantizeNotes: value }))),

    el('h3', { class: 'settings-group', text: 'Interfaz' }),
    row('Tema', 'paleta del tablero', choose(['noche', 'grafito', 'amanecer'] as const, () => S().theme, (value) => options.onSettings({ theme: value }))),
    row('Movimiento reducido', 'menos animación y glow', toggle(() => S().reduceMotion, (value) => options.onSettings({ reduceMotion: value }))),
    el('div', { class: 'settings-footer' }, [
      (() => {
        const button = el('button', { class: 'chip chip-ghost', type: 'button', text: 'Restablecer todo' });
        button.addEventListener('click', () => {
          options.onReset();
          refresh();
          haptic('confirm');
        });
        return button;
      })(),
    ]),
  );

  function refresh(): void {
    for (const fn of refreshers) fn();
  }
  return { element, refresh };
}
