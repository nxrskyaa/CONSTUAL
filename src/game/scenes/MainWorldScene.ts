import Phaser from "phaser";
import { animKey, PLAYER_KEY } from "../config/sprites";
import { NPCS, npcDialogLines, type NpcDef } from "../data/npcs";
import { zones } from "../data/zones";
import { gameBridge, type HudPayload, type WalletState } from "../bridge";
import { WeatherSystem } from "../systems/WeatherSystem";
import { CloudSystem } from "../systems/CloudSystem";
import { createBuildings } from "../objects/Buildings";
import { TILE_SIZE } from "./PreloadScene";

const MAP_W = 50;
const MAP_H = 40;
const WORLD_W = MAP_W * TILE_SIZE; // 1600
const WORLD_H = MAP_H * TILE_SIZE; // 1280
const INTERACT_RANGE = 84;
const CAM_ZOOM = 1.5;
const PLAYER_SCALE = 0.3; // 220px frame -> ~66px, *zoom 1.5 -> ~99px on screen
const NPC_SCALE = 0.28;
const CHAR_PX = 220 * PLAYER_SCALE; // ~66

// pond footprint (tiles)
const POND = { tx: 16, ty: 24, tw: 8, th: 6 };

const T = { GRASS: 0, GRASS2: 1, PATH: 2, WATER: 3, SAND: 4, MYSTIC: 5, COAST: 6, FLOWER: 7 };

type Area = "forest" | "coast" | "desert" | "mystic" | "plaza";

interface Npc {
  def: NpcDef;
  sprite: Phaser.Types.Physics.Arcade.SpriteWithStaticBody;
  tag: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Text;
}

export default class MainWorldScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private npcs: Npc[] = [];
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private weather!: WeatherSystem;
  private clouds!: CloudSystem;
  private leafEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private waterTiles: Phaser.GameObjects.TileSprite[] = [];
  private interactLocked = false;
  private facing: 1 | -1 = 1;

  // mobile joystick
  private joystick = { active: false, dx: 0, dy: 0, baseX: 0, baseY: 0, pointerId: -1 };
  private joyBase?: Phaser.GameObjects.Image;
  private joyKnob?: Phaser.GameObjects.Image;
  private eBtn?: Phaser.GameObjects.Image;
  private eLabel?: Phaser.GameObjects.Text;

  // HUD
  private hud = { address: null as string | null, xp: 0, badges: 0, completed: 0, total: zones.length };
  private minimap!: Phaser.GameObjects.Graphics;
  private questText!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private completedZones = new Set<number>();

  constructor() {
    super("MainWorldScene");
  }

  create(): void {
    this.buildTextures();
    this.buildMap();
    this.solids = this.physics.add.staticGroup();

    this.cameras.main.setSize(this.scale.width, this.scale.height);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor("#13351f");
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    this.buildWater();
    this.buildScenery();
    this.spawnBuildings();
    this.spawnPlayer();
    this.spawnNpcs();
    this.physics.add.collider(this.player, this.solids);

    // camera: set zoom ONCE, smooth follow
    this.cameras.main.setZoom(CAM_ZOOM);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.createLeaves();
    this.createWaterSparkles();
    this.setupInput();
    this.createMobileControls();
    this.createHud();

    this.weather = new WeatherSystem(this);
    this.weather.create();
    this.clouds = new CloudSystem(this);

    // bridge wiring
    const offWallet = gameBridge.on("wallet:state", (s) => this.onWallet(s));
    const offHud = gameBridge.on("hud:update", (h) => this.onHud(h));
    const offResult = gameBridge.on("tx:result", (r) => {
      if (r.ok && r.kind === "quest") this.markZoneComplete(r.zoneId);
      this.interactLocked = false;
    });
    const offD = gameBridge.on("dialog:hide", () => (this.interactLocked = false));
    const offQ = gameBridge.on("quiz:hide", () => (this.interactLocked = false));

    const cachedWallet = this.registry.get("wallet") as WalletState | undefined;
    if (cachedWallet) this.onWallet(cachedWallet);
    const cachedHud = this.registry.get("hud") as HudPayload | undefined;
    if (cachedHud) this.onHud(cachedHud);

    // keep camera + HUD correct on viewport resize
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offWallet();
      offHud();
      offResult();
      offD();
      offQ();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    this.cameras.main.setSize(gameSize.width, gameSize.height);
    this.repositionUi();
  }

  // ---------------------------------------------------------------- textures
  private rect(g: Phaser.GameObjects.Graphics, c: number, x: number, y: number, w: number, h: number, a = 1) {
    g.fillStyle(c, a).fillRect(x, y, w, h);
  }

  private buildTextures(): void {
    const ts = TILE_SIZE;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    const grass = (base: number, fleck: number, ix: number) => {
      this.rect(g, base, ix * ts, 0, ts, ts);
      this.rect(g, fleck, ix * ts + 5, 7, 3, 3);
      this.rect(g, fleck, ix * ts + 20, 17, 3, 3);
      this.rect(g, fleck, ix * ts + 12, 25, 3, 3);
    };
    grass(0x2f7d46, 0x3f9657, T.GRASS);
    grass(0x357f4c, 0x4aa05f, T.GRASS2);
    this.rect(g, 0xc9a36a, T.PATH * ts, 0, ts, ts);
    this.rect(g, 0xb88f57, T.PATH * ts + 6, 8, 4, 4);
    this.rect(g, 0xb88f57, T.PATH * ts + 18, 20, 4, 4);
    this.rect(g, 0x2b6cb0, T.WATER * ts, 0, ts, ts);
    this.rect(g, 0xe2c98a, T.SAND * ts, 0, ts, ts);
    this.rect(g, 0xd2b774, T.SAND * ts + 8, 10, 4, 3);
    this.rect(g, 0xd2b774, T.SAND * ts + 20, 22, 4, 3);
    this.rect(g, 0x4a3b78, T.MYSTIC * ts, 0, ts, ts);
    this.rect(g, 0x5d4c92, T.MYSTIC * ts + 6, 9, 3, 3);
    this.rect(g, 0x7a68b8, T.MYSTIC * ts + 21, 20, 3, 3);
    grass(0x2f8f6a, 0x46a883, T.COAST);
    grass(0x2f7d46, 0x3f9657, T.FLOWER);
    this.rect(g, 0xff7ab0, T.FLOWER * ts + 9, 9, 4, 4);
    this.rect(g, 0xffd23f, T.FLOWER * ts + 19, 19, 4, 4);
    g.generateTexture("worldtiles", ts * 8, ts);
    g.clear();

    // animated water tile
    this.rect(g, 0x3366bb, 0, 0, ts, ts);
    g.fillStyle(0x5588dd, 0.5).fillRect(4, 8, 24, 4).fillRect(2, 18, 28, 4);
    g.fillStyle(0x73b4ec, 0.7).fillRect(6, 13, 8, 1).fillRect(20, 24, 8, 1);
    g.generateTexture("water_tile", ts, ts);
    g.clear();

    // trees
    g.fillStyle(0x000000, 0.18).fillEllipse(28, 60, 40, 12);
    this.rect(g, 0x7a4a25, 24, 40, 8, 20);
    g.fillStyle(0x1f6b39, 1).fillCircle(28, 30, 22);
    g.fillStyle(0x2f8f4d, 1).fillCircle(20, 24, 14);
    g.fillStyle(0x3aa85b, 1).fillCircle(34, 22, 12);
    g.fillStyle(0x57c878, 0.9).fillCircle(26, 18, 7);
    g.generateTexture("tree", 56, 68);
    g.clear();

    g.fillStyle(0x000000, 0.18).fillEllipse(22, 56, 32, 10);
    this.rect(g, 0x6b4220, 18, 40, 8, 16);
    g.fillStyle(0x1c6a46, 1).fillTriangle(22, 4, 4, 34, 40, 34);
    g.fillStyle(0x2a8a5c, 1).fillTriangle(22, 14, 8, 40, 36, 40);
    g.fillStyle(0x46b074, 0.9).fillTriangle(22, 24, 12, 46, 32, 46);
    g.generateTexture("tree2", 44, 60);
    g.clear();

    g.fillStyle(0x3f9657, 1).fillTriangle(3, 16, 1, 4, 6, 0);
    g.fillStyle(0x4fb06a, 1).fillTriangle(8, 16, 7, 6, 11, 2);
    g.generateTexture("blade", 12, 16);
    g.clear();

    this.rect(g, 0x3f9657, 7, 10, 2, 6);
    g.fillStyle(0xff6fae, 1).fillCircle(8, 7, 5);
    g.fillStyle(0xffe05a, 1).fillCircle(8, 7, 2);
    g.generateTexture("flower", 16, 18);
    g.clear();

    g.fillStyle(0x000000, 0.18).fillEllipse(11, 13, 20, 6);
    g.fillStyle(0x8a93a6, 1).fillEllipse(11, 9, 18, 12);
    g.fillStyle(0xaab2c4, 1).fillEllipse(8, 7, 8, 5);
    g.generateTexture("rock", 22, 16);
    g.clear();

    this.rect(g, 0x7a4a25, 2, 8, 36, 5);
    this.rect(g, 0x91612f, 2, 4, 36, 4);
    this.rect(g, 0x5e3a1d, 5, 13, 4, 8);
    this.rect(g, 0x5e3a1d, 31, 13, 4, 8);
    g.generateTexture("bench", 40, 22);
    g.clear();

    this.rect(g, 0x33384a, 6, 12, 4, 34);
    g.fillStyle(0x222634, 1).fillRect(2, 44, 12, 4);
    g.fillStyle(0xffe9a8, 1).fillCircle(8, 9, 7);
    g.fillStyle(0xfff6d8, 0.8).fillCircle(8, 9, 3);
    g.generateTexture("lamp", 16, 50);
    g.clear();

    this.rect(g, 0x7a4a25, 16, 18, 5, 22);
    g.fillStyle(0xe7c98c, 1).fillRoundedRect(2, 2, 34, 18, 3);
    g.lineStyle(2, 0x9c6b3a).strokeRoundedRect(2, 2, 34, 18, 3);
    g.generateTexture("sign", 40, 42);
    g.clear();

    // green-themed joystick + interact button
    g.fillStyle(0x000000, 0.3).fillCircle(60, 60, 56);
    g.lineStyle(3, 0x00ff88, 0.5).strokeCircle(60, 60, 56);
    g.generateTexture("joy_base", 120, 120);
    g.clear();
    g.fillStyle(0x00ff88, 0.7).fillCircle(28, 28, 24);
    g.lineStyle(2, 0xeaffe9, 0.7).strokeCircle(28, 28, 24);
    g.generateTexture("joy_knob", 56, 56);
    g.clear();
    g.fillStyle(0x00ff88, 0.3).fillCircle(42, 42, 38);
    g.lineStyle(3, 0x00ff88, 0.7).strokeCircle(42, 42, 38);
    g.generateTexture("btn_e", 84, 84);
    g.clear();

    if (!this.textures.exists("fx_leaf")) {
      g.fillStyle(0x8fcf5a, 1).fillRect(0, 0, 6, 6);
      g.generateTexture("fx_leaf", 6, 6);
      g.clear();
    }
    if (!this.textures.exists("fx_dot")) {
      g.fillStyle(0xffffff, 1).fillCircle(2, 2, 2);
      g.generateTexture("fx_dot", 4, 4);
      g.clear();
    }

    g.destroy();
  }

  // ---------------------------------------------------------------- map
  private areaOf(tx: number, ty: number): Area {
    const cx = MAP_W / 2;
    const cy = MAP_H / 2;
    if (Math.abs(tx - cx) <= 2 || Math.abs(ty - cy) <= 2) return "plaza";
    if (tx < cx && ty < cy) return "forest";
    if (tx < cx && ty >= cy) return "coast";
    if (tx >= cx && ty < cy) return "desert";
    return "mystic";
  }

  private inPond(tx: number, ty: number): boolean {
    return tx >= POND.tx && tx < POND.tx + POND.tw && ty >= POND.ty && ty < POND.ty + POND.th;
  }

  private buildMap(): void {
    const data: number[][] = [];
    for (let y = 0; y < MAP_H; y++) {
      const row: number[] = [];
      for (let x = 0; x < MAP_W; x++) {
        const a = this.areaOf(x, y);
        let tile = T.GRASS;
        if (a === "plaza") tile = T.PATH;
        else if (a === "forest") tile = Phaser.Math.Between(0, 9) < 2 ? T.FLOWER : Phaser.Math.Between(0, 1) ? T.GRASS : T.GRASS2;
        else if (a === "coast") tile = T.COAST;
        else if (a === "desert") tile = T.SAND;
        else tile = T.MYSTIC;
        row.push(tile);
      }
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = map.addTilesetImage("worldtiles", "worldtiles", TILE_SIZE, TILE_SIZE)!;
    const layer = map.createLayer(0, tileset, 0, 0)!;
    layer.setDepth(-10);
  }

  // ---------------------------------------------------------------- water
  private buildWater(): void {
    const px = POND.tx * TILE_SIZE;
    const py = POND.ty * TILE_SIZE;
    const pw = POND.tw * TILE_SIZE;
    const ph = POND.th * TILE_SIZE;
    const water = this.add.tileSprite(px, py, pw, ph, "water_tile").setOrigin(0).setDepth(0);
    water.setAlpha(0.85).setTint(0x4488cc);
    this.waterTiles.push(water);

    const block = this.add.rectangle(px + pw / 2, py + ph / 2, pw, ph).setVisible(false);
    this.physics.add.existing(block, true);
    this.solids.add(block);
  }

  private createWaterSparkles(): void {
    this.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        if (this.waterTiles.length === 0) return;
        const w = Phaser.Utils.Array.GetRandom(this.waterTiles);
        const x = w.x + Phaser.Math.Between(10, w.width - 10);
        const y = w.y + Phaser.Math.Between(10, w.height - 10);
        const s = this.add.graphics();
        s.fillStyle(0xaaddff, 0.85).fillCircle(0, 0, Phaser.Math.Between(1, 3));
        s.setPosition(x, y).setDepth(1);
        this.tweens.add({ targets: s, y: y - 8, alpha: 0, duration: Phaser.Math.Between(800, 1400), ease: "Power1", onComplete: () => s.destroy() });
      },
    });
  }

  private createLeaves(): void {
    this.leafEmitter = this.add
      .particles(0, 0, "fx_leaf", {
        lifespan: 4200,
        speedY: { min: 18, max: 40 },
        speedX: { min: -25, max: 25 },
        rotate: { min: 0, max: 360 },
        scale: { min: 0.7, max: 1.2 },
        alpha: { start: 0.9, end: 0 },
        gravityY: 8,
        quantity: 1,
        frequency: 700,
        tint: [0x8fcf5a, 0xd7e36a, 0xb6d44f],
        emitting: true,
      })
      .setDepth(900);
    const rect = new Phaser.Geom.Rectangle(0, 0, WORLD_W, WORLD_H * 0.5);
    this.leafEmitter.addEmitZone({
      type: "random",
      source: rect as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource,
    });
  }

  // ---------------------------------------------------------------- scenery
  private addSolidImage(x: number, y: number, key: string, scale = 1, bodyW = 0.5, bodyH = 0.3): Phaser.GameObjects.Image {
    const img = this.add.image(x, y, key).setOrigin(0.5, 1).setScale(scale);
    img.setDepth(y); // bottom-edge based depth
    this.physics.add.existing(img, true);
    const body = img.body as Phaser.Physics.Arcade.StaticBody;
    const w = img.displayWidth * bodyW;
    const h = img.displayHeight * bodyH;
    body.setSize(w, h);
    body.setOffset((img.width - w) / 2, img.height - h);
    this.solids.add(img);
    return img;
  }

  private addStaticCollider(x: number, y: number, w: number, h: number): void {
    const r = this.add.rectangle(x, y, w, h).setVisible(false);
    this.physics.add.existing(r, true);
    this.solids.add(r);
  }

  private buildScenery(): void {
    const ts = TILE_SIZE;
    const sway: Phaser.GameObjects.Image[] = [];

    const tryTree = (tx: number, ty: number) => {
      const a = this.areaOf(tx, ty);
      if (a === "plaza" || a === "desert" || a === "mystic") return;
      if (this.inPond(tx, ty)) return;
      const key = Phaser.Math.Between(0, 1) ? "tree" : "tree2";
      sway.push(this.addSolidImage(tx * ts + ts / 2, ty * ts + ts, key, 1, 0.3, 0.16));
    };
    for (let x = 0; x < MAP_W; x++) {
      tryTree(x, 0);
      tryTree(x, MAP_H - 1);
    }
    for (let y = 0; y < MAP_H; y++) {
      tryTree(0, y);
      tryTree(MAP_W - 1, y);
    }
    for (let i = 0; i < 40; i++) tryTree(Phaser.Math.Between(1, MAP_W - 2), Phaser.Math.Between(1, MAP_H - 2));

    for (const t of sway) {
      this.tweens.add({
        targets: t,
        angle: { from: -2, to: 2 },
        duration: Phaser.Math.Between(2500, 4000),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Phaser.Math.Between(0, 1000),
      });
    }

    // zone signboards (depth = bottom edge)
    this.addSign(14 * ts, 3 * ts, "Forest Clinic");
    this.addSign(12 * ts, 23 * ts, "Coastal Springs");
    this.addSign(36 * ts, 3 * ts, "Builder Bazaar");
    this.addSign(34 * ts, 23 * ts, "Mystic Grove");

    const decor = (key: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const tx = Phaser.Math.Between(2, MAP_W - 2);
        const ty = Phaser.Math.Between(2, MAP_H - 2);
        if (this.areaOf(tx, ty) === "plaza" || this.inPond(tx, ty)) continue;
        const img = this.add.image(tx * ts, ty * ts, key).setOrigin(0.5, 1);
        img.setDepth(ty * ts);
      }
    };
    decor("flower", 60);
    decor("rock", 18);
    decor("lamp", 10);
    decor("bench", 8);

    for (let i = 0; i < 50; i++) {
      const tx = Phaser.Math.Between(2, MAP_W - 2);
      const ty = Phaser.Math.Between(2, MAP_H - 2);
      if (this.inPond(tx, ty)) continue;
      const b = this.add.image(tx * ts, ty * ts, "blade").setOrigin(0.5, 1).setDepth(ty * ts - 1).setScale(Phaser.Math.FloatBetween(0.8, 1.4));
      this.tweens.add({ targets: b, angle: Phaser.Math.FloatBetween(6, 12), duration: Phaser.Math.Between(1200, 2200), yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  private spawnBuildings(): void {
    const buildings = createBuildings(this);
    for (const b of buildings) {
      const cw = (b.getData("collW") as number) ?? 80;
      const ch = (b.getData("collH") as number) ?? 24;
      this.addStaticCollider(b.x, b.y - ch / 2, cw, ch);
    }
  }

  private addSign(x: number, y: number, label: string): void {
    this.addSolidImage(x, y, "sign", 1, 0.4, 0.4);
    this.add
      .text(x, y - 30, label, { fontFamily: "monospace", fontSize: "9px", color: "#5e3a1d", fontStyle: "bold", align: "center" })
      .setOrigin(0.5)
      .setDepth(y + 1);
  }

  // ---------------------------------------------------------------- player
  private spawnPlayer(): void {
    this.player = this.physics.add.sprite(25 * TILE_SIZE, 20 * TILE_SIZE, PLAYER_KEY, 0);
    this.player.setScale(PLAYER_SCALE); // set ONCE
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(110, 70);
    this.player.body.setOffset(55, 140);
    this.player.play(animKey(PLAYER_KEY, "idle"));
  }

  // ---------------------------------------------------------------- npcs
  private spawnNpcs(): void {
    for (const def of NPCS) {
      const x = def.tileX * TILE_SIZE + TILE_SIZE / 2;
      const y = def.tileY * TILE_SIZE + TILE_SIZE;
      const sprite = this.physics.add.staticSprite(x, y, def.spriteKey, 0).setScale(NPC_SCALE).setOrigin(0.5, 0.85);
      sprite.play(animKey(def.spriteKey, "idle"));
      sprite.setInteractive({ useHandCursor: true });
      sprite.on("pointerdown", () => this.interactWith(def));

      // gentle staggered idle bob
      this.tweens.add({
        targets: sprite,
        y: y - 4,
        duration: Phaser.Math.Between(900, 1300),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Phaser.Math.Between(0, 600),
      });

      const tag = this.add
        .text(x, y - CHAR_PX, def.name, {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#e8f4fd",
          backgroundColor: "#080814cc",
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5);

      const bubble = this.add
        .text(x, y - CHAR_PX - 12, "!", { fontFamily: "monospace", fontSize: "16px", color: "#ffe066", fontStyle: "bold" })
        .setOrigin(0.5)
        .setVisible(false);

      // occasional music note via timer (not in update)
      this.time.addEvent({
        delay: Phaser.Math.Between(6000, 12000),
        loop: true,
        callback: () => {
          if (!sprite.visible) return;
          const note = this.add
            .text(sprite.x + 12, sprite.y - CHAR_PX, "♪", { fontFamily: "monospace", fontSize: "14px", color: "#9fe7ff" })
            .setOrigin(0.5)
            .setDepth(sprite.y + 2);
          this.tweens.add({ targets: note, y: note.y - 26, alpha: 0, duration: 1600, onComplete: () => note.destroy() });
        },
      });

      this.npcs.push({ def, sprite, tag, bubble });
    }
  }

  private markZoneComplete(zoneId: number): void {
    this.completedZones.add(zoneId);
    const n = this.npcs.find((e) => e.def.zoneId === zoneId);
    if (n) {
      n.sprite.setTint(0x00ff88);
      n.tag.setText(n.def.name + " ✓");
    }
    this.refreshHud();
  }

  // ---------------------------------------------------------------- input
  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
    this.keyShift = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyE.on("down", () => this.tryInteract());
  }

  private createMobileControls(): void {
    // show on touch devices, or on narrow viewports (covers emulators/small screens)
    if (!this.sys.game.device.input.touch && this.scale.width >= 820) return;
    this.joyBase = this.add.image(0, 0, "joy_base").setScrollFactor(0).setDepth(6000).setAlpha(0.85);
    this.joyKnob = this.add.image(0, 0, "joy_knob").setScrollFactor(0).setDepth(6001).setAlpha(0.95);
    this.eBtn = this.add.image(0, 0, "btn_e").setScrollFactor(0).setDepth(6000).setInteractive({ useHandCursor: true });
    this.eLabel = this.add.text(0, 0, "E", { fontFamily: '"Press Start 2P", monospace', fontSize: "16px", color: "#00ff88" }).setOrigin(0.5).setScrollFactor(0).setDepth(6002);
    this.eBtn.on("pointerdown", () => this.tryInteract());
    this.placeMobileControls();

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.joystick.pointerId !== -1 || !this.joyBase) return;
      if (p.x < this.scale.width * 0.5 && p.y > this.scale.height * 0.4) {
        this.joystick.pointerId = p.id;
        this.joystick.active = true;
        this.joystick.baseX = this.joyBase.x;
        this.joystick.baseY = this.joyBase.y;
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joystick.pointerId || !this.joyKnob) return;
      const dx = p.x - this.joystick.baseX;
      const dy = p.y - this.joystick.baseY;
      const dist = Math.min(Math.hypot(dx, dy), 44);
      const ang = Math.atan2(dy, dx);
      this.joyKnob.setPosition(this.joystick.baseX + Math.cos(ang) * dist, this.joystick.baseY + Math.sin(ang) * dist);
      this.joystick.dx = (Math.cos(ang) * dist) / 44;
      this.joystick.dy = (Math.sin(ang) * dist) / 44;
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joystick.pointerId) return;
      this.joystick = { active: false, dx: 0, dy: 0, baseX: this.joystick.baseX, baseY: this.joystick.baseY, pointerId: -1 };
      this.joyKnob?.setPosition(this.joyBase!.x, this.joyBase!.y);
    };
    this.input.on("pointerup", release);
    this.input.on("pointerupoutside", release);
  }

  private placeMobileControls(): void {
    if (!this.joyBase) return;
    const h = this.scale.height;
    const w = this.scale.width;
    this.joyBase.setPosition(96, h - 96);
    if (!this.joystick.active) this.joyKnob?.setPosition(96, h - 96);
    this.eBtn?.setPosition(w - 80, h - 96);
    this.eLabel?.setPosition(w - 80, h - 96);
  }

  // ---------------------------------------------------------------- HUD
  private createHud(): void {
    this.minimap = this.add.graphics().setScrollFactor(0).setDepth(6000);
    this.questText = this.add
      .text(12, 64, "", { fontFamily: "monospace", fontSize: "11px", color: "#e8f4fd", backgroundColor: "#080814dd", padding: { x: 8, y: 6 } })
      .setScrollFactor(0)
      .setDepth(6000);
    this.prompt = this.add
      .text(0, 0, "[E] Talk", { fontFamily: "monospace", fontSize: "12px", color: "#06210f", backgroundColor: "#00ff88", padding: { x: 6, y: 3 } })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(6500)
      .setVisible(false);
    this.refreshHud();
  }

  private onWallet(s: WalletState): void {
    this.hud.address = s.address;
  }

  private onHud(h: HudPayload): void {
    this.hud = { ...this.hud, ...h };
    this.refreshHud();
  }

  private refreshHud(): void {
    const done = Math.max(this.hud.completed, this.completedZones.size);
    this.questText?.setText(`QUEST  ${done}/${this.hud.total}\nFind all 5 teachers`);
  }

  private repositionUi(): void {
    this.placeMobileControls();
    this.questText?.setPosition(12, 64);
  }

  private drawMinimap(): void {
    const mmW = 120;
    const mmH = 96;
    const ox = this.scale.width - mmW - 12;
    const oy = 92; // below the React wallet chip
    const sx = mmW / WORLD_W;
    const sy = mmH / WORLD_H;
    const g = this.minimap;
    g.clear();
    g.fillStyle(0x080814, 0.7).fillRect(ox - 3, oy - 3, mmW + 6, mmH + 6);
    g.lineStyle(1, 0x00ff88, 0.5).strokeRect(ox - 3, oy - 3, mmW + 6, mmH + 6);
    const zoneColors: Record<Area, number> = { forest: 0x2f7d46, coast: 0x2f8f6a, desert: 0xc9a25a, mystic: 0x4a3b78, plaza: 0xb88f57 };
    for (const a of ["forest", "coast", "desert", "mystic"] as Area[]) {
      const cx = a === "forest" || a === "coast" ? 0 : WORLD_W / 2;
      const cy = a === "forest" || a === "desert" ? 0 : WORLD_H / 2;
      g.fillStyle(zoneColors[a], 0.85).fillRect(ox + cx * sx, oy + cy * sy, (WORLD_W / 2) * sx, (WORLD_H / 2) * sy);
    }
    for (const n of this.npcs) {
      g.fillStyle(n.def.zoneId != null ? 0xffe066 : 0x00ff88, 1);
      g.fillCircle(ox + n.sprite.x * sx, oy + n.sprite.y * sy, 1.8);
    }
    g.fillStyle(0xff5d6c, 1).fillCircle(ox + this.player.x * sx, oy + this.player.y * sy, 2.6);
  }

  // ---------------------------------------------------------------- interact
  private tryInteract(): void {
    if (this.interactLocked) return;
    let nearest: NpcDef | null = null;
    let best = INTERACT_RANGE;
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.sprite.x, n.sprite.y);
      if (d < best) {
        best = d;
        nearest = n.def;
      }
    }
    if (nearest) this.interactWith(nearest);
  }

  private interactWith(def: NpcDef): void {
    if (this.interactLocked) return;
    const nx = def.tileX * TILE_SIZE + TILE_SIZE / 2;
    const ny = def.tileY * TILE_SIZE + TILE_SIZE;
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, nx, ny) > INTERACT_RANGE * 2) return;
    this.interactLocked = true;
    this.player.setVelocity(0, 0);
    this.player.anims.play(animKey(PLAYER_KEY, "idle"), true);
    gameBridge.emit("dialog:show", {
      zoneId: def.zoneId,
      npcKey: def.key,
      npcName: def.name,
      lines: npcDialogLines(def),
    });
  }

  // ---------------------------------------------------------------- update
  update(): void {
    this.weather?.update(0, this.game.loop.delta);
    for (const w of this.waterTiles) {
      w.tilePositionX += 0.3;
      w.tilePositionY = Math.sin(this.time.now * 0.001) * 1.5;
    }
    this.drawMinimap();
    this.updateNpcs();

    if (!this.player?.body) return;
    const body = this.player.body;
    body.setVelocity(0);

    if (this.interactLocked) {
      this.player.setDepth(this.player.y);
      return;
    }

    const speed = this.keyShift.isDown ? 215 : 140;
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -speed;
    if (this.cursors.right.isDown || this.wasd.D.isDown) vx = speed;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -speed;
    if (this.cursors.down.isDown || this.wasd.S.isDown) vy = speed;

    if (this.joystick.active) {
      vx += this.joystick.dx * speed;
      vy += this.joystick.dy * speed;
    }

    // normalize diagonal
    if (vx !== 0 && vy !== 0) {
      const inv = 1 / Math.hypot(vx, vy);
      vx = vx * inv * speed;
      vy = vy * inv * speed;
    }

    body.setVelocity(vx, vy);

    const moving = vx !== 0 || vy !== 0;
    const joyMag = Math.hypot(this.joystick.dx, this.joystick.dy);
    const running = this.keyShift.isDown || joyMag > 0.85;

    if (moving) {
      if (vx < -1) this.facing = -1;
      else if (vx > 1) this.facing = 1;
      this.player.setFlipX(this.facing === -1);
      this.player.anims.play(animKey(PLAYER_KEY, running ? "run" : "walk"), true);
    } else {
      this.player.anims.play(animKey(PLAYER_KEY, "idle"), true);
    }

    this.player.setDepth(this.player.y);

    // NPC prompt
    let nearest: Npc | null = null;
    let best = INTERACT_RANGE;
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.sprite.x, n.sprite.y);
      n.bubble.setVisible(n.sprite.visible && d < INTERACT_RANGE * 1.6);
      if (d < best) {
        best = d;
        nearest = n;
      }
    }
    if (nearest) {
      const cam = this.cameras.main;
      this.prompt.setVisible(true);
      this.prompt.setPosition((nearest.sprite.x - cam.worldView.x) * cam.zoom, (nearest.sprite.y - CHAR_PX - cam.worldView.y) * cam.zoom);
    } else {
      this.prompt.setVisible(false);
    }
  }

  private updateNpcs(): void {
    const view = this.cameras.main.worldView;
    for (const n of this.npcs) {
      const visible = Phaser.Geom.Rectangle.Overlaps(view, new Phaser.Geom.Rectangle(n.sprite.x - 60, n.sprite.y - 90, 120, 130));
      n.sprite.setVisible(visible);
      n.tag.setVisible(visible);
      if (!visible) {
        n.bubble.setVisible(false);
        continue;
      }
      n.sprite.setDepth(n.sprite.y);
      n.tag.setPosition(n.sprite.x, n.sprite.y - CHAR_PX).setDepth(n.sprite.y + 1);
      n.bubble.setPosition(n.sprite.x, n.sprite.y - CHAR_PX - 12).setDepth(n.sprite.y + 1);
    }
  }
}
