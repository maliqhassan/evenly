// Generates the app icon PNGs from the Evenly mark's geometry (no dependencies).
//
// The mark is a light ring on forest. Official geometry (1024 canvas):
// ring centred, radius 200 to the middle of the stroke, stroke width 112, so the
// ring's outer edge spans half the canvas.
//
// Run: node scripts/generate-brand-assets.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const FOREST = [0x26, 0x30, 0x2a];
const LIGHT = [0xf4, 0xf5, 0xf3];
const WHITE = [0xff, 0xff, 0xff];

const RING_RADIUS = 200 / 1024; // to the middle of the stroke, as a fraction of the canvas
const RING_STROKE = 112 / 1024;
// Android adaptive icons: the launcher mask shows the middle 72 of 108 dp.
const ADAPTIVE_VISIBLE = 72 / 108;

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');

/** Renders a size×size RGBA image: optional background plus a centred ring, 4×4 supersampled. */
function render(size, { bg, fg, radius, stroke }) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const rMid = radius * size;
  const half = (stroke * size) / 2;
  const S = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const d = Math.hypot(x + (sx + 0.5) / S - c, y + (sy + 0.5) / S - c);
          if (Math.abs(d - rMid) <= half) hits++;
        }
      }
      const a = hits / (S * S);
      const i = (y * size + x) * 4;
      if (bg) {
        for (let k = 0; k < 3; k++) px[i + k] = Math.round(bg[k] * (1 - a) + fg[k] * a);
        px[i + 3] = 255;
      } else {
        px[i] = fg[0];
        px[i + 1] = fg[1];
        px[i + 2] = fg[2];
        px[i + 3] = Math.round(a * 255);
      }
    }
  }
  return encodePng(size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const full = { radius: RING_RADIUS, stroke: RING_STROKE };
const adaptive = { radius: RING_RADIUS * ADAPTIVE_VISIBLE, stroke: RING_STROKE * ADAPTIVE_VISIBLE };

const files = {
  // iOS / store icon: full-bleed forest square (the OS rounds the corners).
  'icon.png': render(1024, { bg: FOREST, fg: LIGHT, ...full }),
  // Android adaptive icon layers (background colour is set in app.config.ts).
  'android-icon-foreground.png': render(1024, { fg: LIGHT, ...adaptive }),
  'android-icon-monochrome.png': render(1024, { fg: WHITE, ...adaptive }),
  // Native splash: intentionally empty, so the launch screen is plain forest and
  // the in-app splash can draw the ring (see SplashView).
  'splash-icon.png': render(288, { fg: LIGHT, radius: 0, stroke: 0 }),
  'favicon.png': render(96, { bg: FOREST, fg: LIGHT, ...full }),
};

for (const [name, png] of Object.entries(files)) {
  writeFileSync(join(out, name), png);
  console.log(`${name.padEnd(30)} ${(png.length / 1024).toFixed(1)} KB`);
}
