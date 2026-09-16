import jpeg from "jpeg-js";
import UPNG from "upng-js";

const REFERENCE_HASHES = [
    "c007a6139e12deb4ce561c569c5ecc006d60cd529c1a8e02e63eaf001e3416581fff000027fff3a98300c40034fc101e420147c7f9fff80003f803bf88000e00f000ffff03cd03ff03ff038b03000200000000000200c3fff9c001e003ff0380",
    "c01eb1427846f0a6e0ab6b2b6a33ec8b719d6012fda8f8277c33724c7a22f1280fff3c011c07600403c36c3c42e0084f7ffd43ff000033cd8fffdf5d681ca001fe00fe003e013c033c001f801c00120008003f800fff0e000e000fe00fd10e1c",
    "060ac0025e568e148ea48ea49c7e9c01cd418b618d528e08a62c0f41ce64de3affff0100f7fffb7f0f000003cce0f09cf000068fdffff80002f807ff000004008000ffff038047ff67ff07da0303020022006000020007fffbc003f003ff0380",
    "0602c0023e568e948ea48ea49c7e8c41cd418b638d52ae08e62c8f41ce64de2affff0100e7fffb7f0f00080384e0f09cf0010a0fdffff800007007ff000004008000ffff038007ff67ff07da0303030000006000020007fffbc003f003ff0380",
    "c244b0897089707962874c574a87480f6d2d406979b930c338033c4138c9a524df7e3f60380f404187feacfe800090ff3ffe9ffe00015fc0dffee0002003bffefffffffe3f603806380030002400000010003f009ffe1e001f009ffede000000",
  ];

const GRID = 17;
const HASH_BITS = 768;

function toGrayGrid(rgba, width, height) {
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

function computeBits(gray) {
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

function similarity(a, b) {
    let match = 0;
    for (let i = 0; i < HASH_BITS; i++) if (a[i] === b[i]) match++;
    return match / HASH_BITS;
}

function diffGrid(a, b) {
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

function hexToBits(hex) {
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

function decodeImage(bytes) {
    if (bytes.length > 3 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
          const img = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
          const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
          return { rgba, width: img.width, height: img.height };
    }
    if (bytes.length > 1 && bytes[0] === 255 && bytes[1] === 216) {
          const img = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 512 });
          return { rgba: img.data, width: img.width, height: img.height };
    }
    throw new Error("Unsupported image format - only PNG and JPEG are accepted");
}

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

function renderDiffPng(rgba, width, height, diff) {
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

function sniffContentType(bytes) {
    if (bytes.length > 3 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
          return "image/png";
    }
    if (bytes.length > 1 && bytes[0] === 255 && bytes[1] === 216) {
          return "image/jpeg";
    }
    return "application/octet-stream";
}

const REFERENCE_BITS_LIST = REFERENCE_HASHES.map(hexToBits);
const TIER_MATCH = 0.85;
const TIER_SUSPICIOUS = 0.75;
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const DEDUP_TTL_SEC = 5 * 60;
const IMAGE_TTL_SEC = 7 * 24 * 60 * 60;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
          status,
          headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
          },
    });
}

function base64ToBytes(b64) {
    b64 = b64.replace(/^data:image\/[a-z+.-]+;base64,/i, "").replace(/\s/g, "");
    if (!b64) throw new Error("Empty image payload");
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function fetchImageBytes(url) {
    let parsed;
    try {
          parsed = new URL(url);
    } catch {
          throw new Error("Invalid URL");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          throw new Error("URL must be http(s)");
    }
    const resp = await fetch(parsed.toString(), {
          headers: { "User-Agent": "scam-image-detector/1.0" },
    });
    if (!resp.ok) {
          throw new Error(`Could not fetch image (HTTP ${resp.status} from ${parsed.hostname})`);
    }
    const len = Number(resp.headers.get("Content-Length") || 0);
    if (len > MAX_BODY_BYTES) throw new Error("Fetched image too large (20 MB max)");
    const buf = await resp.arrayBuffer();
    if (buf.byteLength > MAX_BODY_BYTES) throw new Error("Fetched image too large (20 MB max)");
    return new Uint8Array(buf);
}

async function getImageBytes(request) {
    if (request.method === "GET") {
          const url = new URL(request.url).searchParams.get("url");
          if (!url) throw new Error("Provide ?url=<image url> or POST an image");
          return fetchImageBytes(url);
    }
    const contentType = request.headers.get("Content-Type") || "";
    if (contentType.includes("application/json")) {
          const body = await request.json();
          if (typeof body.url === "string") return fetchImageBytes(body.url);
          if (typeof body.image === "string") return base64ToBytes(body.image);
          throw new Error('JSON body must contain an "image" (base64) or "url" string field');
    }
    const text = (await request.text()).trim();
    if (/^https?:\/\//i.test(text)) return fetchImageBytes(text);
    return base64ToBytes(text);
}

async function serveStored(env, kind, id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return json({ error: "Not found" }, 404);
    }
    const key = `${kind}:${id}`;
    const { value, metadata } = await env.IMAGES.getWithMetadata(key, {
          type: "arrayBuffer",
    });
    if (!value) return json({ error: "Not found" }, 404);
    return new Response(value, {
          headers: {
                  "Content-Type": (metadata && metadata.contentType) || "application/octet-stream",
                  "Cache-Control": "public, max-age=31536000, immutable",
                  "Access-Control-Allow-Origin": "*",
          },
    });
}

function bestMatch(bits) {
    let bestSim = -1;
    let bestRef = REFERENCE_BITS_LIST[0];
    for (const ref of REFERENCE_BITS_LIST) {
          const sim = similarity(ref, bits);
          if (sim > bestSim) {
                  bestSim = sim;
                  bestRef = ref;
          }
    }
    return { sim: bestSim, ref: bestRef };
}


function bitsToHex(bits) {
    let hex = "";
    for (let i = 0; i < bits.length; i += 4) {
          const v = ((bits[i] || 0) << 3) | ((bits[i + 1] || 0) << 2) | ((bits[i + 2] || 0) << 1) | (bits[i + 3] || 0);
          hex += v.toString(16);
    }
    return hex;
}

async function isRecentDuplicate(env, hashHex) {
    const hit = await env.IMAGES.get(`seen:${hashHex}`);
    return hit !== null;
}

async function markSeen(env, hashHex) {
    await env.IMAGES.put(`seen:${hashHex}`, "1", { expirationTtl: DEDUP_TTL_SEC });
}

async function purgeOldImages(env) {
    const last = await env.IMAGES.get("meta:lastPurge");
    const now = Date.now();
    if (last && now - Number(last) < PURGE_INTERVAL_MS) return;
    await env.IMAGES.put("meta:lastPurge", String(now), { expirationTtl: 2 * 24 * 60 * 60 });
    for (const prefix of ["i:", "d:"]) {
          let cursor;
          do {
                  const page = await env.IMAGES.list({ prefix, cursor, limit: 1000 });
                  for (const key of page.keys) {
                            const { metadata } = await env.IMAGES.getWithMetadata(key.name);
                            const storedAt = metadata && metadata.storedAt != null ? Number(metadata.storedAt) : NaN;
                            if (!Number.isFinite(storedAt)) continue;
                            if (now - storedAt > WEEK_MS) {
                                        await env.IMAGES.delete(key.name);
                            }
                  }
                  cursor = page.list_complete ? undefined : page.cursor;
          } while (cursor);
    }
}

function storeImages(env, requestUrl, bytes, rgba, width, height, bits, refBits, hashHex) {
    const id = crypto.randomUUID();
    const origin = new URL(requestUrl).origin;
    const contentType = sniffContentType(bytes);
    const storedAt = Date.now();
    const urls = {
          image: `${origin}/i/${id}`,
          dif: `${origin}/d/${id}`,
    };
    const work = async () => {
          const diff = diffGrid(refBits, bits);
          const difPng = renderDiffPng(rgba, width, height, diff);
          await Promise.all([
                  env.IMAGES.put(`i:${id}`, bytes, {
                            metadata: { contentType, storedAt },
                            expirationTtl: IMAGE_TTL_SEC,
                  }),
                  env.IMAGES.put(`d:${id}`, difPng, {
                            metadata: { contentType: "image/png", storedAt },
                            expirationTtl: IMAGE_TTL_SEC,
                  }),
                  markSeen(env, hashHex),
                ]);
    };
    return { urls, work };
}

export default {
    async fetch(request, env, ctx) {
          if (request.method === "OPTIONS") {
                  return new Response(null, {
                            headers: {
                                        "Access-Control-Allow-Origin": "*",
                                        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                                        "Access-Control-Allow-Headers": "Content-Type",
                            },
                  });
          }
          const { pathname } = new URL(request.url);
          const stored = pathname.match(/^\/([id])\/([0-9a-f-]{36})$/i);
          if (request.method === "GET" && stored) {
                  return serveStored(env, stored[1].toLowerCase(), stored[2]);
          }
          if (request.method !== "POST" && request.method !== "GET") {
                  return json({ error: "GET with ?url= or POST an image (base64 or URL)" }, 405);
          }
          const contentLength = Number(request.headers.get("Content-Length") || 0);
          if (contentLength > MAX_BODY_BYTES) {
                  return json({ error: "Image too large, limit to 20MB" }, 413);
          }
          let bytes;
          try {
                  bytes = await getImageBytes(request);
          } catch (err) {
                  return json({ error: "Invalid request: " + err.message }, 400);
          }
          if (ctx && typeof ctx.waitUntil === "function") {
                  ctx.waitUntil(purgeOldImages(env).catch(() => {}));
          } else {
                  try { await purgeOldImages(env); } catch (_) {}
          }
          try {
                  const { rgba, width, height } = decodeImage(bytes);
                  const bits = computeBits(toGrayGrid(rgba, width, height));
                  const hashHex = bitsToHex(bits);
                  if (await isRecentDuplicate(env, hashHex)) {
                            return json({
                                        result: 0,
                                        similarity: 0,
                                        image: null,
                                        dif: null,
                                        duplicate: true,
                            });
                  }
                  const { sim, ref } = bestMatch(bits);
                  let result = sim >= TIER_MATCH ? 2 : sim >= TIER_SUSPICIOUS ? 1 : 0;
                  let image = null;
                  let dif = null;
                  if (result >= 1) {
                            const { urls, work } = storeImages(env, request.url, bytes, rgba, width, height, bits, ref, hashHex);
                            image = urls.image;
                            dif = urls.dif;
                            if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(work());
                            else await work();
                  } else {
                            await markSeen(env, hashHex);
                  }
                  return json({
                            result,
                            similarity: Math.round(sim * 1e3) / 10,
                            image,
                            dif,
                  });
          } catch (err) {
                  return json({ error: err.message }, 415);
          }
    },
};
