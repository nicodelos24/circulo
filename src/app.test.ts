import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeLayout } from './ui/layout';

/**
 * jsdom no implementa canvas ni Web Audio, así que se inyectan los dos:
 * un contexto 2D que cuenta lo que se pinta y un AudioContext mudo que
 * registra los mensajes que la app manda al AudioWorklet.
 */

interface Gradient {
  addColorStop: (offset: number, color: string) => void;
}

function createContextStub() {
  const calls = { arcs: 0, fills: 0, strokes: 0, texts: [] as string[], clears: 0 };
  const gradient: Gradient = { addColorStop: () => undefined };
  const context = {
    calls,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    clearRect: () => {
      calls.clears += 1;
    },
    fillRect: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    arc: () => {
      calls.arcs += 1;
    },
    moveTo: () => undefined,
    lineTo: () => undefined,
    fill: () => {
      calls.fills += 1;
    },
    stroke: () => {
      calls.strokes += 1;
    },
    save: () => undefined,
    restore: () => undefined,
    setLineDash: () => undefined,
    setTransform: () => undefined,
    fillText: (text: string) => {
      calls.texts.push(text);
    },
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    shadowColor: '',
    shadowBlur: 0,
    lineCap: 'butt',
    globalAlpha: 1,
  };
  return context;
}

const messages: unknown[] = [];
const contexts = new WeakMap<HTMLCanvasElement, ReturnType<typeof createContextStub>>();

function getCtx(canvas: HTMLCanvasElement): ReturnType<typeof createContextStub> {
  const context = contexts.get(canvas);
  if (!context) throw new Error('El canvas no fue pintado');
  return context;
}

class FakeAudioWorkletNode {
  port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: (message: unknown) => {
      messages.push(message);
    },
  };
  connect() {}
  disconnect() {}
}

class FakeAudioContext {
  state = 'running';
  sampleRate = 48000;
  destination = {};
  audioWorklet = { addModule: async () => undefined };
  resume = async () => {
    this.state = 'running';
  };
  suspend = async () => {
    this.state = 'suspended';
  };
  close = async () => undefined;
  createWindow = () => this;
}

beforeAll(() => {
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode);
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: function getContext(this: HTMLCanvasElement) {
      let context = contexts.get(this);
      if (!context) {
        context = createContextStub();
        contexts.set(this, context);
      }
      return context;
    },
  });
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => true });
});

let App: typeof import('./main').App;
let current: { destroy(): void } | null = null;

/** jsdom no implementa PointerEvent: se fabrica uno con las propiedades que usa la app. */
function pointerEvent(type: string, init: { pointerId: number; clientX: number; clientY: number; pressure?: number }): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerType: 'touch', pressure: 0.6, ...init });
  return event;
}

async function mount() {
  if (!App) ({ App } = await import('./main'));
  const host = document.createElement('div');
  host.id = 'app';
  document.body.append(host);
  const app = new App(host);
  current = app;
  await new Promise((resolve) => setTimeout(resolve, 30));
  return { app, host };
}

afterEach(() => {
  current?.destroy();
  current = null;
});

describe('aplicación completa (jsdom)', () => {
  beforeEach(() => {
    messages.length = 0;
    document.body.replaceChildren();
    localStorage.clear();
  });

  it('monta el tablero y pinta los círculos', async () => {
    const { host } = await mount();
    const canvas = host.querySelector('canvas');
    expect(canvas).toBeTruthy();
    const ctx = getCtx(canvas as HTMLCanvasElement);
    expect(ctx.calls.arcs).toBeGreaterThan(20);
    expect(ctx.calls.texts.length).toBeGreaterThan(0);
    expect(ctx.calls.texts.some((text: string) => /^[A-G]/.test(text))).toBe(true);
  });

  it('muestra el HUD con controles de transporte', async () => {
    const { host } = await mount();
    const buttons = [...host.querySelectorAll('button')].map((button) => button.textContent?.trim());
    expect(buttons).toContain('Rack');
    expect(buttons).toContain('Sustain');
    expect(buttons).toContain('Arp');
  });

  it('tocar un círculo manda noteOn al audio', async () => {
    const { host } = await mount();
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    const layout = computeLayout({
      width: window.innerWidth,
      height: window.innerHeight,
      layout: 'guitar',
      octaves: 2,
      baseOctave: 3,
      scaleIntervals: [0, 2, 4, 5, 7, 9, 11],
      rootPc: 0,
    });
    const pad = layout.pads[12];
    canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, clientX: pad.x, clientY: pad.y }));
    canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, clientX: pad.x, clientY: pad.y }));
    const kinds = messages.map((message) => (message as { type: string }).type);
    expect(kinds).toContain('noteOn');
    expect(kinds).toContain('noteOff');
  });

  it('arrastrar el dedo hace el bend y llega al audio', async () => {
    const { host } = await mount();
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    const layout = computeLayout({
      width: window.innerWidth,
      height: window.innerHeight,
      layout: 'guitar',
      octaves: 2,
      baseOctave: 3,
    });
    const pad = layout.pads[12];
    canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 4, clientX: pad.x, clientY: pad.y }));
    canvas.dispatchEvent(pointerEvent('pointermove', { pointerId: 4, clientX: pad.x, clientY: pad.y - 120 }));

    const patches = messages.filter(
      (message) => (message as { type: string }).type === 'patch',
    ) as { patch: { bend: number } }[];
    expect(patches.length).toBeGreaterThan(0);
    expect(patches.at(-1)!.patch.bend).toBeGreaterThan(1.5);

    canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 4, clientX: pad.x, clientY: pad.y - 120 }));
    expect(messages.at(-1)).toMatchObject({ type: 'noteOff' });
  });

  it('no se pierde la primera nota si el audio aún no está listo', async () => {
    // Se manda una nota antes de que exista el nodo de audio.
    const { AudioEngine } = await import('./audio/engine');
    messages.length = 0;
    const engine = new AudioEngine();
    engine.noteOn(1, 60, 0.9);
    engine.setParam('voice', 'cutoff', 3000);
    expect(messages).toHaveLength(0);
    await engine.unlock();
    expect(messages.filter((message) => (message as { type: string }).type === 'noteOn')).toHaveLength(1);
    expect(messages.filter((message) => (message as { type: string }).type === 'param')).toHaveLength(1);
    await engine.close();
  });

  it('abre y cierra el rack', async () => {
    const { host } = await mount();
    const rackButton = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Rack')!;
    rackButton.click();
    const sheet = document.querySelector('#rack')!;
    expect(sheet.classList.contains('is-open')).toBe(true);
    expect(sheet.querySelectorAll('.module').length).toBeGreaterThan(4);
    expect(sheet.querySelectorAll('.knob').length).toBeGreaterThan(10);
    document.querySelector('#rack .sheet-close')!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(sheet.classList.contains('is-open')).toBe(false);
  });

  it('cambiar de preset enciende y apaga módulos', async () => {
    const { host } = await mount();
    const rackButton = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Rack')!;
    rackButton.click();
    const preset = [...document.querySelectorAll('#rack .segmented-item')].find((button) => button.textContent === 'Pulso')!;
    preset.dispatchEvent(new Event('click', { bubbles: true }));
    const enables = messages.filter((message) => (message as { type: string }).type === 'enable');
    expect(enables.length).toBeGreaterThan(3);
  });

  it('el panel de ajustes cambia el diseño del tablero', async () => {
    const { host } = await mount();
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;
    const before = getCtx(canvas).calls.arcs;
    const settingsButton = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === '⋯')!;
    settingsButton.click();
    const sheet = document.querySelector('#settings')!;
    expect(sheet.classList.contains('is-open')).toBe(true);
    const row = [...sheet.querySelectorAll('.segmented-item')].find((button) => button.textContent === 'Fila')!;
    row.dispatchEvent(new Event('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(getCtx(canvas).calls.arcs).toBeGreaterThan(before);
  });

  it('persiste los ajustes entre recargas', async () => {
    const { app } = await mount();
    const store = (app as unknown as { store: { set: (updater: (state: any) => any) => void; flush(): void } }).store;
    store.set((state: any) => ({ ...state, settings: { ...state.settings, baseOctave: 5 } }));
    store.flush();
    expect(JSON.parse(localStorage.getItem('circulo.state.v1') ?? '{}').settings.baseOctave).toBe(5);
    app.destroy();
  });

  it('el arpegio se activa y se nota en el HUD', async () => {
    const { host } = await mount();
    const arpButton = [...host.querySelectorAll('button')].find((button) => button.textContent?.startsWith('Arp'))!;
    arpButton.dispatchEvent(new Event('click', { bubbles: true }));
    expect(arpButton.classList.contains('is-active')).toBe(true);
    expect(arpButton.textContent).toContain('▲');
  });

  it('el looper graba y avisa por toast', async () => {
    const { host } = await mount();
    const loopButton = [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Loop')!;
    loopButton.dispatchEvent(new Event('click', { bubbles: true }));
    expect(document.querySelector('.toast')?.textContent ?? '').toContain('Grabando');
  });
});
