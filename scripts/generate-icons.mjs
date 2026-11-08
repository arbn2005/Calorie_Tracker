import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function makeIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const ringOuter = size * 0.29;
  const ringInner = size * 0.2;
  const cx2 = size * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-square green background
      let r = 22,
        g = 163,
        b = 74,
        a = 255;
      const radius = size * 0.22;
      const dx = Math.max(Math.abs(x - cx) - (size / 2 - radius), 0);
      const dy = Math.max(Math.abs(y - cy) - (size / 2 - radius), 0);
      if (Math.hypot(dx, dy) > radius) a = 0;
      const d = Math.hypot(x - cx, y - cy);
      // donut ring
      if (d <= ringOuter && d >= ringInner) {
        const angle = Math.atan2(y - cy, x - cx);
        // leave a small gap at the top for a "C" shape
        if (!(angle > -Math.PI / 2 - 0.28 && angle < -Math.PI / 2 + 0.28)) {
          r = 255;
          g = 255;
          b = 255;
        }
      }
      // inner leaf-like dot
      if (Math.hypot(x - cx2, y - cy) < size * 0.075) {
        r = 255;
        g = 255;
        b = 255;
      }
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = a;
    }
  }
  return png(size, px);
}
function makeMaskable(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      px[i] = 22;
      px[i + 1] = 163;
      px[i + 2] = 74;
      px[i + 3] = 255;
      const d = Math.hypot(x - size / 2, y - size / 2);
      if ((d <= size * 0.22 && d >= size * 0.15) || d < size * 0.055) {
        px[i] = 255;
        px[i + 1] = 255;
        px[i + 2] = 255;
      }
    }
  }
  return png(size, px);
}
writeFileSync(join(outDir, "icon-192.png"), makeIcon(192));
writeFileSync(join(outDir, "icon-512.png"), makeIcon(512));
writeFileSync(join(outDir, "icon-maskable-512.png"), makeMaskable(512));
console.log("icons written");
