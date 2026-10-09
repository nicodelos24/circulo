import { MODULES, type ModuleId, type ModuleState } from './patch';
import type { FromWorklet, ToWorklet, VoicePatch } from './protocol';

export interface EngineState {
  ready: boolean;
  running: boolean;
  sampleRate: number;
  error: string | null;
}

export interface EngineOptions {
  workletUrl?: string;
  contextOptions?: AudioContextOptions;
}

/**
 * Puente entre la interfaz y el AudioWorklet. Concentra el estado del
 * AudioContext, el arranque diferido (los navegadores exigen un gesto) y el
 * envío de mensajes, filtrando los que no cambian para no saturar el puerto.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private readonly lastParams = new Map<string, number>();
  private readonly lastEnabled = new Map<ModuleId, boolean>();
  private readonly lastPatches = new Map<number, string>();
  private meterListeners = new Set<(report: FromWorklet) => void>();
  private readyPromise: Promise<void> | null = null;
  private pending: ToWorklet[] = [];
  private options: EngineOptions;
  private snapshot: EngineState = { ready: false, running: false, sampleRate: 0, error: null };
  private stateListeners = new Set<(state: EngineState) => void>();

  constructor(options: EngineOptions = {}) {
    this.options = options;
  }

  get state(): EngineState {
    return this.snapshot;
  }

  onState(listener: (state: EngineState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onMeter(listener: (report: FromWorklet) => void): () => void {
    this.meterListeners.add(listener);
    return () => this.meterListeners.delete(listener);
  }

  private emitState(patch: Partial<EngineState>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of [...this.stateListeners]) listener(this.snapshot);
  }

  private get workletUrl(): string {
    if (this.options.workletUrl) return this.options.workletUrl;
    const base = typeof document === 'undefined' ? 'http://localhost/' : document.baseURI;
    return new URL('worklet/synth-processor.js', base).href;
  }

  /** Crea el contexto y carga el processor. Es idempotente. */
  async init(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = (async () => {
      try {
        const Ctor: typeof AudioContext =
          window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.context = new Ctor({ latencyHint: 'interactive', ...(this.options.contextOptions ?? {}) });
        await this.context.audioWorklet.addModule(this.workletUrl);
        const node = new AudioWorkletNode(this.context, 'circulo-synth', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        node.port.onmessage = (event: MessageEvent) => {
          const report = event.data as FromWorklet;
          if (report?.type !== 'meter') return;
          for (const listener of [...this.meterListeners]) listener(report);
        };
        node.connect(this.context.destination);
        this.node = node;
        this.emitState({ ready: true, sampleRate: this.context.sampleRate, error: null });
        this.flushPending();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.readyPromise = null;
        this.emitState({ ready: false, error: message });
        throw error;
      }
    })();
    return this.readyPromise;
  }

  /** Se llama desde el primer toque: los navegadores mobile lo exigen. */
  async unlock(): Promise<void> {
    await this.init();
    if (this.context?.state === 'suspended') {
      await this.context.resume();
    }
    this.emitState({ running: this.context?.state === 'running' });
  }

  get audioContext(): AudioContext | null {
    return this.context;
  }

  private post(message: ToWorklet): void {
    if (!this.node) {
      // El primer toque llega antes de que el worklet termine de cargar:
      // se encola para que esa primera nota no se pierda.
      this.pending.push(message);
      if (this.pending.length > 64) this.pending.shift();
      return;
    }
    this.node.port.postMessage(message);
  }

  private flushPending(): void {
    if (!this.node) return;
    const queued = this.pending.splice(0, this.pending.length);
    for (const message of queued) this.node.port.postMessage(message);
  }

  noteOn(id: number, midi: number, velocity: number, pan = 0): void {
    this.post({ type: 'noteOn', id, midi, velocity, pan });
    this.lastPatches.delete(id);
  }

  noteOff(id: number): void {
    this.post({ type: 'noteOff', id });
    this.lastPatches.delete(id);
  }

  allOff(): void {
    this.post({ type: 'allOff' });
    this.lastPatches.clear();
  }

  /** Solo se envía si el valor cambió de verdad (evita inundar el puerto). */
  patch(id: number, patch: VoicePatch): void {
    const key = JSON.stringify(patch);
    if (this.lastPatches.get(id) === key) return;
    this.lastPatches.set(id, key);
    this.post({ type: 'patch', id, patch });
  }

  setParam(module: ModuleId, id: string, value: number): void {
    const key = `${module}.${id}`;
    if (this.lastParams.get(key) === value) return;
    this.lastParams.set(key, value);
    this.post({ type: 'param', module, id, value });
  }

  setEnabled(module: ModuleId, enabled: boolean): void {
    if (this.lastEnabled.get(module) === enabled) return;
    this.lastEnabled.set(module, enabled);
    this.post({ type: 'enable', module, enabled });
  }

  /** Vuelca todo el estado del rack al worklet (al cargar un preset, por ejemplo). */
  syncModules(modules: ModuleState): void {
    this.lastParams.clear();
    this.lastEnabled.clear();
    for (const moduleId of Object.keys(modules) as ModuleId[]) {
      const state = modules[moduleId];
      this.setEnabled(moduleId, state.enabled);
      for (const param of MODULES[moduleId].params) {
        const value = state.params[param.id];
        if (typeof value === 'number') this.setParam(moduleId, param.id, value);
      }
    }
  }

  async suspend(): Promise<void> {
    if (this.context && this.context.state === 'running') await this.context.suspend();
    this.emitState({ running: false });
  }

  async close(): Promise<void> {
    this.node?.disconnect();
    await this.context?.close();
    this.node = null;
    this.context = null;
    this.readyPromise = null;
    this.emitState({ ready: false, running: false });
  }
}
