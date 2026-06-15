// Runtime chroma-key utility.
//
// The character spritesheets in /public/characters keep a solid magenta
// (#FF00FF) background on purpose (the build-time preprocessor repacks the AI
// art into uniform frames but leaves magenta in place). This util removes that
// magenta at load time — it is invoked by PreloadScene before the textures are
// added to Phaser's cache.
//
// Pixel processing uses an OffscreenCanvas when available (faster, off the DOM)
// and falls back to a regular canvas. The result is returned as an
// HTMLCanvasElement so Phaser's TextureManager.addCanvas can consume it
// directly. `chromaKeyToBitmap` is also provided when an ImageBitmap is wanted.

const MAGENTA = { r: 255, g: 0, b: 255 };

type Drawable = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

function sourceSize(src: Drawable): { width: number; height: number } {
  if (src instanceof HTMLImageElement) {
    return { width: src.naturalWidth || src.width, height: src.naturalHeight || src.height };
  }
  return { width: src.width, height: src.height };
}

function makeContext(width: number, height: number): {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  canvas: HTMLCanvasElement | OffscreenCanvas;
} {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) return { ctx, canvas };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("chromaKey: 2D context unavailable");
  return { ctx, canvas };
}

/** Remove magenta pixels and return the keyed image data plus its size. */
function keyToImageData(src: Drawable, tolerance: number): {
  imageData: ImageData;
  width: number;
  height: number;
} {
  const { width, height } = sourceSize(src);
  const { ctx } = makeContext(width, height);
  ctx.drawImage(src as CanvasImageSource, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const dist =
      Math.abs(d[i] - MAGENTA.r) + Math.abs(d[i + 1] - MAGENTA.g) + Math.abs(d[i + 2] - MAGENTA.b);
    if (dist <= tolerance) {
      d[i + 3] = 0; // fully transparent
    }
  }
  return { imageData, width, height };
}

/**
 * Remove the magenta background from an image and return an HTMLCanvasElement
 * with a transparent background (ready for Phaser's addCanvas / addSpriteSheet).
 */
export function chromaKeyToCanvas(src: Drawable, tolerance = 60): HTMLCanvasElement {
  const { imageData, width, height } = keyToImageData(src, tolerance);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("chromaKey: 2D context unavailable");
  ctx.putImageData(imageData, 0, 0);
  return out;
}

/** Same removal, but resolves to an ImageBitmap with a transparent background. */
export async function chromaKeyToBitmap(src: Drawable, tolerance = 60): Promise<ImageBitmap> {
  const { imageData } = keyToImageData(src, tolerance);
  return createImageBitmap(imageData);
}
