/* eslint-disable */
// Prepare the D:/assetsupdate pixel-art pack for the Phaser world.
//
// Source files are 1254px reference images. This script exports:
// - a compact 32px world tile strip used by the tilemap
// - transparent props for the pond, tree, fishing rod/bobber, and new buildings
//
// Run: node scripts/preprocess-environment-assets.cjs
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const SRC_DIR = "D:/assetsupdate";
const OUT_DIR = path.join(__dirname, "..", "public", "environment");
const TILE = 32;
const MAGENTA_TOL = 72;

function src(name) {
  return path.join(SRC_DIR, name);
}

function read(name) {
  return PNG.sync.read(fs.readFileSync(src(name)));
}

function write(name, png) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), PNG.sync.write(png));
}

function isMagenta(r, g, b) {
  return Math.abs(255 - r) + Math.abs(g) + Math.abs(255 - b) <= MAGENTA_TOL;
}

function cropSquare(png, size = 720, cx = png.width / 2, cy = png.height / 2) {
  const s = Math.min(size, png.width, png.height);
  const x0 = Math.max(0, Math.min(png.width - s, Math.round(cx - s / 2)));
  const y0 = Math.max(0, Math.min(png.height - s, Math.round(cy - s / 2)));
  return { x0, y0, w: s, h: s };
}

function resizeBox(png, box, outW, outH, tint) {
  const out = new PNG({ width: outW, height: outH });
  const xScale = box.w / outW;
  const yScale = box.h / outH;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx0 = Math.floor(box.x0 + x * xScale);
      const sx1 = Math.max(sx0 + 1, Math.floor(box.x0 + (x + 1) * xScale));
      const sy0 = Math.floor(box.y0 + y * yScale);
      const sy1 = Math.max(sy0 + 1, Math.floor(box.y0 + (y + 1) * yScale));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = sy0; yy < sy1; yy++) {
        for (let xx = sx0; xx < sx1; xx++) {
          const i = (Math.min(png.height - 1, yy) * png.width + Math.min(png.width - 1, xx)) * 4;
          r += png.data[i];
          g += png.data[i + 1];
          b += png.data[i + 2];
          a += png.data[i + 3];
          n++;
        }
      }
      r /= n; g /= n; b /= n; a /= n;
      if (tint) {
        r = r * (tint.mul[0] ?? 1) + (tint.add[0] ?? 0);
        g = g * (tint.mul[1] ?? 1) + (tint.add[1] ?? 0);
        b = b * (tint.mul[2] ?? 1) + (tint.add[2] ?? 0);
      }
      const di = (y * outW + x) * 4;
      out.data[di] = Math.max(0, Math.min(255, Math.round(r)));
      out.data[di + 1] = Math.max(0, Math.min(255, Math.round(g)));
      out.data[di + 2] = Math.max(0, Math.min(255, Math.round(b)));
      out.data[di + 3] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }
  return out;
}

function keyOutAndBounds(png) {
  let minX = png.width, minY = png.height, maxX = -1, maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2], a = png.data[i + 3];
      if (a < 20 || isMagenta(r, g, b)) {
        png.data[i + 3] = 0;
        continue;
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // reduce magenta anti-alias fringe without flattening the art.
      if (r > 115 && b > 115 && r + b > g * 2 + 70) {
        png.data[i] = Math.max(0, r - 46);
        png.data[i + 2] = Math.max(0, b - 46);
      }
    }
  }
  if (maxX < minX || maxY < minY) return { x0: 0, y0: 0, w: png.width, h: png.height };
  const pad = 3;
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const x1 = Math.min(png.width - 1, maxX + pad);
  const y1 = Math.min(png.height - 1, maxY + pad);
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function resizeNearest(png, box, outW, outH) {
  const out = new PNG({ width: outW, height: outH });
  const scaleX = box.w / outW;
  const scaleY = box.h / outH;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(png.width - 1, box.x0 + Math.floor(x * scaleX));
      const sy = Math.min(png.height - 1, box.y0 + Math.floor(y * scaleY));
      const si = (sy * png.width + sx) * 4;
      const di = (y * outW + x) * 4;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = png.data[si + 3];
    }
  }
  return out;
}

function processObject(sourceName, outName, targetLongest) {
  const png = read(sourceName);
  const box = keyOutAndBounds(png);
  const scale = targetLongest / Math.max(box.w, box.h);
  const outW = Math.max(1, Math.round(box.w * scale));
  const outH = Math.max(1, Math.round(box.h * scale));
  write(outName, resizeNearest(png, box, outW, outH));
  console.log(`${outName} ${outW}x${outH}`);
}

function processSet(sourceName, cells, targetLongest) {
  const png = read(sourceName);
  const cw = Math.floor(png.width / cells.cols);
  const ch = Math.floor(png.height / cells.rows);
  cells.items.forEach((item) => {
    const cell = new PNG({ width: cw, height: ch });
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const sx = item.col * cw + x;
        const sy = item.row * ch + y;
        const si = (sy * png.width + sx) * 4;
        const di = (y * cw + x) * 4;
        cell.data[di] = png.data[si];
        cell.data[di + 1] = png.data[si + 1];
        cell.data[di + 2] = png.data[si + 2];
        cell.data[di + 3] = png.data[si + 3];
      }
    }
    const box = keyOutAndBounds(cell);
    const scale = targetLongest / Math.max(box.w, box.h);
    const outW = Math.max(1, Math.round(box.w * scale));
    const outH = Math.max(1, Math.round(box.h * scale));
    write(item.out, resizeNearest(cell, box, outW, outH));
    console.log(`${item.out} ${outW}x${outH}`);
  });
}

function makeWorldTiles() {
  const grass = read("map.png");
  const pathPng = read("jalanan.png");
  const soil = read("tanah kebun.png");
  const pond = read("kolam.png");
  const tileDefs = [
    [grass, cropSquare(grass, 680, 600, 600), null],
    [grass, cropSquare(grass, 680, 360, 360), { mul: [0.94, 1.06, 0.94], add: [0, 4, 0] }],
    [pathPng, cropSquare(pathPng, 720), null],
    [pond, cropSquare(pond, 520, 610, 610), { mul: [0.8, 1.0, 1.1], add: [-8, 8, 12] }],
    [soil, cropSquare(soil, 720), { mul: [1.18, 1.1, 0.86], add: [16, 12, -8] }],
    [grass, cropSquare(grass, 680, 720, 720), { mul: [0.58, 0.58, 1.08], add: [24, 8, 52] }],
    [grass, cropSquare(grass, 680, 900, 540), { mul: [0.82, 1.05, 1.0], add: [-8, 8, 8] }],
    [grass, cropSquare(grass, 680, 500, 860), { mul: [1.0, 1.05, 0.92], add: [4, 6, 0] }],
    [soil, cropSquare(soil, 720, 380, 700), { mul: [0.94, 0.88, 0.82], add: [0, -6, -8] }],
    [grass, cropSquare(grass, 680, 960, 860), { mul: [0.5, 0.5, 0.92], add: [18, 0, 44] }],
  ];
  const out = new PNG({ width: TILE * tileDefs.length, height: TILE });
  tileDefs.forEach(([png, box, tint], idx) => {
    const tile = resizeBox(png, box, TILE, TILE, tint);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const si = (y * TILE + x) * 4;
        const di = (y * out.width + idx * TILE + x) * 4;
        out.data[di] = tile.data[si];
        out.data[di + 1] = tile.data[si + 1];
        out.data[di + 2] = tile.data[si + 2];
        out.data[di + 3] = tile.data[si + 3];
      }
    }
  });
  write("worldtiles.png", out);
  console.log(`worldtiles.png ${out.width}x${out.height}`);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  makeWorldTiles();
  processObject("kolam.png", "pond.png", 300);
  processObject("pohon.png", "tree.png", 118);
  processObject("bangunan 1.png", "building_1.png", 230);
  processObject("bangunan 2.png", "building_2.png", 230);
  processObject("bangunan 3.png", "building_3.png", 210);
  processSet("rumput.png", {
    rows: 1,
    cols: 3,
    items: [
      { row: 0, col: 0, out: "grass_1.png" },
      { row: 0, col: 1, out: "grass_2.png" },
      { row: 0, col: 2, out: "grass_3.png" },
    ],
  }, 42);
  processSet("pancingan.png", {
    rows: 2,
    cols: 2,
    items: [
      { row: 0, col: 0, out: "fish_rod.png" },
      { row: 0, col: 1, out: "fish_bobber.png" },
    ],
  }, 72);
}

main();
