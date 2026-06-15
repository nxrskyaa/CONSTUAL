import Phaser from "phaser";
import { animKey, PLAYER_KEY } from "../config/sprites";
import { NPCS, npcDialogLines, type NpcDef } from "../data/npcs";
import { zones } from "../data/zones";
import { gameBridge, type HudPayload, type WalletState } from "../bridge";
import { WeatherSystem } from "../systems/WeatherSystem";
import { TILE_SIZE } from "./PreloadScene";

const MAP_W = 40;
const MAP_H = 30;
const WORLD_W = MAP_W * TILE_SIZE;
const WORLD_H = MAP_H * TILE_SIZE;
const INTERACT_RANGE = 70;
const CHAR_DISPLAY = 78; // on-screen size of 220px frames

// tileset indices
const T = { GRASS: 0, GRASS2: 1, PATH: 2, WATER: 3, SAND: 4, MYSTIC: 5, COAST: 6, FLOWER: 7 };

type Area = "forest" | "coast" | "desert" | "mystic" | "plaza";

interface Npc {
  def: NpcDef;
  sprite: Phaser.Types.Physics.Arcade.SpriteWithStaticBody;
  tag: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Text;
  homeX: number;
  homeY: number;
  wanderAt: number;
  noteAt: number;
}

export default class MainWorldScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<"W" | "A" | "S" | "D" | "E" | "SHIFT", Phaser.Input.Keyboard.Key>;
  private npcs: Npc[] = [];
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private weather!: WeatherSystem;
  private leafEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private waterSparkle!: Phaser.GameObjects.Particles.ParticleEmitter;
  private waterTiles: Phaser.GameObjects.TileSprite[] = [];
  private interactLocked = false;
  private facing: 1 | -1 = 1;

  // mobile controls
  private isTouch = false;
  private joyBase?: Phaser.GameObjects.Image;
  private joyKnob?: Phaser.GameObjects.Image;
  private joyPointerId = -1;
  private joyVec = new Phaser.Math.Vector2(0, 0);

  // HUD
  private hud = { address: null as string | null, xp: 0, badges: 0, completed: 0, total: zones.length };
  private hudText!: Phaser.GameObjects.Text;
  private xpBar!: Phaser.GameObjects.Graphics;
  private minimap!: Phaser.GameObjects.Graphics;
  private questText!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private completedZones = new Set<number>();

  constructor() {
    super("MainWorldScene");
  }

  create(): void {
    this.isTouch = this.sys.game.device.input.touch || this.scale.width < 820;
    this.buildTextures();
    this.buildMap();
    this.solids = this.physics.add.staticGroup();

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor("#13351f");
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    this.buildWater();
    this.buildScenery();
    this.spawnPlayer();
    this.spawnNpcs();
    this.physics.add.collider(this.player, this.solids);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    // leaves emitter (pooled particles)
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
        frequency: 650,
        tint: [0x8fcf5a, 0xd7e36a, 0xb6d44f],
        emitting: true,
      })
      .setDepth(900);
    const leafRect = new Phaser.Geom.Rectangle(0, 0, WORLD_W, WORLD_H * 0.5);
    const leafZone: Phaser.Types.GameObjects.Particles.ParticleEmitterRandomZoneConfig = {
      type: "random",
      // Rectangle is a valid runtime random source; its generic getRandomPoint
      // signature just doesn't line up with Phaser's RandomZoneSource type.
      source: leafRect as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource,
    };
    this.leafEmitter.addEmitZone(leafZone);

    this.setupInput();
    this.createMobileControls();
    this.createHud();

    this.weather = new WeatherSystem(this);
    this.weather.create();

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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offWallet();
      offHud();
      offResult();
      offD();
      offQ();
    });
  }

  // ---------------------------------------------------------------- textures
  private rect(g: Phaser.GameObjects.Graphics, c: number, x: number, y: number, w: number, h: number, a = 1) {
    g.fillStyle(c, a).fillRect(x, y, w, h);
  }

  private buildTextures(): void {
    const ts = TILE_SIZE;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // tileset: 8 tiles in a row
    const grass = (base: number, fleck: number, ix: number) => {
      this.rect(g, base, ix * ts, 0, ts, ts);
      this.rect(g, fleck, ix * ts + 5, 7, 3, 3);
      this.rect(g, fleck, ix * ts + 20, 17, 3, 3);
      this.rect(g, fleck, ix * ts + 12, 25, 3, 3);
    };
    grass(0x2f7d46, 0x3f9657, T.GRASS);
    grass(0x357f4c, 0x4aa05f, T.GRASS2);
    // path
    this.rect(g, 0xc9a36a, T.PATH * ts, 0, ts, ts);
    this.rect(g, 0xb88f57, T.PATH * ts + 6, 8, 4, 4);
    this.rect(g, 0xb88f57, T.PATH * ts + 18, 20, 4, 4);
    // water base
    this.rect(g, 0x2b6cb0, T.WATER * ts, 0, ts, ts);
    // sand
    this.rect(g, 0xe2c98a, T.SAND * ts, 0, ts, ts);
    this.rect(g, 0xd2b774, T.SAND * ts + 8, 10, 4, 3);
    this.rect(g, 0xd2b774, T.SAND * ts + 20, 22, 4, 3);
    // mystic ground
    this.rect(g, 0x4a3b78, T.MYSTIC * ts, 0, ts, ts);
    this.rect(g, 0x5d4c92, T.MYSTIC * ts + 6, 9, 3, 3);
    this.rect(g, 0x7a68b8, T.MYSTIC * ts + 21, 20, 3, 3);
    // coast grass
    grass(0x2f8f6a, 0x46a883, T.COAST);
    // flower grass
    grass(0x2f7d46, 0x3f9657, T.FLOWER);
    this.rect(g, 0xff7ab0, T.FLOWER * ts + 9, 9, 4, 4);
    this.rect(g, 0xffd23f, T.FLOWER * ts + 19, 19, 4, 4);
    g.generateTexture("worldtiles", ts * 8, ts);
    g.clear();

    // animated water tile (for TileSprite)
    this.rect(g, 0x2b6cb0, 0, 0, ts, ts);
    g.fillStyle(0x4a90d9, 0.9).fillRect(3, 7, 13, 2).fillRect(17, 18, 12, 2).fillRect(8, 24, 10, 2);
    g.fillStyle(0x73b4ec, 0.8).fillRect(6, 13, 8, 1).fillRect(20, 9, 8, 1);
    g.generateTexture("water_anim", ts, ts);
    g.clear();

    // tree (trunk + layered canopy)
    g.fillStyle(0x000000, 0.18).fillEllipse(28, 60, 40, 12);
    this.rect(g, 0x7a4a25, 24, 40, 8, 20);
    g.fillStyle(0x1f6b39, 1).fillCircle(28, 30, 22);
    g.fillStyle(0x2f8f4d, 1).fillCircle(20, 24, 14);
    g.fillStyle(0x3aa85b, 1).fillCircle(34, 22, 12);
    g.fillStyle(0x57c878, 0.9).fillCircle(26, 18, 7);
    g.generateTexture("tree", 56, 68);
    g.clear();

    // pine-ish second tree
    g.fillStyle(0x000000, 0.18).fillEllipse(22, 56, 32, 10);
    this.rect(g, 0x6b4220, 18, 40, 8, 16);
    g.fillStyle(0x1c6a46, 1).fillTriangle(22, 4, 4, 34, 40, 34);
    g.fillStyle(0x2a8a5c, 1).fillTriangle(22, 14, 8, 40, 36, 40);
    g.fillStyle(0x46b074, 0.9).fillTriangle(22, 24, 12, 46, 32, 46);
    g.generateTexture("tree2", 44, 60);
    g.clear();

    // grass blade
    g.fillStyle(0x3f9657, 1).fillTriangle(3, 16, 1, 4, 6, 0);
    g.fillStyle(0x4fb06a, 1).fillTriangle(8, 16, 7, 6, 11, 2);
    g.generateTexture("blade", 12, 16);
    g.clear();

    // flower prop
    this.rect(g, 0x3f9657, 7, 10, 2, 6);
    g.fillStyle(0xff6fae, 1).fillCircle(8, 7, 5);
    g.fillStyle(0xffe05a, 1).fillCircle(8, 7, 2);
    g.generateTexture("flower", 16, 18);
    g.clear();

    // rock
    g.fillStyle(0x000000, 0.18).fillEllipse(11, 13, 20, 6);
    g.fillStyle(0x8a93a6, 1).fillEllipse(11, 9, 18, 12);
    g.fillStyle(0xaab2c4, 1).fillEllipse(8, 7, 8, 5);
    g.generateTexture("rock", 22, 16);
    g.clear();

    // bench
    this.rect(g, 0x7a4a25, 2, 8, 36, 5);
    this.rect(g, 0x91612f, 2, 4, 36, 4);
    this.rect(g, 0x5e3a1d, 5, 13, 4, 8);
    this.rect(g, 0x5e3a1d, 31, 13, 4, 8);
    g.generateTexture("bench", 40, 22);
    g.clear();

    // lamp
    this.rect(g, 0x33384a, 6, 12, 4, 34);
    g.fillStyle(0x222634, 1).fillRect(2, 44, 12, 4);
    g.fillStyle(0xffe9a8, 1).fillCircle(8, 9, 7);
    g.fillStyle(0xfff6d8, 0.8).fillCircle(8, 9, 3);
    g.generateTexture("lamp", 16, 50);
    g.clear();

    // fence
    this.rect(g, 0x9c6b3a, 0, 8, 32, 4);
    this.rect(g, 0x9c6b3a, 0, 16, 32, 4);
    this.rect(g, 0x7a4a25, 3, 4, 5, 20);
    this.rect(g, 0x7a4a25, 24, 4, 5, 20);
    g.generateTexture("fence", 32, 26);
    g.clear();

    // sign (post + board)
    this.rect(g, 0x7a4a25, 16, 18, 5, 22);
    g.fillStyle(0xe7c98c, 1).fillRoundedRect(2, 2, 34, 18, 3);
    g.lineStyle(2, 0x9c6b3a).strokeRoundedRect(2, 2, 34, 18, 3);
    g.generateTexture("sign", 40, 42);
    g.clear();

    // buildings
    this.buildHouse(g, "build_clinic", 0xf4f7fb, 0x6ee7ff, "+");
    this.buildHouse(g, "build_house", 0xf3e2c7, 0xc8f169, "");
    this.buildHouse(g, "build_shop", 0xffe4c4, 0xffb35c, "");
    this.buildShrine(g);

    // billboard
    g.fillStyle(0x0f1424, 1).fillRoundedRect(0, 0, 120, 56, 6);
    g.lineStyle(3, 0xc8f169).strokeRoundedRect(2, 2, 116, 52, 6);
    this.rect(g, 0x223018, 8, 50, 6, 16);
    this.rect(g, 0x223018, 106, 50, 6, 16);
    g.generateTexture("billboard", 120, 70);
    g.clear();

    // joystick
    g.fillStyle(0xffffff, 0.14).fillCircle(60, 60, 58);
    g.lineStyle(3, 0xffffff, 0.35).strokeCircle(60, 60, 58);
    g.generateTexture("joy_base", 120, 120);
    g.clear();
    g.fillStyle(0xc8f169, 0.6).fillCircle(28, 28, 26);
    g.lineStyle(3, 0xffffff, 0.7).strokeCircle(28, 28, 26);
    g.generateTexture("joy_knob", 56, 56);
    g.clear();

    // interact button
    g.fillStyle(0x6ee7ff, 0.32).fillCircle(42, 42, 40);
    g.lineStyle(3, 0xffffff, 0.7).strokeCircle(42, 42, 40);
    g.generateTexture("btn_e", 84, 84);
    g.clear();

    // leaf (in case WeatherSystem hasn't made it yet)
    if (!this.textures.exists("fx_leaf")) {
      g.fillStyle(0x8fcf5a, 1).fillRect(0, 0, 6, 6);
      g.generateTexture("fx_leaf", 6, 6);
      g.clear();
    }

    g.destroy();
  }

  private buildHouse(g: Phaser.GameObjects.Graphics, key: string, wall: number, roof: number, mark: string): void {
    g.clear();
    g.fillStyle(0x000000, 0.18).fillEllipse(48, 92, 70, 12);
    this.rect(g, wall, 12, 36, 72, 52);
    g.fillStyle(roof, 1).fillTriangle(6, 38, 90, 38, 48, 8);
    this.rect(g, 0x6b4a2a, 40, 60, 18, 28); // door
    this.rect(g, 0x8fd0ff, 18, 46, 14, 14); // window
    this.rect(g, 0x8fd0ff, 64, 46, 14, 14);
    if (mark) {
      g.fillStyle(0xff5d6c, 1).fillRect(45, 16, 8, 3).fillRect(47.5, 13.5, 3, 8);
    }
    g.generateTexture(key, 96, 96);
  }

  private buildShrine(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    g.fillStyle(0x000000, 0.2).fillEllipse(40, 92, 64, 12);
    this.rect(g, 0x3a2c5e, 14, 30, 8, 58);
    this.rect(g, 0x3a2c5e, 58, 30, 8, 58);
    g.fillStyle(0x6a4ca0, 1).fillRect(6, 18, 68, 12);
    g.fillStyle(0x8a6fce, 1).fillRect(2, 10, 76, 10);
    g.fillStyle(0xc792ff, 0.9).fillCircle(40, 60, 12);
    g.fillStyle(0xe9d6ff, 0.9).fillCircle(40, 60, 5);
    g.generateTexture("build_shrine", 80, 96);
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
    // pond in the coast quadrant
    const px = 3 * TILE_SIZE;
    const py = 19 * TILE_SIZE;
    const pw = 7 * TILE_SIZE;
    const ph = 6 * TILE_SIZE;
    const water = this.add.tileSprite(px, py, pw, ph, "water_anim").setOrigin(0).setDepth(-5);
    this.waterTiles.push(water);

    // block walking onto water
    const block = this.add.rectangle(px + pw / 2, py + ph / 2, pw, ph).setVisible(false);
    this.physics.add.existing(block, true);
    this.solids.add(block);

    // sparkles on the surface
    this.waterSparkle = this.add
      .particles(0, 0, "fx_dot", {
        x: { min: px, max: px + pw },
        y: { min: py, max: py + ph },
        lifespan: 1800,
        speedY: { min: -10, max: -2 },
        scale: { min: 0.5, max: 1.4 },
        alpha: { start: 0.8, end: 0 },
        quantity: 1,
        frequency: 320,
        tint: 0xdff3ff,
      })
      .setDepth(-4);
  }

  // ---------------------------------------------------------------- scenery
  private addSolidImage(x: number, y: number, key: string, scale = 1, bodyW = 0.5, bodyH = 0.3): Phaser.GameObjects.Image {
    const img = this.add.image(x, y, key).setOrigin(0.5, 1).setScale(scale);
    img.setDepth(y);
    this.physics.add.existing(img, true);
    const body = img.body as Phaser.Physics.Arcade.StaticBody;
    const w = img.displayWidth * bodyW;
    const h = img.displayHeight * bodyH;
    body.setSize(w, h);
    body.setOffset((img.width - w) / 2, img.height - h);
    this.solids.add(img);
    return img;
  }

  private buildScenery(): void {
    const ts = TILE_SIZE;
    const swayTargets: Phaser.GameObjects.Image[] = [];

    // border + scattered trees (avoid plaza & water)
    const tryTree = (tx: number, ty: number) => {
      const a = this.areaOf(tx, ty);
      if (a === "plaza" || a === "desert" || a === "mystic") return;
      if (tx >= 3 && tx <= 10 && ty >= 19 && ty <= 25) return; // pond
      const key = Phaser.Math.Between(0, 1) ? "tree" : "tree2";
      const t = this.addSolidImage(tx * ts + ts / 2, ty * ts + ts, key, 1, 0.3, 0.18);
      swayTargets.push(t);
    };
    for (let x = 0; x < MAP_W; x++) {
      tryTree(x, 0);
      tryTree(x, MAP_H - 1);
    }
    for (let y = 0; y < MAP_H; y++) {
      tryTree(0, y);
      tryTree(MAP_W - 1, y);
    }
    for (let i = 0; i < 26; i++) tryTree(Phaser.Math.Between(1, MAP_W - 2), Phaser.Math.Between(1, MAP_H - 2));

    // sway animation for trees
    for (const t of swayTargets) {
      t.setOrigin(0.5, 1);
      this.tweens.add({
        targets: t,
        angle: Phaser.Math.FloatBetween(1.6, 2.6),
        duration: Phaser.Math.Between(2600, 4200),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Phaser.Math.Between(0, 1500),
      });
    }

    // buildings (decor with collision)
    this.addSolidImage(6 * ts, 5 * ts, "build_clinic", 1, 0.7, 0.4); // forest clinic
    this.addSolidImage(13 * ts, 4 * ts, "build_house", 0.9, 0.7, 0.4);
    this.addSolidImage(6 * ts, 26 * ts, "build_house", 0.9, 0.7, 0.4); // coast cottage
    this.addSolidImage(32 * ts, 5 * ts, "build_shop", 1, 0.7, 0.4); // desert shop
    this.addSolidImage(35 * ts, 18 * ts, "build_shop", 0.85, 0.7, 0.4);
    this.addSolidImage(30 * ts, 26 * ts, "build_shrine", 1, 0.6, 0.35); // mystic shrine

    // Constual billboard in the plaza
    const bb = this.add.image(20 * ts, 16 * ts, "billboard").setOrigin(0.5, 1);
    bb.setDepth(20 * ts);
    this.add
      .text(20 * ts, 16 * ts - 42, "CONSTUAL", { fontFamily: "monospace", fontSize: "16px", color: "#c8f169", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(20 * ts + 1);
    this.add
      .text(20 * ts, 16 * ts - 24, "Learn · Quiz · Earn", { fontFamily: "monospace", fontSize: "9px", color: "#9fe7ff" })
      .setOrigin(0.5)
      .setDepth(20 * ts + 1);

    // zone signboards
    this.addSign(10 * ts, 2 * ts, "Forest Clinic");
    this.addSign(10 * ts, 17 * ts, "Coastal Springs");
    this.addSign(30 * ts, 2 * ts, "Builder Bazaar");
    this.addSign(28 * ts, 17 * ts, "Mystic Grove");

    // props: benches, lamps, flowers, rocks, fences
    const decor = (key: string, count: number, scale = 1) => {
      for (let i = 0; i < count; i++) {
        const x = Phaser.Math.Between(2, MAP_W - 2) * ts;
        const y = Phaser.Math.Between(2, MAP_H - 2) * ts;
        if (this.areaOf((x / ts) | 0, (y / ts) | 0) === "plaza") continue;
        const img = this.add.image(x, y, key).setOrigin(0.5, 1).setScale(scale);
        img.setDepth(y);
      }
    };
    decor("flower", 40);
    decor("rock", 14);
    decor("lamp", 8);
    decor("bench", 6);

    // grass blades that sway
    for (let i = 0; i < 36; i++) {
      const x = Phaser.Math.Between(2, MAP_W - 2) * ts;
      const y = Phaser.Math.Between(2, MAP_H - 2) * ts;
      const b = this.add.image(x, y, "blade").setOrigin(0.5, 1).setDepth(y - 1).setScale(Phaser.Math.FloatBetween(0.8, 1.4));
      this.tweens.add({ targets: b, angle: Phaser.Math.FloatBetween(6, 12), duration: Phaser.Math.Between(1200, 2200), yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  private addSign(x: number, y: number, label: string): void {
    this.add.image(x, y, "sign").setOrigin(0.5, 1).setDepth(y);
    this.add
      .text(x, y - 30, label, { fontFamily: "monospace", fontSize: "9px", color: "#5e3a1d", fontStyle: "bold", align: "center" })
      .setOrigin(0.5)
      .setDepth(y + 1);
  }

  // ---------------------------------------------------------------- player
  private spawnPlayer(): void {
    const scale = CHAR_DISPLAY / 220;
    this.player = this.physics.add.sprite(20 * TILE_SIZE, 18 * TILE_SIZE, PLAYER_KEY, 0);
    this.player.setScale(scale);
    this.player.setCollideWorldBounds(true);
    const body = this.player.body;
    body.setSize(110, 70);
    body.setOffset(55, 140);
    this.player.play(animKey(PLAYER_KEY, "idle"));
  }

  // ---------------------------------------------------------------- npcs
  private spawnNpcs(): void {
    const scale = (CHAR_DISPLAY - 6) / 220;
    for (const def of NPCS) {
      const x = def.tileX * TILE_SIZE + TILE_SIZE / 2;
      const y = def.tileY * TILE_SIZE + TILE_SIZE;
      const sprite = this.physics.add.staticSprite(x, y, def.spriteKey, 0).setScale(scale).setOrigin(0.5, 0.85);
      sprite.play(animKey(def.spriteKey, "idle"));
      sprite.setInteractive({ useHandCursor: true });
      sprite.on("pointerdown", () => this.interactWith(def));
      sprite.refreshBody();

      const tag = this.add
        .text(x, y - CHAR_DISPLAY + 6, def.name, {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#ffffff",
          backgroundColor: "#0f1424bb",
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5);
      tag.setColor("#ffffff");

      const bubble = this.add
        .text(x, y - CHAR_DISPLAY - 10, "!", { fontFamily: "monospace", fontSize: "16px", color: "#ffe066", fontStyle: "bold" })
        .setOrigin(0.5)
        .setVisible(false);

      this.npcs.push({ def, sprite, tag, bubble, homeX: x, homeY: y, wanderAt: 0, noteAt: 0 });
    }
  }

  private markZoneComplete(zoneId: number): void {
    this.completedZones.add(zoneId);
    const n = this.npcs.find((e) => e.def.zoneId === zoneId);
    if (n) {
      n.sprite.setTint(0xc8f169);
      n.tag.setText(n.def.name + " ✓");
    }
  }

  // ---------------------------------------------------------------- input
  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      E: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      SHIFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
    };
    this.keys.E.on("down", () => this.tryInteract());
  }

  private createMobileControls(): void {
    if (!this.isTouch) return;
    const place = () => {
      const h = this.scale.height;
      this.joyBase!.setPosition(110, h - 110);
      this.joyKnob!.setPosition(110, h - 110);
    };
    this.joyBase = this.add.image(0, 0, "joy_base").setScrollFactor(0).setDepth(1400).setAlpha(0.8);
    this.joyKnob = this.add.image(0, 0, "joy_knob").setScrollFactor(0).setDepth(1401).setAlpha(0.9);
    place();

    const eBtn = this.add
      .image(this.scale.width - 80, this.scale.height - 110, "btn_e")
      .setScrollFactor(0)
      .setDepth(1400)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(eBtn.x, eBtn.y, "E", { fontFamily: "monospace", fontSize: "22px", color: "#ffffff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1402);
    eBtn.on("pointerdown", () => this.tryInteract());

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.joyPointerId !== -1) return;
      const base = this.joyBase!;
      if (Phaser.Math.Distance.Between(p.x, p.y, base.x, base.y) <= 80) {
        this.joyPointerId = p.id;
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyPointerId) return;
      const base = this.joyBase!;
      const dx = p.x - base.x;
      const dy = p.y - base.y;
      const dist = Math.min(58, Math.hypot(dx, dy));
      const ang = Math.atan2(dy, dx);
      this.joyKnob!.setPosition(base.x + Math.cos(ang) * dist, base.y + Math.sin(ang) * dist);
      this.joyVec.set((Math.cos(ang) * dist) / 58, (Math.sin(ang) * dist) / 58);
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.joyPointerId) return;
      this.joyPointerId = -1;
      this.joyVec.set(0, 0);
      this.joyKnob!.setPosition(this.joyBase!.x, this.joyBase!.y);
    };
    this.input.on("pointerup", release);
    this.input.on("pointerupoutside", release);

    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      place();
      eBtn.setPosition(this.scale.width - 80, this.scale.height - 110);
    });
  }

  // ---------------------------------------------------------------- HUD
  private createHud(): void {
    this.hudText = this.add
      .text(12, 56, "", { fontFamily: "monospace", fontSize: "12px", color: "#e6ecff", backgroundColor: "#0f1424cc", padding: { x: 8, y: 6 }, lineSpacing: 3 })
      .setScrollFactor(0)
      .setDepth(1410);
    this.xpBar = this.add.graphics().setScrollFactor(0).setDepth(1411);

    this.minimap = this.add.graphics().setScrollFactor(0).setDepth(1410);

    this.questText = this.add
      .text(this.scale.width - 12, 12, "", { fontFamily: "monospace", fontSize: "11px", color: "#e6ecff", backgroundColor: "#0f1424cc", padding: { x: 8, y: 6 }, align: "right" })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1410);
    // place quest tracker bottom-right instead
    this.questText.setOrigin(1, 1);

    this.prompt = this.add
      .text(0, 0, "[E] Talk", { fontFamily: "monospace", fontSize: "12px", color: "#0f1424", backgroundColor: "#c8f169", padding: { x: 6, y: 3 } })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1500)
      .setVisible(false);

    this.refreshHud();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.refreshHud());
  }

  private onWallet(s: WalletState): void {
    this.hud.address = s.address;
    this.refreshHud();
  }

  private onHud(h: HudPayload): void {
    this.hud = { ...this.hud, ...h };
    this.refreshHud();
  }

  private refreshHud(): void {
    const a = this.hud.address;
    const short = a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "Not connected";
    this.hudText.setText([`◆ ${short}`, `XP ${this.hud.xp}   Badges ${this.hud.badges}`]);
    // xp bar under hud text
    const x = 14;
    const y = this.hudText.y + this.hudText.height + 4;
    const w = 150;
    const pct = Math.max(0, Math.min(1, (this.hud.xp % 100) / 100));
    this.xpBar.clear();
    this.xpBar.fillStyle(0x0f1424, 0.8).fillRoundedRect(x - 2, y - 2, w + 4, 12, 3);
    this.xpBar.fillStyle(0x6ee7ff, 1).fillRoundedRect(x, y, w * pct, 8, 2);

    const done = Math.max(this.hud.completed, this.completedZones.size);
    this.questText.setText(`Quests ${done}/${this.hud.total}\nFind all 5 teachers`);
    this.questText.setPosition(this.scale.width - 12, this.scale.height - 12);
  }

  private drawMinimap(): void {
    const mmW = 120;
    const mmH = 90;
    const ox = this.scale.width - mmW - 12;
    const oy = 56;
    const sx = mmW / WORLD_W;
    const sy = mmH / WORLD_H;
    const g = this.minimap;
    g.clear();
    g.fillStyle(0x0f1424, 0.7).fillRect(ox - 3, oy - 3, mmW + 6, mmH + 6);
    // zones
    const zoneColors: Record<Area, number> = { forest: 0x2f7d46, coast: 0x2f8f6a, desert: 0xc9a25a, mystic: 0x4a3b78, plaza: 0xb88f57 };
    for (const a of ["forest", "coast", "desert", "mystic"] as Area[]) {
      const cx = a === "forest" || a === "coast" ? 0 : WORLD_W / 2;
      const cy = a === "forest" || a === "desert" ? 0 : WORLD_H / 2;
      g.fillStyle(zoneColors[a], 0.85).fillRect(ox + cx * sx, oy + cy * sy, (WORLD_W / 2) * sx, (WORLD_H / 2) * sy);
    }
    // npc dots
    for (const n of this.npcs) {
      g.fillStyle(n.def.zoneId != null ? 0xffe066 : 0x9fe7ff, 1);
      g.fillCircle(ox + n.sprite.x * sx, oy + n.sprite.y * sy, 1.8);
    }
    // player
    g.fillStyle(0xff5d6c, 1).fillCircle(ox + this.player.x * sx, oy + this.player.y * sy, 2.4);
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
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, def.tileX * TILE_SIZE + TILE_SIZE / 2, def.tileY * TILE_SIZE + TILE_SIZE);
    if (d > INTERACT_RANGE * 2) return;
    this.interactLocked = true;
    this.player.setVelocity(0, 0);
    this.player.play(animKey(PLAYER_KEY, "idle"), true);
    gameBridge.emit("dialog:show", {
      zoneId: def.zoneId,
      npcKey: def.key,
      npcName: def.name,
      lines: npcDialogLines(def),
    });
  }

  // ---------------------------------------------------------------- update
  update(time: number, delta: number): void {
    this.weather?.update(time, delta);
    for (const w of this.waterTiles) {
      w.tilePositionX += delta * 0.006;
      w.tilePositionY += delta * 0.003;
    }
    this.drawMinimap();
    this.updateNpcs(time);

    if (!this.player?.body) return;
    const body = this.player.body;
    body.setVelocity(0);

    if (this.interactLocked) {
      this.player.setDepth(this.player.y);
      return;
    }

    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) vx += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) vy += 1;
    let joyMag = 0;
    if (this.joyVec.lengthSq() > 0.02) {
      vx += this.joyVec.x;
      vy += this.joyVec.y;
      joyMag = this.joyVec.length();
    }

    const moving = vx !== 0 || vy !== 0;
    const running = this.keys.SHIFT.isDown || joyMag > 0.85;
    const speed = running ? 215 : 135;

    if (moving) {
      const v = new Phaser.Math.Vector2(vx, vy).normalize().scale(speed);
      body.setVelocity(v.x, v.y);
      if (vx < -0.05) this.facing = -1;
      else if (vx > 0.05) this.facing = 1;
      this.player.setFlipX(this.facing === -1);
      const anim = running ? "run" : "walk";
      const key = animKey(PLAYER_KEY, anim);
      if (this.player.anims.currentAnim?.key !== key) this.player.play(key, true);
    } else {
      const idle = animKey(PLAYER_KEY, "idle");
      if (this.player.anims.currentAnim?.key !== idle) this.player.play(idle, true);
    }

    this.player.setDepth(this.player.y);

    // nearest NPC prompt
    let nearest: Npc | null = null;
    let best = INTERACT_RANGE;
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.sprite.x, n.sprite.y);
      n.bubble.setVisible(d < INTERACT_RANGE * 1.6);
      if (d < best) {
        best = d;
        nearest = n;
      }
    }
    if (nearest) {
      this.prompt.setVisible(true);
      const cam = this.cameras.main;
      this.prompt.setPosition((nearest.sprite.x - cam.worldView.x), (nearest.sprite.y - CHAR_DISPLAY - cam.worldView.y));
    } else {
      this.prompt.setVisible(false);
    }
  }

  private updateNpcs(time: number): void {
    const view = this.cameras.main.worldView;
    for (const n of this.npcs) {
      // cull offscreen
      const visible = view.contains(n.sprite.x, n.sprite.y) || Phaser.Geom.Rectangle.Overlaps(view, new Phaser.Geom.Rectangle(n.sprite.x - 60, n.sprite.y - 90, 120, 120));
      n.sprite.setVisible(visible);
      n.tag.setVisible(visible);
      if (!visible) {
        n.bubble.setVisible(false);
        continue;
      }
      n.sprite.setDepth(n.sprite.y);
      n.tag.setPosition(n.sprite.x, n.sprite.y - CHAR_DISPLAY + 6).setDepth(n.sprite.y + 1);
      n.bubble.setPosition(n.sprite.x, n.sprite.y - CHAR_DISPLAY - 6).setDepth(n.sprite.y + 1);

      // gentle wander
      if (n.def.wander && time > n.wanderAt) {
        n.wanderAt = time + Phaser.Math.Between(2500, 5000);
        const tx = Phaser.Math.Clamp(n.homeX + Phaser.Math.Between(-40, 40), TILE_SIZE, WORLD_W - TILE_SIZE);
        const ty = Phaser.Math.Clamp(n.homeY + Phaser.Math.Between(-40, 40), TILE_SIZE, WORLD_H - TILE_SIZE);
        n.sprite.setFlipX(tx < n.sprite.x);
        this.tweens.add({
          targets: n.sprite,
          x: tx,
          y: ty,
          duration: 1400,
          ease: "Sine.easeInOut",
          onUpdate: () => n.sprite.refreshBody(),
        });
      }
      // occasional music note
      if (time > n.noteAt) {
        n.noteAt = time + Phaser.Math.Between(6000, 14000);
        const note = this.add
          .text(n.sprite.x + 14, n.sprite.y - CHAR_DISPLAY, "♪", { fontFamily: "monospace", fontSize: "14px", color: "#9fe7ff" })
          .setOrigin(0.5)
          .setDepth(n.sprite.y + 2);
        this.tweens.add({ targets: note, y: note.y - 26, alpha: 0, duration: 1600, onComplete: () => note.destroy() });
      }
    }
  }
}
