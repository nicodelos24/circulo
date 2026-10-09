import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public');

/**
 * Genera los iconos PNG de la PWA sin dependencias: dibuja el logo (tres
 * círculos en arco, como las notas del instrumento) y lo escribe con un
 * encoder propio. Ejecutar con `npm run icons`.
 */

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const ihdr = chunk('IHDR', header);
  const idat = chunk('IDAT', deflateSync(raw, { level: 9 }));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ihdr, idat, iend]);
}

/** Logo: fondo degradado y tres notas circulares en arco (como el tablero). */
function drawLogo(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const unit = size / 512;

  // Tres notas: dos menores en los extremos y la tónica más grande en el centro.
  const circles = [
    { x: cx - 132 * unit, y: cy + 46 * unit, r: 62 * unit, color: [150, 200, 255] },
    { x: cx, y: cy - 44 * unit, r: 78 * unit, color: [214, 236, 255] },
    { x: cx + 132 * unit, y: cy + 46 * unit, r: 62 * unit, color: [125, 211, 252] },
  ];

  const feather = 1.6 * unit;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = (x / size + y / size) / 2;
      let r = 7 + t * 14;
      let g = 10 + t * 14;
      let b = 22 + t * 30;

      let glow = 0;
      for (const circle of circles) {
        const d = Math.hypot(x - circle.x, y - circle.y);
        // Anillo: la nota es un círculo hueco con el borde brillante.
        const ringOuter = circle.r + 6 * unit;
        const ringInner = circle.r - 5 * unit;
        const inRing =
          smoothstep(ringOuter + feather, ringOuter - feather, d) * smoothstep(ringInner - feather, ringInner + feather, d);
        const interior = smoothstep(circle.r + feather, circle.r - feather, d) * 0.22;
        const coverage = Math.max(inRing, interior);
        if (coverage > 0) {
          r += (circle.color[0] - r) * coverage;
          g += (circle.color[1] - g) * coverage;
          b += (circle.color[2] - b) * coverage;
        }
        const halo = smoothstep(circle.r * 2.6, circle.r * 0.9, d);
        glow = Math.max(glow, halo * halo * 0.32);
      }
      r += glow * 10;
      g += glow * 24;
      b += glow * 46;

      const index = (y * size + x) * 4;
      rgba[index] = Math.min(255, Math.round(r));
      rgba[index + 1] = Math.min(255, Math.round(g));
      rgba[index + 2] = Math.min(255, Math.round(b));
      rgba[index + 3] = 255;
    }
  }
  void maskable;
  return encodePng(size, size, rgba);
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

async function main() {
  await mkdir(out, { recursive: true });
  const files = [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['icon-maskable-512.png', 512, true],
    ['apple-touch-icon.png', 180, false],
  ];
  for (const [name, size, maskable] of files) {
    await writeFile(resolve(out, name), drawLogo(size, maskable));
    console.log(`${name} (${size}px)`);
  }
  await writeFile(
    resolve(out, 'favicon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#080b18"/><stop offset="1" stop-color="#131a35"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#bg)"/>
  <circle cx="18" cy="38" r="8" fill="none" stroke="#96d3ff" stroke-width="2.5"/>
  <circle cx="32" cy="26" r="9" fill="none" stroke="#bfe4ff" stroke-width="2.5"/>
  <circle cx="46" cy="38" r="8" fill="none" stroke="#7dd3fc" stroke-width="2.5"/>
</svg>
`,
  );
  console.log('favicon.svg');
}

main();
