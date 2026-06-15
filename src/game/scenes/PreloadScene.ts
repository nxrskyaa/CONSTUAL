import Phaser from "phaser";
import { ALL_SPRITES, animKey } from "../config/sprites";
import { chromaKeyToCanvas } from "../utils/chromaKey";

export const TILE_SIZE = 32;

/**
 * PreloadScene
 *
 * Loads every character strip as a raw (magenta) image, then in create() runs
 * each through the chromaKey util to produce a transparent canvas texture,
 * registers uniform frames, and builds the animations declared in sprites.ts.
 * Shows a progress bar while loading.
 */
export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  preload(): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    this.cameras.main.setBackgroundColor("#0c1022");
    this.add
      .text(cx, cy - 60, "CONSTUAL WORLD", {
        fontFamily: "monospace",
        fontSize: "26px",
        color: "#c8f169",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(cx, cy + 48, "Summoning characters...", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#9aa6c8",
      })
      .setOrigin(0.5);

    const barW = Math.min(360, width * 0.7);
    const barX = cx - barW / 2;
    const barY = cy;
    const frame = this.add.graphics();
    frame.lineStyle(2, 0x3a4668, 1);
    frame.strokeRect(barX - 2, barY - 2, barW + 4, 18);
    const bar = this.add.graphics();

    const names = ALL_SPRITES.map((s) => s.key);
    this.load.on("progress", (value: number) => {
      bar.clear();
      bar.fillStyle(0xc8f169, 1);
      bar.fillRect(barX, barY, barW * value, 14);
      const idx = Math.min(names.length - 1, Math.floor(value * names.length));
      hint.setText(`Summoning ${names[idx]}...`);
    });

    for (const s of ALL_SPRITES) {
      this.load.image(`${s.key}__raw`, `/${s.file}`);
    }
  }

  create(): void {
    for (const s of ALL_SPRITES) {
      const rawKey = `${s.key}__raw`;
      const source = this.textures.get(rawKey).getSourceImage() as HTMLImageElement;
      const keyed = chromaKeyToCanvas(source, 60);

      // register transparent spritesheet under the clean key
      if (this.textures.exists(s.key)) this.textures.remove(s.key);
      const tex = this.textures.addCanvas(s.key, keyed);
      if (tex) {
        for (let i = 0; i < s.frameCount; i++) {
          tex.add(i, 0, i * s.frameWidth, 0, s.frameWidth, s.frameHeight);
        }
      }
      this.textures.remove(rawKey);

      for (const a of s.anims) {
        const key = animKey(s.key, a.name);
        if (this.anims.exists(key)) continue;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(s.key, { frames: a.frames }),
          frameRate: a.frameRate,
          repeat: a.repeat,
        });
      }
    }

    this.scene.start("MainWorldScene");
  }
}
