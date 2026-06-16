// Runtime chroma-key utility.
//
// The character spritesheets in /public/characters keep a solid magenta
// (#FF00FF) background; the AI source art was anti-aliased against that magenta,
// so sprite edges carry semi-magenta "fringe" pixels. A naive distance cut only
// removes near-pure magenta and leaves a purple halo. This util runs three
// passes to kill that fringe:
//   1. remove clearly-magenta pixels
//   2. erode: drop edge pixels that border transparency AND carry a magenta tint
//   3. desaturate any remaining semi-transparent fringe (pull down R & B)
//
// IMPORTANT: it returns an HTMLCanvasElement so PreloadScene can register it as a
// multi-frame spritesheet via textures.addCanvas + texture.add(...). (We do NOT
// use textures.addImage, which would collapse the strip to a single frame and
// break every animation.)

type Drawable = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

function sourceSize(src: Drawable): { width: number; height: number } {
  if (src instanceof HTMLImageElement) {
    return { width: src.naturalWidth || src.width, height: src.naturalHeight || src.height };
  }
  return { width: src.width, height: src.height };
}

function isMagenta(r: number, g: number, b: number): boolean {
  // wide magenta test: strong red + blue, weak green
  return r > 140 && g < 90 && b > 140 && r + b - g * 2 > 160;
}

/**
 * Remove the magenta background (and its anti-aliased fringe) from an image and
 * return a transparent HTMLCanvasElement.
 */
export function chromaKeyToCanvas(src: Drawable): HTMLCanvasElement {
  const { width, height } = sourceSize(src);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("chromaKey: 2D context unavailable");
  ctx.drawImage(src as CanvasImageSource, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const w = width;

  // Pass 1 — remove clear magenta pixels
  for (let i = 0; i < data.length; i += 4) {
    if (isMagenta(data[i], data[i + 1], data[i + 2])) data[i + 3] = 0;
  }

  // Pass 2 — erode: a pixel bordering 3+ transparent neighbors that still has a
  // magenta tint is fringe; drop it.
  const copy = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      if (copy[idx + 3] === 0) continue;
      let transparentNeighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (copy[((y + dy) * w + (x + dx)) * 4 + 3] === 0) transparentNeighbors++;
        }
      }
      const r = copy[idx];
      const g = copy[idx + 1];
      const b = copy[idx + 2];
      if (transparentNeighbors >= 3 && r > 100 && b > 100 && g < 120) {
        data[idx + 3] = 0;
      }
    }
  }

  // Pass 3 — desaturate remaining fringe pixels (pull down red/blue, cap alpha)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0 && data[i + 3] < 200) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 100 && b > 100 && r + b > g * 2 + 60) {
        data[i] = Math.max(0, r - 40);
        data[i + 2] = Math.max(0, b - 40);
        data[i + 3] = Math.min(data[i + 3], 180);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
