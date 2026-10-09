import { MODULES, MODULE_ORDER, type ModuleDef, type ModuleId, type ModuleState } from '../audio/patch';
import { haptic } from '../core/haptics';
import { el, segmented, toast } from './dom';
import { knob } from './knob';

export interface RackOptions {
  getState: () => ModuleState;
  onParam: (module: ModuleId, id: string, value: number) => void;
  onEnable: (module: ModuleId, enabled: boolean) => void;
  onPreset: (id: string) => void;
  getPresetId: () => string | null;
  presets: { id: string; name: string; hint: string }[];
}

/**
 * El rack es la parte "modular" del instrumento: cada módulo se puede
 * saltar, restablecer y asignar a las teclas de volumen del teléfono.
 */
export function buildRack(options: RackOptions): { element: HTMLElement; refresh(): void } {
  const element = el('div', { class: 'rack' });
  const knobRefs = new Map<string, (value: number) => void>();
  const modules = new Map<ModuleId, { def: ModuleDef; card: HTMLElement; bypass: HTMLButtonElement; reset: HTMLButtonElement }>();

  const presetBar = el('div', { class: 'rack-presets' });
  const rebuildPresets = () => {
    presetBar.replaceChildren(
      segmented(
        options.presets.map((preset) => ({ value: preset.id, label: preset.name })),
        options.getPresetId() ?? options.presets[0].id,
        (id) => {
          haptic('confirm');
          options.onPreset(id);
          const preset = options.presets.find((p) => p.id === id);
          if (preset) toast(`${preset.name}: ${preset.hint}`, 2600);
          refresh();
        },
      ).element,
    );
  };

  for (const id of MODULE_ORDER) {
    const def = MODULES[id];
    const state = options.getState()[id];
    const bypass = el('button', { class: 'chip chip-toggle', type: 'button' }, [state.enabled ? 'ACTIVO' : 'SALTADO']);
    const reset = el('button', { class: 'chip chip-ghost', type: 'button', 'aria-label': `Restablecer ${def.name}` }, ['↺']);
    const params = el('div', { class: 'module-params' });
    for (const param of def.params) {
      const control = knob({
        def: param,
        value: state.params[param.id] ?? param.default,
        onChange: (value) => options.onParam(id, param.id, value),
        onCommit: () => haptic('tick'),
      });
      knobRefs.set(`${id}.${param.id}`, control.setValue);
      params.append(control.element);
    }
    const card = el('article', { class: 'module', 'data-module': id, style: `--module-color:${def.color}` }, [
      el('header', { class: 'module-head' }, [
        el('span', { class: 'module-name', text: def.name }),
        el('span', { class: 'module-blurb', text: def.blurb }),
      ]),
      params,
      el('footer', { class: 'module-foot' }, [bypass, reset]),
    ]);
    bypass.classList.toggle('is-off', !state.enabled);
    bypass.addEventListener('click', () => {
      const next = !options.getState()[id].enabled;
      options.onEnable(id, next);
      bypass.textContent = next ? 'ACTIVO' : 'SALTADO';
      bypass.classList.toggle('is-off', !next);
      haptic(next ? 'press' : 'tick');
    });
    reset.addEventListener('click', () => {
      for (const param of def.params) options.onParam(id, param.id, param.default);
      refresh();
      haptic('tick');
    });
    modules.set(id, { def, card, bypass, reset });
    element.append(card);
  }

  function refresh(): void {
    const state = options.getState();
    rebuildPresets();
    for (const [id, entry] of modules) {
      const moduleState = state[id];
      entry.bypass.textContent = moduleState.enabled ? 'ACTIVO' : 'SALTADO';
      entry.bypass.classList.toggle('is-off', !moduleState.enabled);
      for (const param of entry.def.params) {
        const ref = knobRefs.get(`${id}.${param.id}`);
        ref?.(moduleState.params[param.id] ?? param.default);
      }
    }
  }

  rebuildPresets();
  element.prepend(presetBar);
  return { element, refresh };
}
