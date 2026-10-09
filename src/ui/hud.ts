import { haptic } from '../core/haptics';
import { describeBend, midiToLabel, type AccidentalPreference } from '../music/theory';
import type { AppSettings, ModuleState } from '../audio/patch';
import { el, segmented, toggleButton } from './dom';

export interface HudOptions {
  getSettings: () => AppSettings;
  onSettings: (patch: Partial<AppSettings>) => void;
  onOpenRack: () => void;
  onOpenSettings: () => void;
  onSustain: (active: boolean) => void;
  onArpCycle: () => void;
  onLooper: () => void;
  onClearLoop: () => void;
  getLoopEvents: () => number;
}

export interface Hud {
  element: HTMLElement;
  setLevel(level: number): void;
  setReadout(midi: number, bend: number, vibrato: number): void;
  setVoices(count: number): void;
  setStatus(status: string): void;
  refresh(settings: AppSettings, modules: ModuleState): void;
  sustain: { setActive(active: boolean): void; element: HTMLButtonElement };
}

const ARP_LABELS: Record<AppSettings['arpMode'], string> = {
  off: 'Arp',
  up: 'Arp ▲',
  down: 'Arp ▼',
  updown: 'Arp ⇅',
  random: 'Arp ?',
  chord: 'Acorde',
};

export function buildHud(options: HudOptions): Hud {
  const octaveDown = el('button', { class: 'chip chip-step', type: 'button', 'aria-label': 'Octava abajo' }, ['−']);
  const octaveUp = el('button', { class: 'chip chip-step', type: 'button', 'aria-label': 'Octava arriba' }, ['+']);
  const octaveLabel = el('span', { class: 'octave-label', text: 'C3' });
  const layoutPicker = segmented(
    [
      { value: 'guitar' as const, label: 'Guitarra' },
      { value: 'harmonica' as const, label: 'Fila' },
      { value: 'grid' as const, label: 'Cuadrícula' },
    ],
    options.getSettings().layout,
    (value) => options.onSettings({ layout: value }),
  );

  const rackButton = el('button', { class: 'chip chip-primary', type: 'button' }, ['Rack']);
  const settingsButton = el('button', { class: 'chip chip-ghost', type: 'button' }, ['⋯']);
  rackButton.addEventListener('click', options.onOpenRack);
  settingsButton.addEventListener('click', options.onOpenSettings);

  const top = el('header', { class: 'hud-top' }, [
    el('div', { class: 'hud-group' }, [octaveDown, octaveLabel, octaveUp]),
    layoutPicker.element,
    el('div', { class: 'hud-group hud-group-end' }, [rackButton, settingsButton]),
  ]);

  const readout = el('span', { class: 'readout-note', text: '—' });
  const readoutExtra = el('span', { class: 'readout-extra', text: '' });
  const voicesLabel = el('span', { class: 'voice-count', text: '0' });
  const meterFill = el('i', { class: 'meter-fill' });
  const meter = el('div', { class: 'meter', role: 'meter', 'aria-label': 'Nivel' }, [meterFill]);
  const status = el('span', { class: 'status', text: '' });

  const sustain = toggleButton('Sustain', 'chip chip-toggle', (active) => {
    haptic(active ? 'press' : 'release');
    options.onSustain(active);
  });

  const arpButton = el('button', { class: 'chip chip-toggle', type: 'button' }, [ARP_LABELS.off]);
  arpButton.addEventListener('click', () => {
    options.onArpCycle();
    haptic('tick');
  });

  const loopButton = el('button', { class: 'chip chip-toggle', type: 'button' }, ['Loop']);
  loopButton.addEventListener('click', () => {
    options.onLooper();
    haptic('confirm');
  });

  const loopClear = el('button', { class: 'chip chip-ghost', type: 'button', text: 'Limpiar' });
  loopClear.addEventListener('click', () => options.onClearLoop());

  const installButton = el('button', { class: 'chip chip-primary', type: 'button', id: 'install', hidden: true }, ['Instalar']);

  const bottom = el('footer', { class: 'hud-bottom' }, [
    el('div', { class: 'readout' }, [readout, readoutExtra, voicesLabel]),
    el('div', { class: 'hud-transport' }, [sustain.element, arpButton, loopButton, loopClear, installButton]),
    meter,
  ]);

  const banner = el('div', { class: 'banner', hidden: true }, [status]);
  const element = el('div', { class: 'hud' }, [top, bottom, banner]);

  octaveDown.addEventListener('click', () => {
    const settings = options.getSettings();
    options.onSettings({ baseOctave: Math.max(1, settings.baseOctave - 1) });
    haptic('tick');
  });
  octaveUp.addEventListener('click', () => {
    const settings = options.getSettings();
    options.onSettings({ baseOctave: Math.min(6, settings.baseOctave + 1) });
    haptic('tick');
  });

  let level = 0;
  return {
    element,
    setLevel(next: number) {
      level += (next - level) * 0.35;
      meterFill.style.transform = `scaleX(${Math.min(1, level)})`;
      meter.classList.toggle('is-hot', level > 0.92);
    },
    setReadout(midi: number, bend: number, vibrato: number) {
      const settings = options.getSettings();
      const pref: AccidentalPreference = settings.accidental;
      readout.textContent = Number.isFinite(midi) ? describeBend(midi, bend, pref) : '—';
      readout.classList.toggle('is-bend-up', bend > 0.05);
      readout.classList.toggle('is-bend-down', bend < -0.05);
      const bits: string[] = [];
      if (Math.abs(bend) > 0.02) bits.push(`${bend > 0 ? '+' : '−'}${Math.abs(Math.round(bend * 100))}¢`);
      if (vibrato > 0.01) bits.push(`vib ${vibrato.toFixed(2)}`);
      readoutExtra.textContent = bits.join(' · ');
    },
    setVoices(count: number) {
      voicesLabel.textContent = String(count);
    },
    setStatus(text: string) {
      status.textContent = text;
      banner.hidden = text.length === 0;
    },
    refresh(settings: AppSettings, modules: ModuleState) {
      layoutPicker.setActive(settings.layout);
      octaveLabel.textContent = midiToLabel((settings.baseOctave + 1) * 12, settings.accidental);
      arpButton.textContent = ARP_LABELS[settings.arpMode];
      arpButton.classList.toggle('is-active', settings.arpMode !== 'off');
      const hasLoop = options.getLoopEvents() > 0;
      loopButton.classList.toggle('is-active', settings.looper && hasLoop);
      loopClear.hidden = !hasLoop;
      void modules;
    },
    sustain,
  };
}
