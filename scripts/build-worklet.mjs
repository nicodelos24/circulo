import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, 'src/audio/worklet/index.ts');
const outfile = resolve(root, 'public/worklet/synth-processor.js');

/**
 * Empaqueta el DSP del sintetizador en un solo archivo para el AudioWorklet.
 * Sin imports externos: el scope del worklet no siempre resuelve modulos.
 */
export async function buildWorklet() {
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    minify: process.env.NODE_ENV === 'production',
    legalComments: 'none',
    logLevel: 'silent',
  });
  return outfile;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  buildWorklet().then(() => {
    console.log('worklet -> public/worklet/synth-processor.js');
  });
}
