import UPNG from "upng-js";
import { GRID } from "./hash.js";

const MAX_DIFF_SIDE = 640;

function downscale(rgba, width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  if (scale === 1) return { rgba: new Uint8Array(rgba), width, height };
  const nw = Math.max(1, Math.round(width * scale));
  const nh = Math.max(1, Math.round(height * scale));
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / nh));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / nw));
      const si = (sy * width + sx) * 4;
      const di = (y * nw + x) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = 255;
    }
  }
  return { rgba: out, width: nw, height: nh };
}

export function renderDiffPng(rgba, width, height, diff) {
  const scaled = downscale(rgba, width, height, MAX_DIFF_SIDE);
  const { rgba: px, width: w, height: h } = scaled;
  const n = GRID - 1;
  for (let y = 0; y < h; y++) {
    const gy = Math.min(n - 1, Math.floor((y * n) / h));
    for (let x = 0; x < w; x++) {
      const gx = Math.min(n - 1, Math.floor((x * n) / w));
      const miss = diff[gy * n + gx];
      if (miss === 0) continue;
      const o = (y * w + x) * 4;
      const a = 0.18 + 0.42 * miss;
      px[o] = Math.round(px[o] * (1 - a) + 255 * a);
      px[o + 1] = Math.round(px[o + 1] * (1 - a) + 55 * a);
      px[o + 2] = Math.round(px[o + 2] * (1 - a) + 70 * a);
    }
  }
  const encoded = UPNG.encode([px.buffer], w, h, 0);
  return new Uint8Array(encoded);
}

export function sniffContentType(bytes) {
  if (bytes.length > 3 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    return "image/png";
  }
  if (bytes.length > 1 && bytes[0] === 255 && bytes[1] === 216) {
    return "image/jpeg";
  }
  return "application/octet-stream";
}
