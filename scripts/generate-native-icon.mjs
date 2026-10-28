import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Generates a valid Windows ICO without image-tool dependencies.
// The icon is deliberately small and high-contrast so it stays crisp at taskbar size.
const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, '../src-tauri/icons/icon.ico');
const width = 64;
const height = 64;
const dibHeaderSize = 40;
const xorSize = width * height * 4;
const maskStride = Math.ceil(width / 32) * 4;
const maskSize = maskStride * height;
const imageSize = dibHeaderSize + xorSize + maskSize;
const icoHeaderSize = 6;
const icoEntrySize = 16;
const imageOffset = icoHeaderSize + icoEntrySize;
const file = Buffer.alloc(imageOffset + imageSize);

// ICONDIR
file.writeUInt16LE(0, 0);
file.writeUInt16LE(1, 2);
file.writeUInt16LE(1, 4);

// ICONDIRENTRY
file[6] = width;
file[7] = height;
file[8] = 0;
file[9] = 0;
file.writeUInt16LE(1, 10);
file.writeUInt16LE(32, 12);
file.writeUInt32LE(imageSize, 14);
file.writeUInt32LE(imageOffset, 18);

// BITMAPINFOHEADER. ICO DIB height includes XOR pixels and AND mask.
const dib = imageOffset;
file.writeUInt32LE(dibHeaderSize, dib);
file.writeInt32LE(width, dib + 4);
file.writeInt32LE(height * 2, dib + 8);
file.writeUInt16LE(1, dib + 12);
file.writeUInt16LE(32, dib + 14);
file.writeUInt32LE(0, dib + 16);
file.writeUInt32LE(xorSize, dib + 20);
file.writeInt32LE(2835, dib + 24);
file.writeInt32LE(2835, dib + 28);
file.writeUInt32LE(0, dib + 32);
file.writeUInt32LE(0, dib + 36);

const clamp = (value) => Math.max(0, Math.min(255, value));
const hex = (value) => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];
const background = hex('#151515');
const vinyl = hex('#252525');
const ring = hex('#f5f0e8');
const accent = hex('#ffcc00');
const insideTriangle = (px, py, ax, ay, bx, by, cx, cy) => {
  const edge = (x1, y1, x2, y2) => (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const a = edge(ax, ay, bx, by);
  const b = edge(bx, by, cx, cy);
  const c = edge(cx, cy, ax, ay);
  return (a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0);
};

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const dx = x + 0.5 - width / 2;
    const dy = y + 0.5 - height / 2;
    const radius = Math.hypot(dx, dy);
    let color = background;
    if (radius < 24) color = vinyl;
    if (radius > 20 && radius < 21.5) color = ring;
    if (radius > 15 && radius < 16) color = ring;
    if (radius > 5 && radius < 5.8) color = ring;
    if (insideTriangle(x + 0.5, y + 0.5, 25, 19, 25, 45, 45, 32)) color = accent;

    // ICO 32-bit DIB rows are stored bottom-up, in BGRA channel order.
    const outputY = height - 1 - y;
    const offset = dib + dibHeaderSize + (outputY * width + x) * 4;
    file[offset] = clamp(color[2]);
    file[offset + 1] = clamp(color[1]);
    file[offset + 2] = clamp(color[0]);
    file[offset + 3] = 255;
  }
}

// The allocated AND mask is intentionally all zero (opaque pixels).
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, file);
console.log(`Generated native Windows icon: ${output} (${file.byteLength} bytes)`);
