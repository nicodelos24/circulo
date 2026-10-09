/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vitest/config';
import { buildWorklet } from './scripts/build-worklet.mjs';

const WORKLET_SRC = 'src/audio/worklet';

/**
 * El processor de AudioWorklet se entrega como un único archivo autónomo
 * (public/worklet/synth-processor.js) porque algunos navegadores móviles
 * no resuelven imports dentro del scope del worklet.
 */
function workletPlugin(): Plugin {
  let building = false;
  const rebuild = async () => {
    if (building) return;
    building = true;
    try {
      await buildWorklet();
    } finally {
      building = false;
    }
  };

  return {
    name: 'circulo:worklet',
    configureServer(server) {
      void rebuild();
      const onChange = (file: string) => {
        if (file.includes(WORKLET_SRC)) void rebuild();
      };
      server.watcher.on('add', onChange);
      server.watcher.on('change', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}

export default defineConfig(async () => {
  // Antes de levantar el servidor: el navegador pide el worklet al cargar.
  await buildWorklet();
  return {
    base: './',
    build: {
      target: 'es2020',
      assetsInlineLimit: 0,
    },
    plugins: [workletPlugin()],
  };
});
