import './styles/app.css';
import { App } from './main';
import { toast } from './ui/dom';
import { installPrompt, registerServiceWorker } from './pwa/register';

const host = document.querySelector<HTMLElement>('#app');
if (!host) throw new Error('Falta el contenedor #app');

const app = new App(host);
registerServiceWorker();

const installButton = document.querySelector<HTMLElement>('#install');
if (installButton) {
  installPrompt(installButton, () => toast('Círculo instalado: toca el icono para abrirlo a pantalla completa'));
}

// La pantalla no debe hacer scroll ni zoom: es un instrumento.
document.addEventListener('gesturestart', (event) => event.preventDefault());
document.addEventListener(
  'touchmove',
  (event) => {
    if (event.touches.length > 1) event.preventDefault();
  },
  { passive: false },
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => app.destroy());
}

export { app };
