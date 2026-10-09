import { describe, expect, it } from 'vitest';
import { MODULES, MODULE_ORDER, clampParam, defaultModuleState, mergeModuleState } from './patch';
import { PRESETS, reviveState } from '../state/presets';

describe('rack de módulos', () => {
  it('todos los parámetros tienen valores por defecto dentro de rango', () => {
    for (const def of Object.values(MODULES)) {
      for (const param of def.params) {
        expect(param.default).toBeGreaterThanOrEqual(param.min);
        expect(param.default).toBeLessThanOrEqual(param.max);
      }
    }
  });

  it('el orden del rack incluye la voz y el master', () => {
    expect(MODULE_ORDER).toContain('master');
    expect(MODULE_ORDER).toHaveLength(8);
  });

  it('crea un estado por defecto completo', () => {
    const state = defaultModuleState();
    expect(Object.keys(state).sort()).toEqual(Object.keys(MODULES).sort());
    expect(state.voice.params.cutoff).toBe(MODULES.voice.params.find((p) => p.id === 'cutoff')!.default);
  });

  it('fusiona un preset sin perder los parámetros que no menciona', () => {
    const base = defaultModuleState();
    base.drive.params.drive = 0.9;
    const merged = mergeModuleState(base, { voice: { enabled: true, params: { cutoff: 5000 } } });
    expect(merged.voice.params.cutoff).toBe(5000);
    expect(merged.voice.params.release).toBe(base.voice.params.release);
    expect(merged.drive.params.drive).toBe(0.9);
  });

  it('no muta el estado original al fusionar', () => {
    const base = defaultModuleState();
    const snapshot = base.voice.params.cutoff;
    mergeModuleState(base, { voice: { enabled: true, params: { cutoff: 900 } } });
    expect(base.voice.params.cutoff).toBe(snapshot);
  });

  it('los presets son válidos y distintos entre sí', () => {
    const ids = new Set<string>();
    for (const preset of PRESETS) {
      expect(ids.has(preset.id)).toBe(false);
      ids.add(preset.id);
      for (const module of Object.keys(MODULES) as (keyof typeof MODULES)[]) {
        expect(preset.modules[module]).toBeDefined();
      }
    }
  });

  it('los presets usan parámetros válidos', () => {
    for (const preset of PRESETS) {
      for (const id of Object.keys(preset.modules) as (keyof typeof MODULES)[]) {
        for (const param of MODULES[id].params) {
          const value = preset.modules[id].params[param.id];
          if (value === undefined) continue;
          expect(clampParam(param, value)).toBe(value);
        }
      }
    }
  });

  it('cuantiza a los valores permitidos de un parámetro discreto', () => {
    const stages = MODULES.phaser.params.find((param) => param.id === 'stages')!;
    expect(clampParam(stages, 5)).toBe(4);
    expect(clampParam(stages, 7.9)).toBe(8);
  });
});

describe('estado guardado', () => {
  it('rellena huecos y descarta valores imposibles', () => {
    const revived = reviveState({
      settings: { layout: 'círculo', scaleId: 'klingon', theme: 'neón', baseOctave: 4 },
      modules: { voice: { params: { cutoff: 1200 } } },
      presetId: 'laton',
    });
    expect(revived.settings.layout).toBe('guitar');
    expect(revived.settings.scaleId).toBe('chromatic');
    expect(revived.settings.theme).toBe('noche');
    expect(revived.settings.baseOctave).toBe(4);
    expect(revived.settings.octaves).toBe(2);
    expect(revived.modules.voice.params.cutoff).toBe(1200);
    expect(revived.modules.voice.params.release).toBe(MODULES.voice.params.find((p) => p.id === 'release')!.default);
    expect(revived.presetId).toBe('laton');
  });

  it('acepta basura sin romperse', () => {
    expect(reviveState(null).settings.layout).toBe('guitar');
    expect(reviveState('nope').modules.voice.params.cutoff).toBeGreaterThan(0);
  });
});
