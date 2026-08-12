export const GRID = 17;
export const HASH_BITS = 768;

export function toGrayGrid(rgba, width, height) {
  const sums = new Float64Array(GRID * GRID);
  const counts = new Uint32Array(GRID * GRID);
  const xCell = new Uint8Array(width);
  const yCell = new Uint8Array(height);
  for (let x = 0; x < width; x++) xCell[x] = Math.min(GRID - 1, ((x * GRID) / width) | 0);
  for (let y = 0; y < height; y++) yCell[y] = Math.min(GRID - 1, ((y * GRID) / height) | 0);
  let o = 0;
  for (let y = 0; y < height; y++) {
    const row = yCell[y] * GRID;
    for (let x = 0; x < width; x++) {
      const cell = row + xCell[x];
      sums[cell] += 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
      counts[cell]++;
      o += 4;
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
  for (let y = 0; y < n; y++) {
    const row = y * GRID;
    for (let x = 0; x < n; x++) bits[k++] = gray[row + x + 1] > gray[row + x] ? 1 : 0;
  }
  for (let y = 0; y < n; y++) {
    const row = y * GRID;
    const row2 = (y + 1) * GRID;
    for (let x = 0; x < n; x++) bits[k++] = gray[row2 + x] > gray[row + x] ? 1 : 0;
  }
  let sum = 0;
  for (let y = 0; y < n; y++) {
    const row = y * GRID;
    for (let x = 0; x < n; x++) sum += gray[row + x];
  }
  const mean = sum / (n * n);
  for (let y = 0; y < n; y++) {
    const row = y * GRID;
    for (let x = 0; x < n; x++) bits[k++] = gray[row + x] > mean ? 1 : 0;
  }
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
  const n2 = n * n;
  for (let i = 0; i < n2; i++) {
    let miss = 0;
    if (a[i] !== b[i]) miss++;
    if (a[n2 + i] !== b[n2 + i]) miss++;
    if (a[2 * n2 + i] !== b[2 * n2 + i]) miss++;
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
