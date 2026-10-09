import { AudioEngine } from './audio/engine';
import { DEFAULT_SETTINGS, defaultModuleState, mergeModuleState, type ModuleId } from './audio/patch';
import { PersistentStore } from './core/store';
import { haptic, setHapticsEnabled } from './core/haptics';
import { clamp } from './core/math';
import { SCALES, scaleMask } from './music/theory';
import { PRESETS, initialState, reviveState } from './state/presets';
import { Arpeggiator, type ArpNote } from './input/arpeggiator';
import { Looper } from './input/looper';
import { KeyboardInput } from './input/keyboard';
import { MotionInput, WakeLock, lockOrientation } from './input/motion';
import { PointerSurface } from './input/pointer-surface';
import { THEMES, renderBoard, resizeCanvas } from './ui/board';
import { el, sheet, toast } from './ui/dom';
import { GestureRecognizer, type GestureConfig, type TouchState } from './ui/gestures';
import { computeLayout, type Layout } from './ui/layout';
import { buildHud } from './ui/hud';
import { buildRack } from './ui/rack';
import { buildSettingsPanel } from './ui/settings';

interface AppState {
  settings: typeof DEFAULT_SETTINGS;
  modules: ReturnType<typeof defaultModuleState>;
  presetId: string | null;
}

const STORAGE_KEY = 'circulo.state.v1';

export class App {
  private readonly store = new PersistentStore<AppState>(initialState(), STORAGE_KEY, undefined, reviveState);
  private readonly engine = new AudioEngine();
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly host: HTMLElement;

  private layout: Layout = { pads: [], bounds: { x: 0, y: 0, width: 0, height: 0 }, radius: 0, layout: 'guitar' };
  private recognizer!: GestureRecognizer;
  private surface!: PointerSurface;
  private arp!: Arpeggiator;
  private looper!: Looper;
  private motion!: MotionInput;
  private wakeLock = new WakeLock();
  private keyboard!: KeyboardInput;

  private sustain = false;
  private sustainedVoices = new Map<number, number>();
  /** Último semitono de bend por dedo, para el clic háptico por tono. */
  private readonly bendSteps = new Map<number, number>();
  private activeNotes = new Set<number>();
  private level = 0;
  private tiltDepth = 0;
  private frame = 0;
  private readoutMidi = Number.NaN;
  private arpVoiceId = 1_000_000;

  private rackSheet = sheet('rack', 'Rack modular');
  private settingsSheet = sheet('settings', 'Ajustes');
  private hud!: ReturnType<typeof buildHud>;
  private rackView!: ReturnType<typeof buildRack>;
  private settingsView!: ReturnType<typeof buildSettingsPanel>;

  constructor(host: HTMLElement) {
    this.host = host;
    this.canvas = el('canvas', { class: 'board', 'aria-label': 'Tablero de notas' });
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D no disponible');
    this.context = context;

    setHapticsEnabled(this.store.get().settings.haptics);
    this.engine.onMeter((report) => {
      this.level = clamp(report.peak, 0, 1);
    });
    this.buildUi();
    this.bindStore();
    this.bindLifecycle();
    this.resize();
    this.loop();
  }

  private get settings() {
    return this.store.get().settings;
  }

  private get modules() {
    return this.store.get().modules;
  }

  // -------------------------------------------------------------- interfaz

  private buildUi(): void {
    this.recognizer = new GestureRecognizer(this.gestureConfig(), {
      onNoteOn: (touch) => this.handleNoteOn(touch),
      onNoteOff: (touch) => this.handleNoteOff(touch),
      onUpdate: (touch, changes) => this.handleTouchUpdate(touch, changes),
      onPan: (touch, pan) => this.engine.patch(touch.pointerId, { ...this.patchFor(touch), pan }),
    });

    this.hud = buildHud({
      getSettings: () => this.settings,
      onSettings: (patch) => this.updateSettings(patch),
      onOpenRack: () => this.rackSheet.toggle(),
      onOpenSettings: () => this.settingsSheet.toggle(),
      onSustain: (active) => this.setSustain(active),
      onArpCycle: () => this.cycleArp(),
      onLooper: () => this.toggleLooper(),
      onClearLoop: () => {
        this.looper.clear();
        this.hud.refresh(this.settings, this.modules);
        toast('Loop borrado');
      },
      getLoopEvents: () => this.looper.length,
    });

    this.rackView = buildRack({
      getState: () => this.modules,
      getPresetId: () => this.store.get().presetId,
      presets: PRESETS.map((preset) => ({ id: preset.id, name: preset.name, hint: preset.hint })),
      onParam: (module, id, value) => this.setParam(module, id, value),
      onEnable: (module, enabled) => this.setEnabled(module, enabled),
      onPreset: (id) => this.applyPreset(id),
    });

    this.settingsView = buildSettingsPanel({
      getSettings: () => this.settings,
      getModules: () => this.modules,
      onSettings: (patch) => this.updateSettings(patch),
      onModuleParam: (module, id, value) => this.setParam(module, id, value),
      onReset: () => {
        this.store.set({ settings: { ...DEFAULT_SETTINGS }, modules: defaultModuleState(), presetId: PRESETS[0].id });
        this.engine.syncModules(this.modules);
        this.applyTheme();
        this.layout = this.buildLayout();
        this.hud.refresh(this.settings, this.modules);
        toast('Ajustes restablecidos');
      },
    });

    this.rackSheet.body.append(this.rackView.element);
    this.settingsSheet.body.append(this.settingsView.element);

    this.host.append(this.canvas, this.hud.element);

    this.surface = new PointerSurface({
      canvas: this.canvas,
      recognizer: this.recognizer,
      getLayout: () => this.layout,
      handlers: {},
      onFirstGesture: () => void this.startAudio(),
    });

    this.arp = new Arpeggiator({
      mode: this.settings.arpMode,
      rate: this.settings.arpRate,
      octaves: this.settings.arpOctaves,
      onNoteOn: (note) => this.triggerArpNote(note, true),
      onNoteOff: (note) => this.triggerArpNote(note, false),
      now: () => performance.now(),
    });

    this.looper = new Looper({
      loopBeats: 4,
      bpm: 96,
      now: () => performance.now(),
      onTrigger: (event, voiceId) => {
        this.engine.noteOn(voiceId, event.midi, event.velocity, event.pan);
        this.activeNotes.add(event.midi);
      },
      onStop: (voiceId) => {
        this.engine.noteOff(voiceId);
        this.readoutMidi = Number.NaN;
      },
    });

    this.motion = new MotionInput({
      enabled: () => this.settings.tiltVibrato,
      depth: () => this.settings.tiltDepth,
      onChange: (state) => {
        this.tiltDepth = clamp((Math.abs(state.speed) / 90) * this.settings.tiltDepth, 0, 2);
      },
    });

    this.keyboard = new KeyboardInput({
      onPress: (midi, velocity) => this.pressKeyboard(midi + this.baseMidi(), velocity),
      onRelease: (midi) => this.releaseKeyboard(midi + this.baseMidi()),
      onOctave: (delta) => this.updateSettings({ baseOctave: clamp(this.settings.baseOctave + delta, 1, 6) }),
      onSustain: (active) => this.setSustain(active),
      onCommand: (command) => {
        if (command === 'rack') this.rackSheet.toggle();
        if (command === 'settings') this.settingsSheet.toggle();
        if (command === 'escape') {
          this.rackSheet.close();
          this.settingsSheet.close();
        }
      },
    });
  }

  private bindStore(): void {
    this.store.subscribe((state, previous) => {
      if (state.settings.haptics !== previous.settings.haptics) setHapticsEnabled(state.settings.haptics);
      if (
        state.settings.layout !== previous.settings.layout ||
        state.settings.octaves !== previous.settings.octaves ||
        state.settings.baseOctave !== previous.settings.baseOctave
      ) {
        this.layout = this.buildLayout();
      }
      this.hud.refresh(state.settings, state.modules);
      this.arp.setOptions({ mode: state.settings.arpMode, rate: state.settings.arpRate, octaves: state.settings.arpOctaves });
    });
    this.engine.syncModules(this.modules);
    this.applyTheme();
    this.layout = this.buildLayout();
    this.hud.refresh(this.settings, this.modules);
  }

  private bindLifecycle(): void {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.recognizer.endAll();
        this.engine.allOff();
      } else {
        void this.engine.unlock();
        void this.wakeLock.acquire();
      }
    });
    window.addEventListener('blur', () => this.recognizer.endAll());
    this.keyboard.attach(window);
    void this.startAudio({ silent: true });
  }

  private async startAudio(options: { silent?: boolean } = {}): Promise<void> {
    try {
      await this.engine.unlock();
      this.engine.syncModules(this.modules);
      void this.wakeLock.acquire();
      void lockOrientation();
      if (MotionInput.needsPermission) await this.motion.requestPermission();
      if (this.settings.tiltVibrato) this.motion.start();
      if (!options.silent) toast('Listo: toca los círculos');
    } catch (error) {
      this.hud.setStatus(`Audio no disponible: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // --------------------------------------------------------------- notas

  private baseMidi(): number {
    return (this.settings.baseOctave + 1) * 12;
  }

  private gestureConfig(): GestureConfig {
    const settings = this.settings;
    return {
      bendTravel: settings.bendTravel,
      bendUp: settings.bendUp,
      bendDown: settings.bendDown,
      springReturn: settings.springReturn,
      vibratoDepth: settings.vibratoDepth,
      vibratoRate: 6,
      vibratoThreshold: 8,
      snapBend: settings.snapBend,
      scaleId: settings.scaleId,
      rootPc: settings.rootPc,
      multiTouch: settings.multiTouch,
      glide: settings.glide,
      hitSlack: 1.35,
      boardWidth: this.layout.bounds.width || window.innerWidth,
    };
  }

  private patchFor(touch: TouchState) {
    const tilt = this.tiltDepth;
    return {
      bend: touch.bend,
      vibratoDepth: clamp(touch.vibratoDepth + tilt, 0, 3),
      vibratoRate: this.settings.vibratoRate,
      pan: 0,
      pressure: clamp(touch.velocity * 0.8 + 0.2, 0, 1),
    };
  }

  private handleNoteOn(touch: TouchState): void {
    void this.startAudio();
    this.bendSteps.set(touch.pointerId, 0);
    const midi = this.resolveMidi(touch.midi);
    touch.midi = midi;
    this.activeNotes.add(midi);
    this.readoutMidi = midi;
    this.engine.noteOn(touch.pointerId, midi, touch.velocity, 0);
    this.engine.patch(touch.pointerId, this.patchFor(touch));
    this.arp.press({ midi, velocity: touch.velocity, pan: 0 });
    this.looper.noteOn(midi, touch.velocity, 0);
    haptic('press');
  }

  private handleNoteOff(touch: TouchState): void {
    this.bendSteps.delete(touch.pointerId);
    this.activeNotes.delete(touch.midi);
    if (this.sustain) {
      this.sustainedVoices.set(touch.pointerId, touch.midi);
    } else {
      this.engine.noteOff(touch.pointerId);
    }
    this.arp.release({ midi: touch.midi, velocity: touch.velocity, pan: 0 });
    this.looper.noteOff(touch.midi);
    haptic('release');
  }

  private handleTouchUpdate(
    touch: TouchState,
    changes: { bend?: boolean; vibrato?: boolean; velocity?: boolean; note?: number },
  ): void {
    if (changes.note !== undefined) {
      const previous = touch.midi;
      this.activeNotes.delete(previous);
      const midi = this.resolveMidi(changes.note);
      touch.midi = midi;
      this.activeNotes.add(midi);
      this.readoutMidi = midi;
      if (this.sustain) {
        this.engine.noteOff(touch.pointerId);
        this.sustainedVoices.delete(touch.pointerId);
        this.engine.noteOn(touch.pointerId, midi, touch.velocity, 0);
      } else {
        this.engine.noteOn(touch.pointerId, midi, touch.velocity, 0);
      }
    }
    if (changes.bend || changes.vibrato || changes.velocity) {
      this.engine.patch(touch.pointerId, this.patchFor(touch));
      // Un clic háptico cada semitono: el dedo "nota" en qué tono cae.
      if (changes.bend) {
        const step = Math.round(touch.bend);
        if (this.bendSteps.get(touch.pointerId) !== step) {
          this.bendSteps.set(touch.pointerId, step);
          if (step !== 0) haptic('bend');
        }
      }
    }
    this.readoutMidi = touch.midi;
  }

  private resolveMidi(midi: number): number {
    if (!this.settings.quantizeNotes || this.settings.scaleId === 'chromatic') return midi;
    const mask = scaleMask(this.settings.scaleId);
    for (let offset = 0; offset < 12; offset += 1) {
      const up = midi + offset;
      const down = midi - offset;
      if ((mask & (1 << (((up - this.settings.rootPc) % 12 + 12) % 12))) !== 0) return up;
      if ((mask & (1 << (((down - this.settings.rootPc) % 12 + 12) % 12))) !== 0) return down;
    }
    return midi;
  }

  private pressKeyboard(midi: number, velocity: number): void {
    void this.startAudio();
    const id = 50_000 + midi;
    this.activeNotes.add(midi);
    this.readoutMidi = midi;
    this.engine.noteOn(id, midi, velocity, 0);
    haptic('tick');
  }

  private releaseKeyboard(midi: number): void {
    this.activeNotes.delete(midi);
    this.engine.noteOff(50_000 + midi);
  }

  private triggerArpNote(note: ArpNote, on: boolean): void {
    if (on) {
      this.activeNotes.add(note.midi);
      this.readoutMidi = note.midi;
      this.engine.noteOn(this.arpVoiceId, note.midi, note.velocity * 0.9, note.pan);
    } else {
      this.activeNotes.delete(note.midi);
      this.engine.noteOff(this.arpVoiceId);
    }
  }

  // ------------------------------------------------------------- ajustes

  private updateSettings(patch: Partial<AppState['settings']>): void {
    this.store.set((state) => ({ ...state, settings: { ...state.settings, ...patch } }));
    this.recognizer.setConfig(this.gestureConfig());
    this.applyTheme();
    this.layout = this.buildLayout();
  }

  private setParam(module: ModuleId, id: string, value: number): void {
    this.store.set((state) => ({
      ...state,
      modules: { ...state.modules, [module]: { ...state.modules[module], params: { ...state.modules[module].params, [id]: value } } },
    }));
    this.engine.setParam(module, id, value);
  }

  private setEnabled(module: ModuleId, enabled: boolean): void {
    this.store.set((state) => ({
      ...state,
      modules: { ...state.modules, [module]: { ...state.modules[module], enabled } },
    }));
    this.engine.setEnabled(module, enabled);
  }

  private applyPreset(id: string): void {
    const preset = PRESETS.find((item) => item.id === id);
    if (!preset) return;
    const modules = mergeModuleState(this.modules, preset.modules);
    this.store.set((state) => ({ ...state, modules, presetId: id }));
    this.engine.syncModules(modules);
    this.rackView.refresh();
  }

  private setSustain(active: boolean): void {
    this.sustain = active;
    this.hud.sustain.setActive(active);
    if (active) return;
    for (const [pointerId] of this.sustainedVoices) this.engine.noteOff(pointerId);
    this.sustainedVoices.clear();
  }

  private cycleArp(): void {
    const order: AppState['settings']['arpMode'][] = ['off', 'up', 'down', 'updown', 'random', 'chord'];
    const index = order.indexOf(this.settings.arpMode);
    const next = order[(index + 1) % order.length];
    this.updateSettings({ arpMode: next });
    toast(next === 'off' ? 'Arpegio desactivado' : `Arpegio: ${next}`);
  }

  private toggleLooper(): void {
    const recording = this.looper.toggle();
    this.hud.refresh(this.settings, this.modules);
    toast(recording ? 'Grabando loop…' : `Loop de ${this.looper.length} notas`);
  }

  private applyTheme(): void {
    document.documentElement.dataset.theme = this.settings.theme;
  }

  // ------------------------------------------------------------- canvas

  private buildLayout(): Layout {
    const rect = this.canvas.getBoundingClientRect();
    return this.compute(rect.width || window.innerWidth, rect.height || window.innerHeight);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    resizeCanvas(this.canvas, width, height);
    this.layout = this.compute(width, height);
    this.recognizer.setConfig(this.gestureConfig());
  }

  /** El tablero ocupa lo que deja libre el HUD, para que el dedo no quede bajo los botones. */
  private hudInsets(): { top: number; bottom: number } {
    const top = this.hud.element.querySelector('.hud-top')?.getBoundingClientRect().height ?? 64;
    const bottom = this.hud.element.querySelector('.hud-bottom')?.getBoundingClientRect().height ?? 76;
    return { top: Math.max(48, top + 12), bottom: Math.max(56, bottom + 12) };
  }

  private compute(width: number, height: number): Layout {
    return computeLayout({
      width,
      height,
      inset: this.hudInsets(),
      layout: this.settings.layout,
      octaves: this.settings.octaves,
      baseOctave: this.settings.baseOctave,
      scaleIntervals: SCALES[this.settings.scaleId].intervals,
      rootPc: this.settings.rootPc,
    });
  }

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    const touches = this.recognizer.active;
    const time = performance.now() / 1000;
    this.recognizer.update();
    this.arp.tick();
    this.looper.tick();
    this.tiltDepth *= 0.94;
    this.level *= 0.9;

    renderBoard(this.context, this.layout, touches, {
      theme: THEMES[this.settings.theme] ?? THEMES.noche,
      accidental: this.settings.accidental,
      labelStyle: this.settings.labelStyle,
      showLabels: this.settings.showLabels,
      bendUp: this.settings.bendUp,
      bendDown: this.settings.bendDown,
      reduceMotion: this.settings.reduceMotion,
      level: this.level,
      time,
      scaleHint: this.settings.scaleId === 'chromatic' ? null : this.settings.rootPc,
      activeNotes: this.activeNotes,
    });

    const focus = touches[touches.length - 1];
    this.hud.setLevel(this.level);
    this.hud.setVoices(this.activeNotes.size);
    if (focus) {
      this.hud.setReadout(focus.midi, focus.bend, focus.vibratoDepth + this.tiltDepth);
    } else if (Number.isFinite(this.readoutMidi)) {
      this.hud.setReadout(this.readoutMidi, 0, this.tiltDepth);
    }
  };

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.surface.destroy();
    this.motion.stop();
    this.wakeLock.release();
    void this.engine.close();
  }
}
