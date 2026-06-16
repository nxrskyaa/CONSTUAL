/* eslint-disable */
// Build-time sprite preprocessor.
//
// The raw character art in D:\characters is a set of 1254x1254 AI-generated
// reference sheets: many varied poses scattered on a solid magenta (#FF00FF)
// background, NOT a clean uniform grid. This script:
//   1. decodes each PNG,
//   2. detects every individual sprite via connected-components over the
//      non-magenta foreground (with a dilation pass so a sprite's outline gaps
//      and attached magic FX stay together),
//   3. picks the best N poses in reading order,
//   4. repacks them into a clean uniform HORIZONTAL STRIP that keeps the magenta
//      background (so the runtime chromaKey util in PreloadScene is genuinely
//      used), written to public/characters/<key>.png,
//   5. also emits a transparent 160px PORTRAIT (frame 0) for the React dialog UI
//      to public/characters/portraits/<key>.png,
//   6. prints a sprites config snippet (frameWidth/frameHeight/frameCount).
//
// Run: node scripts/preprocess-sprites.cjs
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const SRC_DIR = "D:/characters";
const OUT_DIR = path.join(__dirname, "..", "public", "characters");
const PORTRAIT_DIR = path.join(OUT_DIR, "portraits");

// key -> source filename + how many frames to keep for the game strip.
const CHARACTERS = [
  { key: "siggy", file: "siggy.png", frames: 6 },
  { key: "seesac", file: "seesac.png", frames: 4 },
  { key: "siggy_anime", file: "siggy_anime.png", frames: 4 },
  { key: "decka", file: "decka.png", frames: 4 },
  { key: "nxr", file: "nxr.png", frames: 4 },
  { key: "rikky", file: "rikky.png", frames: 4 },
  { key: "rizan", file: "rizan.png", frames: 4 },
  { key: "jez", file: "jez.png", frames: 4 },
  { key: "stefan", file: "stefan.png", frames: 4 },
  { key: "josh", file: "josh.png", frames: 4 },
  { key: "evo", file: "Evo.png", frames: 6 },
  { key: "asceno", file: "asceno.png", frames: 4 },
  { key: "jepanya", file: "jepanya.png", frames: 6 },
  { key: "mexxy", file: "Mexxy.png", frames: 4 },
  { key: "tutubear", file: "tutubear.png", frames: 4 },
  { key: "john", file: "john.png", frames: 4 },
  { key: "yourinuu", file: "yourinuu.png", frames: 4 },
  { key: "linhlambo", file: "Linhlambo.png", frames: 4 },
  { key: "agata", file: "agata.png", frames: 4 },
  { key: "whuan", file: "Whuan.png", frames: 4 },
  { key: "kippo", file: "Kippo.G.png", frames: 4 },
  { key: "hytamm", file: "Hytamm.png", frames: 4 },
  { key: "shin", file: "Shin.png", frames: 4 },
];

// Single-image landmark buildings + flag -> transparent trimmed PNGs.
const BUILD_DIR = path.join(__dirname, "..", "public", "buildings");
const LANDMARKS = [
  { key: "ritualflag", file: "ritualflag.png", targetH: 150 },
];
const BUILD_SRC = "D:/building";

const MAGENTA_TOL = 60; // distance threshold from pure magenta
const DILATE = 7; // px to merge nearby sprite parts
const MIN_W = 70;
const MIN_H = 70;
const MIN_AREA = 1800; // min foreground pixels to count as a real sprite
const TARGET = 220; // uniform frame size (square) for the game strip
const PAD = 12; // inner padding inside a frame
const PORTRAIT = 160;

function isMagenta(r, g, b) {
  // pure magenta is (255,0,255); measure manhattan-ish distance
  const d = Math.abs(255 - r) + Math.abs(0 - g) + Math.abs(255 - b);
  return d <= MAGENTA_TOL;
}

function buildForeground(png) {
  const { width: w, height: h, data } = png;
  const fg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    fg[i] = a > 40 && !isMagenta(r, g, b) ? 1 : 0;
  }
  return fg;
}

// Separable max-filter dilation (horizontal then vertical).
function dilate(mask, w, h, radius) {
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let dx = -radius; dx <= radius && !on; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < w && mask[y * w + nx]) on = 1;
      }
      tmp[y * w + x] = on;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let dy = -radius; dy <= radius && !on; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < h && tmp[ny * w + x]) on = 1;
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

// Connected components (4-conn) over a dilated mask; bbox/area measured on the
// ORIGINAL foreground so padding from dilation doesn't bloat boxes.
function components(dil, fg, w, h) {
  const label = new Int32Array(w * h).fill(0);
  const stack = new Int32Array(w * h);
  const boxes = [];
  let cur = 0;
  for (let s = 0; s < w * h; s++) {
    if (!dil[s] || label[s]) continue;
    cur++;
    let sp = 0;
    stack[sp++] = s;
    label[s] = cur;
    let minX = w, minY = h, maxX = 0, maxY = 0, area = 0;
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % w, py = (p / w) | 0;
      if (fg[p]) {
        area++;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
      // neighbors
      if (px > 0 && dil[p - 1] && !label[p - 1]) { label[p - 1] = cur; stack[sp++] = p - 1; }
      if (px < w - 1 && dil[p + 1] && !label[p + 1]) { label[p + 1] = cur; stack[sp++] = p + 1; }
      if (py > 0 && dil[p - w] && !label[p - w]) { label[p - w] = cur; stack[sp++] = p - w; }
      if (py < h - 1 && dil[p + w] && !label[p + w]) { label[p + w] = cur; stack[sp++] = p + w; }
    }
    if (area >= MIN_AREA && maxX - minX + 1 >= MIN_W && maxY - minY + 1 >= MIN_H) {
      boxes.push({ minX, minY, maxX, maxY, area, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
  }
  return boxes;
}

// Sort boxes into reading order (rows top->bottom, then left->right).
function readingOrder(boxes) {
  const sorted = boxes.slice().sort((a, b) => a.minY - b.minY);
  const rows = [];
  for (const b of sorted) {
    const cy = (b.minY + b.maxY) / 2;
    let row = rows.find((r) => Math.abs(r.cy - cy) < (b.h * 0.6));
    if (!row) { row = { cy, items: [] }; rows.push(row); }
    row.items.push(b);
    row.cy = (row.cy * (row.items.length - 1) + cy) / row.items.length;
  }
  rows.sort((a, b) => a.cy - b.cy);
  const out = [];
  for (const r of rows) {
    r.items.sort((a, b) => a.minX - b.minX);
    out.push(...r.items);
  }
  return out;
}

// Nearest-neighbour blit of source bbox -> destination frame, scaled to fit,
// centered. When keepMagenta is true, background stays magenta; otherwise it is
// transparent and only foreground pixels are copied.
function blit(srcPng, box, fg, dest, destW, fx, fy, frame, keepMagenta) {
  const sw = box.w, sh = box.h;
  const avail = frame - PAD * 2;
  const scale = Math.min(avail / sw, avail / sh, 3);
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));
  const offX = fx + Math.floor((frame - dw) / 2);
  const offY = fy + Math.floor((frame - dh) / 2);
  for (let dy = 0; dy < dh; dy++) {
    for (let dx = 0; dx < dw; dx++) {
      const sx = box.minX + Math.min(sw - 1, Math.floor(dx / scale));
      const sy = box.minY + Math.min(sh - 1, Math.floor(dy / scale));
      const sIdx = sy * srcPng.width + sx;
      const di = ((offY + dy) * destW + (offX + dx)) * 4;
      if (fg[sIdx]) {
        dest[di] = srcPng.data[sIdx * 4];
        dest[di + 1] = srcPng.data[sIdx * 4 + 1];
        dest[di + 2] = srcPng.data[sIdx * 4 + 2];
        dest[di + 3] = 255;
      }
      // else: leave as initialized (magenta or transparent)
    }
  }
}

function newCanvas(w, h, keepMagenta) {
  const data = Buffer.alloc(w * h * 4);
  if (keepMagenta) {
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = 255; data[i * 4 + 1] = 0; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255;
    }
  }
  return data;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(PORTRAIT_DIR, { recursive: true });
  const config = [];

  for (const ch of CHARACTERS) {
    const srcPath = path.join(SRC_DIR, ch.file);
    if (!fs.existsSync(srcPath)) { console.warn("MISSING", srcPath); continue; }
    const png = PNG.sync.read(fs.readFileSync(srcPath));
    const { width: w, height: h } = png;
    const fg = buildForeground(png);
    const dil = dilate(fg, w, h, DILATE);
    let boxes = components(dil, fg, w, h);
    boxes = readingOrder(boxes);
    const picked = boxes.slice(0, ch.frames);
    if (picked.length === 0) { console.warn("NO SPRITES for", ch.key); continue; }

    // game strip (magenta bg, uniform frames)
    const stripW = TARGET * picked.length;
    const strip = newCanvas(stripW, TARGET, true);
    picked.forEach((box, i) => blit(png, box, fg, strip, stripW, i * TARGET, 0, TARGET, true));
    const stripPng = new PNG({ width: stripW, height: TARGET });
    strip.copy(stripPng.data);
    fs.writeFileSync(path.join(OUT_DIR, ch.key + ".png"), PNG.sync.write(stripPng));

    // portrait (transparent, frame 0)
    const portrait = newCanvas(PORTRAIT, PORTRAIT, false);
    blit(png, picked[0], fg, portrait, PORTRAIT, 0, 0, PORTRAIT, false);
    const pPng = new PNG({ width: PORTRAIT, height: PORTRAIT });
    portrait.copy(pPng.data);
    fs.writeFileSync(path.join(PORTRAIT_DIR, ch.key + ".png"), PNG.sync.write(pPng));

    config.push({ key: ch.key, frameWidth: TARGET, frameHeight: TARGET, frameCount: picked.length });
    console.log(
      `${ch.key.padEnd(13)} detected=${boxes.length} kept=${picked.length} -> ${ch.key}.png (${stripW}x${TARGET})`,
    );
  }

  // --- landmark buildings + flag (single transparent sprite each) ---
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  for (const lm of LANDMARKS) {
    const p = path.join(BUILD_SRC, lm.file);
    if (!fs.existsSync(p)) { console.warn("MISSING", p); continue; }
    const png = PNG.sync.read(fs.readFileSync(p));
    const out = trimKeyScale(png, lm.targetH);
    fs.writeFileSync(path.join(BUILD_DIR, lm.key + ".png"), PNG.sync.write(out));
    console.log(`landmark ${lm.key.padEnd(11)} -> ${out.width}x${out.height}`);
  }

  console.log("\n--- sprites config ---");
  console.log(JSON.stringify(config, null, 2));
}

// Remove magenta, trim to content bbox, scale to a target height; transparent.
function trimKeyScale(png, targetH) {
  const { width: w, height: h, data } = png;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (isMagenta(data[i], data[i + 1], data[i + 2])) {
        data[i + 3] = 0;
      } else if (data[i + 3] > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  // desaturate magenta fringe
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0 && data[i + 3] < 215) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 110 && b > 110 && r + b > g * 2 + 60) {
        data[i] = Math.max(0, r - 45);
        data[i + 2] = Math.max(0, b - 45);
      }
    }
  }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const scale = targetH / bh;
  const ow = Math.max(1, Math.round(bw * scale));
  const oh = targetH;
  const out = new PNG({ width: ow, height: oh });
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const sx = minX + Math.min(bw - 1, Math.floor(x / scale));
      const sy = minY + Math.min(bh - 1, Math.floor(y / scale));
      const si = (sy * w + sx) * 4;
      const di = (y * ow + x) * 4;
      out.data[di] = data[si];
      out.data[di + 1] = data[si + 1];
      out.data[di + 2] = data[si + 2];
      out.data[di + 3] = data[si + 3];
    }
  }
  return out;
}

main();
