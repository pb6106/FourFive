import jpeg from "jpeg-js";
import UPNG from "upng-js";

export function decodeImage(bytes) {
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
