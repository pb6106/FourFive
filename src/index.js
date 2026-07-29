import { decodeImage } from "./decode.js";
import { computeBits, diffGrid, hexToBits, similarity, toGrayGrid } from "./hash.js";
import { renderDiffPng, sniffContentType } from "./diff.js";
import { REFERENCE_HASHES } from "./reference-hash.js";

const REFERENCE_BITS_LIST = REFERENCE_HASHES.map(hexToBits);
const TIER_MATCH = 0.85;
const TIER_SUSPICIOUS = 0.75;
const MAX_BODY_BYTES = 20 * 1024 * 1024;

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

async function storeImages(env, requestUrl, bytes, rgba, width, height, bits, refBits) {
  const id = crypto.randomUUID();
  const origin = new URL(requestUrl).origin;
  const contentType = sniffContentType(bytes);
  const diff = diffGrid(refBits, bits);
  const difPng = renderDiffPng(rgba, width, height, diff);
  await Promise.all([
    env.IMAGES.put(`i:${id}`, bytes, { metadata: { contentType } }),
    env.IMAGES.put(`d:${id}`, difPng, { metadata: { contentType: "image/png" } }),
  ]);
  return {
    image: `${origin}/i/${id}`,
    dif: `${origin}/d/${id}`,
  };
}

export default {
  async fetch(request, env) {
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
    try {
      const { rgba, width, height } = decodeImage(bytes);
      const bits = computeBits(toGrayGrid(rgba, width, height));
      const { sim, ref } = bestMatch(bits);
      const result = sim >= TIER_MATCH ? 2 : sim >= TIER_SUSPICIOUS ? 1 : 0;
      let image = null;
      let dif = null;
      if (result >= 1) {
        ({ image, dif } = await storeImages(env, request.url, bytes, rgba, width, height, bits, ref));
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
