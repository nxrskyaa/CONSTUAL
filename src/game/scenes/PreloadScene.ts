import Phaser from "phaser";

export const TILE_SIZE = 32;

// Tile indices inside the generated "tiles" tileset texture.
export const TILE = {
  GRASS: 0,
  PATH: 1,
  WATER: 2, // collides
  TREE: 3, // collides
} as const;

/**
 * PreloadScene
 *
 * The game ships no binary art assets — every texture is generated at runtime
 * with Phaser graphics so the build stays self-contained. This scene creates the
 * tileset, the player, two NPC sprites, and a few props, then starts the world.
 */
export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  preload(): void {
    // Show a simple loading label while textures are built.
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, "Loading Constual World...", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#c8f169",
      })
      .setOrigin(0.5);
  }

  create(): void {
    this.buildTileset();
    this.buildCharacter("player", 0x6ee7ff, 0x0f1424);
    this.buildCharacter("npc-tirta", 0x9be15d, 0x0f1424);
    this.buildCharacter("npc-hangat", 0xffb35c, 0x0f1424);
    this.buildMarker();
    this.buildPortal();

    this.scene.start("MainWorldScene");
  }

  private buildTileset(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const t = TILE_SIZE;

    // 0: grass
    g.fillStyle(0x2f7d46, 1).fillRect(0 * t, 0, t, t);
    g.fillStyle(0x3a9457, 1).fillRect(0 * t + 4, 6, 3, 3).fillRect(0 * t + 20, 18, 3, 3).fillRect(0 * t + 12, 24, 3, 3);

    // 1: path
    g.fillStyle(0xc9a36a, 1).fillRect(1 * t, 0, t, t);
    g.fillStyle(0xb88f57, 1).fillRect(1 * t + 6, 8, 4, 4).fillRect(1 * t + 18, 20, 4, 4);

    // 2: water
    g.fillStyle(0x2b6cb0, 1).fillRect(2 * t, 0, t, t);
    g.fillStyle(0x4a90d9, 1).fillRect(2 * t + 3, 7, 12, 2).fillRect(2 * t + 16, 18, 12, 2);

    // 3: tree / wall
    g.fillStyle(0x2f7d46, 1).fillRect(3 * t, 0, t, t);
    g.fillStyle(0x7a4a25, 1).fillRect(3 * t + 13, 18, 6, 12);
    g.fillStyle(0x1f6b39, 1).fillCircle(3 * t + 16, 13, 11);
    g.fillStyle(0x2f8f4d, 1).fillCircle(3 * t + 12, 11, 6);

    g.generateTexture("tiles", t * 4, t);
    g.destroy();
  }

  // Build a small top-down character chip: body + head + outline.
  private buildCharacter(key: string, body: number, outline: number): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const w = 24;
    const h = 30;

    // shadow
    g.fillStyle(0x000000, 0.25).fillEllipse(w / 2, h - 3, 18, 6);
    // body
    g.fillStyle(outline, 1).fillRoundedRect(2, 9, w - 4, h - 11, 5);
    g.fillStyle(body, 1).fillRoundedRect(4, 11, w - 8, h - 15, 4);
    // head
    g.fillStyle(outline, 1).fillCircle(w / 2, 8, 7);
    g.fillStyle(0xf3d9b1, 1).fillCircle(w / 2, 8, 5);

    g.generateTexture(key, w, h);
    g.destroy();
  }

  // A bobbing "!" marker shown above interactable NPCs.
  private buildMarker(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffe066, 1).fillRoundedRect(5, 0, 6, 12, 2);
    g.fillStyle(0xffe066, 1).fillRoundedRect(5, 14, 6, 5, 2);
    g.generateTexture("marker", 16, 20);
    g.destroy();
  }

  // A glowing pad that transitions into a focused ZoneScene.
  private buildPortal(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xc8f169, 0.25).fillCircle(20, 20, 20);
    g.fillStyle(0xc8f169, 0.55).fillCircle(20, 20, 13);
    g.fillStyle(0xeaffc2, 0.9).fillCircle(20, 20, 6);
    g.generateTexture("portal", 40, 40);
    g.destroy();
  }
}
