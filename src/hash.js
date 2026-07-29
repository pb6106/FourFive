export const GRID = 17;
export const HASH_BITS = 768;

export function toGrayGrid(rgba, width, height) {
  const sums = new Float64Array(GRID * GRID);
  const counts = new Float64Array(GRID * GRID);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(GRID - 1, Math.floor((y * GRID) / height));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(GRID - 1, Math.floor((x * GRID) / width));
      const o = (y * width + x) * 4;
      const gray = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
      const cell = gy * GRID + gx;
      sums[cell] += gray;
      counts[cell]++;
    }
  }
  const grid = new Float64Array(GRID * GRID);
  for (let i = 0; i < grid.length; i++) grid[i] = sums[i] / (counts[i] || 1);
  return grid;
}

export function computeBits(gray) {
  const n = GRID - 1;
  const bits = new Uint8Array(HASH_BITS);
  let k = 0;
  const px = (x, y) => gray[y * GRID + x];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) bits[k++] = px(x + 1, y) > px(x, y) ? 1 : 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) bits[k++] = px(x, y + 1) > px(x, y) ? 1 : 0;
  let sum = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) sum += px(x, y);
  const mean = sum / (n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) bits[k++] = px(x, y) > mean ? 1 : 0;
  return bits;
}

export function similarity(a, b) {
  let match = 0;
  for (let i = 0; i < HASH_BITS; i++) if (a[i] === b[i]) match++;
  return match / HASH_BITS;
}

export function diffGrid(a, b) {
  const n = GRID - 1;
  const cells = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    let miss = 0;
    if (a[i] !== b[i]) miss++;
    if (a[n * n + i] !== b[n * n + i]) miss++;
    if (a[2 * n * n + i] !== b[2 * n * n + i]) miss++;
    cells[i] = miss / 3;
  }
  return cells;
}

export function hexToBits(hex) {
  const bits = new Uint8Array(hex.length * 4);
  for (let i = 0; i < hex.length; i++) {
    const v = parseInt(hex[i], 16);
    bits[i * 4] = (v >> 3) & 1;
    bits[i * 4 + 1] = (v >> 2) & 1;
    bits[i * 4 + 2] = (v >> 1) & 1;
    bits[i * 4 + 3] = v & 1;
  }
  return bits;
}
