import { hitTest } from '../ui/layout';
import type { Layout } from '../ui/layout';
import type { GestureRecognizer } from '../ui/gestures';

export interface SurfaceHandlers {
  onDown?(pointerId: number, x: number, y: number, pressure: number): void;
  onMove?(pointerId: number, x: number, y: number, pressure: number): void;
  onUp?(pointerId: number): void;
}

export interface PointerSurfaceOptions {
  canvas: HTMLCanvasElement;
  recognizer: GestureRecognizer;
  getLayout: () => Layout;
  handlers: SurfaceHandlers;
  onFirstGesture?(): void;
}

/**
 * Traduce los eventos de puntero de la pantalla al reconocedor de gestos y
 * evita los comportamientos del navegador (scroll, zoom, menú contextual) que
 * estorban al tocar Notas rápidas.
 */
export class PointerSurface {
  private readonly canvas: HTMLCanvasElement;
  private recognizer: GestureRecognizer;
  private getLayout: () => Layout;
  private handlers: SurfaceHandlers;
  private firstGestureFired = false;
  private disposers: (() => void)[] = [];

  constructor(options: PointerSurfaceOptions) {
    this.canvas = options.canvas;
    this.recognizer = options.recognizer;
    this.getLayout = options.getLayout;
    this.handlers = options.handlers;

    const onDown = (event: PointerEvent) => {
      event.preventDefault();
      if (!this.firstGestureFired) {
        this.firstGestureFired = true;
        options.onFirstGesture?.();
      }
      const { x, y } = this.position(event);
      this.canvas.setPointerCapture?.(event.pointerId);
      this.recognizer.start(event.pointerId, this.getLayout().pads, x, y, pressureOf(event));
      this.handlers.onDown?.(event.pointerId, x, y, pressureOf(event));
    };

    const onMove = (event: PointerEvent) => {
      const { x, y } = this.position(event);
      this.recognizer.move(event.pointerId, this.getLayout().pads, x, y, pressureOf(event));
      this.handlers.onMove?.(event.pointerId, x, y, pressureOf(event));
    };

    const onUp = (event: PointerEvent) => {
      this.recognizer.end(event.pointerId);
      this.handlers.onUp?.(event.pointerId);
      if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    };

    const prevent = (event: Event) => event.preventDefault();

    this.canvas.addEventListener('pointerdown', onDown, { passive: false });
    this.canvas.addEventListener('pointermove', onMove, { passive: false });
    this.canvas.addEventListener('pointerup', onUp);
    this.canvas.addEventListener('pointercancel', onUp);
    this.canvas.addEventListener('contextmenu', prevent);
    this.canvas.style.touchAction = 'none';

    this.disposers.push(() => {
      this.canvas.removeEventListener('pointerdown', onDown);
      this.canvas.removeEventListener('pointermove', onMove);
      this.canvas.removeEventListener('pointerup', onUp);
      this.canvas.removeEventListener('pointercancel', onUp);
      this.canvas.removeEventListener('contextmenu', prevent);
    });
  }

  setRecognizer(recognizer: GestureRecognizer): void {
    this.recognizer = recognizer;
  }

  setHandlers(handlers: SurfaceHandlers): void {
    this.handlers = handlers;
  }

  private position(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  destroy(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
  }
}

function pressureOf(event: PointerEvent): number {
  // Muchos navegadores reportan 0.5 como presión "sin sensor".
  return event.pointerType === 'mouse' ? 0 : event.pressure;
}

/** Atajo para depurar: devuelve la nota bajo el punto. */
export function padAt(layout: Layout, x: number, y: number): number | null {
  return hitTest(layout.pads, x, y)?.midi ?? null;
}
