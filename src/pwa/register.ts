export interface RegisterOptions {
  /** Ruta del service worker relativa a la base del sitio. */
  url?: string;
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
}

/**
 * Registra el service worker para que el instrumento siga funcionando sin
 * conexión: en un show, en el metro o en un avión no hay red.
 */
export function registerServiceWorker(options: RegisterOptions = {}): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (import.meta.env?.DEV) return;
  const url = options.url ?? new URL('sw.js', document.baseURI).href;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(url, { scope: './' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => options.onUpdate?.(registration));
      })
      .catch(() => {
        /* sin service worker la app sigue funcionando, sólo pierde el modo offline */
      });
  });
}

/** Botón de instalación: aparece cuando el navegador lo permite. */
export function installPrompt(button: HTMLElement, onInstalled?: () => void): void {
  let deferred: BeforeInstallPromptEvent | null = null;
  const supported = 'onbeforeinstallprompt' in window;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    button.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    button.hidden = true;
    onInstalled?.();
  });

  button.addEventListener('click', async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    button.hidden = true;
  });

  if (!supported) button.hidden = true;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
