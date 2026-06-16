import Phaser from "phaser";
import { animKey, PLAYER_KEY } from "../config/sprites";
import { NPCS, npcDialogLines, type NpcDef } from "../data/npcs";
import { zones } from "../data/zones";
import { gameBridge, type HudPayload, type WalletState } from "../bridge";
import { WeatherSystem } from "../systems/WeatherSystem";
import { CloudSystem } from "../systems/CloudSystem";
import { createBuilding, type BuildingType } from "../objects/Buildings";
import { TILE_SIZE } from "./PreloadScene";

const MAP_W = 50;
const MAP_H = 40;
const WORLD_W = MAP_W * TILE_SIZE; // 1600
const WORLD_H = MAP_H * TILE_SIZE; // 1280
const INTERACT_RANGE = 84;
const CAM_ZOOM = 1.5;
const PLAYER_SCALE = 0.27; // the player is a small cat — kept slightly under the NPCs
const NPC_SCALE = 0.32;
const NPC_TOP = Math.round(220 * NPC_SCALE * 0.8); // px above a sprite's anchor for tags

// pond footprint (tiles) — kept inside the coast quadrant, clear of the plaza paths
const POND = { tx: 5, ty: 24, tw: 8, th: 6 };

const T = { GRASS: 0, GRASS2: 1, PATH: 2, WATER: 3, SAND: 4, MYSTIC: 5, COAST: 6, FLOWER: 7 };

type Area = "forest" | "coast" | "desert" | "mystic" | "plaza";

interface Npc {
  def: NpcDef;
  container: Phaser.GameObjects.Container;
  visual: Phaser.GameObjects.Sprite;
  tag: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Text;
  phase: number;
}

export default class MainWorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private playerBody!: Phaser.Physics.Arcade.Body;
  private playerVisual!: Phaser.GameObjects.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private npcs: Npc[] = [];
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private blocked: Phaser.Geom.Rectangle[] = []; // world AABBs NPC wander must avoid
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
    this.spawnLandmarks();
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

    // tell React the world is built so it can show the intro guideline
    gameBridge.emit("game:ready", undefined);

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

    // retro round tree — chunky blocky canopy with a dark outline
    g.fillStyle(0x000000, 0.22).fillEllipse(28, 66, 38, 10);
    this.rect(g, 0x2a1a0d, 23, 44, 12, 22); // trunk outline
    this.rect(g, 0x7a4a25, 25, 46, 8, 18);
    this.rect(g, 0x95612f, 26, 47, 2, 16);
    g.fillStyle(0x123a1c, 1); // canopy dark outline mass
    g.fillRect(8, 12, 40, 30).fillRect(12, 6, 32, 42).fillRect(4, 18, 48, 16);
    g.fillStyle(0x2f8f4d, 1); // canopy fill
    g.fillRect(10, 14, 36, 26).fillRect(14, 8, 28, 38).fillRect(6, 20, 44, 12);
    g.fillStyle(0x247a3e, 1); // shading
    g.fillRect(28, 28, 18, 12).fillRect(34, 18, 10, 14);
    g.fillStyle(0x57c878, 1); // highlights
    g.fillRect(14, 12, 10, 8).fillRect(12, 20, 6, 6);
    g.fillStyle(0x86e6a0, 1).fillRect(15, 13, 5, 4);
    g.fillStyle(0x1c6a39, 1).fillRect(24, 22, 4, 4).fillRect(32, 30, 4, 4); // leaf gaps
    g.generateTexture("tree", 56, 72);
    g.clear();

    // retro pine — stepped tiers with dark outline + snow pixels
    g.fillStyle(0x000000, 0.22).fillEllipse(24, 64, 30, 9);
    this.rect(g, 0x2a1a0d, 19, 46, 10, 16);
    this.rect(g, 0x6b4220, 21, 48, 6, 12);
    g.fillStyle(0x0f3a22, 1).fillRect(4, 34, 40, 12);
    g.fillStyle(0x2a8a5c, 1).fillRect(6, 36, 36, 8);
    g.fillStyle(0x0f3a22, 1).fillRect(8, 22, 32, 12);
    g.fillStyle(0x2f9a64, 1).fillRect(10, 24, 28, 8);
    g.fillStyle(0x0f3a22, 1).fillRect(13, 10, 22, 12);
    g.fillStyle(0x36ab70, 1).fillRect(15, 12, 18, 8);
    g.fillStyle(0x0f3a22, 1).fillRect(20, 4, 8, 8);
    g.fillStyle(0x36ab70, 1).fillRect(22, 6, 4, 4);
    g.fillStyle(0xbfe9cf, 1).fillRect(10, 36, 4, 2).fillRect(16, 24, 4, 2).fillRect(21, 12, 4, 2);
    g.generateTexture("tree2", 48, 68);
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

    // extra flower colours for a livelier world
    this.rect(g, 0x3f9657, 7, 10, 2, 6);
    g.fillStyle(0x8a6cff, 1).fillCircle(8, 7, 5);
    g.fillStyle(0xffe05a, 1).fillCircle(8, 7, 2);
    g.generateTexture("flower2", 16, 18);
    g.clear();
    this.rect(g, 0x3f9657, 7, 10, 2, 6);
    g.fillStyle(0xff5d6c, 1).fillCircle(8, 7, 5);
    g.fillStyle(0xfff0a8, 1).fillCircle(8, 7, 2);
    g.generateTexture("flower3", 16, 18);
    g.clear();

    // mini chili garden (retro plot, inspired by the reference)
    g.fillStyle(0x6b4a2a, 1).fillRect(8, 26, 134, 88);
    g.fillStyle(0x4e3520, 1);
    for (let i = 0; i < 4; i++) g.fillRect(14, 34 + i * 19, 122, 3);
    g.lineStyle(3, 0x352213, 1).strokeRect(8, 26, 134, 88);
    g.fillStyle(0xb8854a, 1).fillRect(8, 22, 134, 5);
    g.fillStyle(0x9c6b3a, 1);
    for (let x = 8; x <= 142; x += 22) g.fillRect(x - 2, 16, 5, 14);
    const plant = (px: number, py: number) => {
      g.fillStyle(0x1c6a39, 1).fillRect(px - 8, py - 13, 16, 13);
      g.fillStyle(0x2f8f4d, 1).fillRect(px - 6, py - 15, 12, 9);
      g.fillStyle(0x3aa85b, 1).fillRect(px - 4, py - 16, 6, 4);
      g.fillStyle(0xff3b30, 1).fillRect(px - 6, py - 3, 3, 8).fillRect(px + 3, py - 4, 3, 8);
      g.fillStyle(0xc41e16, 1).fillRect(px - 6, py + 4, 3, 2).fillRect(px + 3, py + 3, 3, 2);
    };
    plant(40, 74);
    plant(82, 90);
    plant(116, 70);
    plant(62, 108);
    g.fillStyle(0x2f8f4d, 1).fillRect(126, 92, 3, 18);
    g.fillStyle(0xffd23f, 1).fillCircle(128, 90, 7);
    g.fillStyle(0x7a4a25, 1).fillCircle(128, 90, 3);
    g.generateTexture("chili_garden", 152, 120);
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

  // pond bounds in world px (with a margin) so NPCs never wander into the water
  private inPondWorld(x: number, y: number): boolean {
    const px = POND.tx * TILE_SIZE;
    const py = POND.ty * TILE_SIZE;
    const pw = POND.tw * TILE_SIZE;
    const ph = POND.th * TILE_SIZE;
    const m = 18;
    return x > px - m && x < px + pw + m && y > py - m && y < py + ph + m;
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
    const cx = px + pw / 2;
    const cy = py + ph / 2;

    // shoreline: sandy bank ring + darker wet edge, drawn under the water
    const bank = this.add.graphics().setDepth(-8);
    bank.fillStyle(0xd8c08a, 1).fillRoundedRect(px - 14, py - 12, pw + 28, ph + 24, 22);
    bank.fillStyle(0xb7a06e, 1).fillRoundedRect(px - 6, py - 5, pw + 12, ph + 10, 16);

    // water surface (rounded) — a tinted scrolling tilesprite masked to a rounded rect
    const water = this.add.tileSprite(px, py, pw, ph, "water_tile").setOrigin(0).setDepth(-6);
    water.setAlpha(0.92).setTint(0x4a90d9);
    const maskShape = this.make.graphics({ x: 0, y: 0 }, false);
    maskShape.fillStyle(0xffffff, 1).fillRoundedRect(px, py, pw, ph, 14);
    water.setMask(maskShape.createGeometryMask());
    this.waterTiles.push(water);

    // stone rim outline
    const rim = this.add.graphics().setDepth(-5);
    rim.lineStyle(3, 0x6b5b3a, 1).strokeRoundedRect(px - 2, py - 2, pw + 4, ph + 4, 14);

    // a few rocks around the rim for a natural edge
    const rimSpots: [number, number][] = [
      [px + 6, py + 4], [px + pw - 8, py + 6], [px + pw - 4, py + ph - 6], [px + 10, py + ph - 4],
    ];
    for (const [rx, ry] of rimSpots) this.add.image(rx, ry, "rock").setOrigin(0.5, 1).setDepth(ry);

    // block walking onto the water (player physics + NPC wander avoidance)
    const block = this.add.rectangle(cx, cy, pw - 8, ph - 8).setVisible(false);
    this.physics.add.existing(block, true);
    this.solids.add(block);
    this.blocked.push(new Phaser.Geom.Rectangle(px - 14, py - 14, pw + 28, ph + 28));
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
    // record a slightly padded AABB so wandering NPCs steer clear of it
    this.blocked.push(new Phaser.Geom.Rectangle(x - w / 2 - 14, y - h / 2 - 14, w + 28, h + 28));
  }

  private isBlocked(x: number, y: number): boolean {
    for (const r of this.blocked) if (r.contains(x, y)) return true;
    return false;
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
    decor("flower", 90);
    decor("flower2", 70);
    decor("flower3", 60);
    decor("rock", 18);
    decor("lamp", 10);
    decor("bench", 8);

    // mini chili garden in the desert zone, next to Asceno
    const cgx = 38 * ts;
    const cgy = 17 * ts;
    this.addSolidImage(cgx, cgy, "chili_garden", 1, 0.85, 0.5);
    this.blocked.push(new Phaser.Geom.Rectangle(cgx - 86, cgy - 124, 172, 134));
    this.add
      .text(cgx, cgy - 128, "Chili Garden", { fontFamily: "monospace", fontSize: "9px", color: "#fff0a8", fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(cgy + 1);

    for (let i = 0; i < 50; i++) {
      const tx = Phaser.Math.Between(2, MAP_W - 2);
      const ty = Phaser.Math.Between(2, MAP_H - 2);
      if (this.inPond(tx, ty)) continue;
      const b = this.add.image(tx * ts, ty * ts, "blade").setOrigin(0.5, 1).setDepth(ty * ts - 1).setScale(Phaser.Math.FloatBetween(0.8, 1.4));
      this.tweens.add({ targets: b, angle: Phaser.Math.FloatBetween(6, 12), duration: Phaser.Math.Between(1200, 2200), yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  private spawnBuildings(): void {
    const ts = TILE_SIZE;
    // tidy, tile-aligned layout: HQ centered in the plaza; each zone gets a
    // couple of buildings; the mystic (purple) zone is filled out more.
    const layout: [BuildingType, number, number][] = [
      ["hq", 25, 13], // dead-center top of plaza
      ["clinic", 9, 9], // forest
      ["house", 16, 8], // forest
      ["lab", 41, 9], // desert
      ["house", 34, 8], // desert
      ["market", 9, 33], // coast
      ["house", 16, 34], // coast
      ["temple", 40, 30], // mystic
      ["crystal", 32, 32], // mystic
      ["house", 44, 35], // mystic
      ["crystal", 38, 36], // mystic
    ];
    for (const [type, tx, ty] of layout) {
      const b = createBuilding(this, type, tx * ts, ty * ts);
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
    // Single consistent frame in a container; the container holds the physics
    // body so the visual never rescales. Idle/walk life comes from a smooth
    // sine bob applied to the visual in update() (pure position, no size change).
    const visual = this.add.sprite(0, 0, PLAYER_KEY, 5).setOrigin(0.5, 0.82).setScale(PLAYER_SCALE);
    visual.play(animKey(PLAYER_KEY, "idle"));
    this.playerVisual = visual;

    const c = this.add.container(25 * TILE_SIZE, 24 * TILE_SIZE, [visual]);
    this.physics.world.enable(c);
    const body = c.body as Phaser.Physics.Arcade.Body;
    body.setSize(28, 16);
    body.setOffset(-14, -2);
    body.setCollideWorldBounds(true);
    this.player = c;
    this.playerBody = body;
  }

  // Waving Ritual flag at the world center.
  private spawnLandmarks(): void {
    const ts = TILE_SIZE;
    const fx = 25 * ts;
    const fy = 20 * ts;
    const flag = this.add.image(fx, fy, "lm_flag").setOrigin(0.5, 1).setScale(0.7);
    flag.setDepth(fy);
    // gentle wind: subtle horizontal "wave" + slight sway
    this.tweens.add({ targets: flag, scaleX: { from: 0.7, to: 0.64 }, duration: 820, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: flag, angle: { from: -1.6, to: 1.6 }, duration: 1500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    // collider at the base so player & NPCs don't clip through the pole
    this.addStaticCollider(fx, fy - 8, 26, 16);
  }

  // ---------------------------------------------------------------- npcs
  private spawnNpcs(): void {
    for (const def of NPCS) {
      const x = def.tileX * TILE_SIZE + TILE_SIZE / 2;
      const y = def.tileY * TILE_SIZE + TILE_SIZE;
      // visual sprite in a container so wander (container x/y) and idle bob
      // (visual y) never fight; single frame keeps size consistent
      const visual = this.add.sprite(0, 0, def.spriteKey, 0).setOrigin(0.5, 0.85).setScale(NPC_SCALE);
      const container = this.add.container(x, y, [visual]);
      visual.setInteractive({ useHandCursor: true });

      const tag = this.add
        .text(x, y - NPC_TOP, def.name, {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#e8f4fd",
          backgroundColor: "#080814cc",
          padding: { x: 5, y: 2 },
        })
        .setOrigin(0.5);

      const bubble = this.add
        .text(x, y - NPC_TOP - 12, "!", { fontFamily: "monospace", fontSize: "16px", color: "#ffe066", fontStyle: "bold" })
        .setOrigin(0.5)
        .setVisible(false);

      const npc: Npc = { def, container, visual, tag, bubble, phase: Phaser.Math.Between(0, 6000) };
      this.npcs.push(npc);

      visual.on("pointerdown", () => this.interactWith(npc));

      if (def.wander) this.scheduleWander(npc, x, y);

      // occasional music note via timer (not in update)
      this.time.addEvent({
        delay: Phaser.Math.Between(7000, 14000),
        loop: true,
        callback: () => {
          if (!container.visible) return;
          const note = this.add
            .text(container.x + 12, container.y - NPC_TOP, "♪", { fontFamily: "monospace", fontSize: "14px", color: "#9fe7ff" })
            .setOrigin(0.5)
            .setDepth(container.y + 2);
          this.tweens.add({ targets: note, y: note.y - 26, alpha: 0, duration: 1600, onComplete: () => note.destroy() });
        },
      });
    }
  }

  // Each NPC gets a little "personality" so the crowd doesn't move in lockstep:
  // a homebody mostly idles, a wanderer roams wide, a pacer takes short hops.
  private scheduleWander(npc: Npc, homeX: number, homeY: number): void {
    const persona = Phaser.Math.RND.pick(["homebody", "wanderer", "pacer"] as const);
    const radius = persona === "wanderer" ? 110 : persona === "pacer" ? 40 : 70;
    const idleChance = persona === "homebody" ? 0.6 : persona === "pacer" ? 0.25 : 0.3;
    const speed = persona === "pacer" ? 11 : Phaser.Math.Between(13, 22); // ms per px

    const idle = (min: number, max: number) => this.time.delayedCall(Phaser.Math.Between(min, max), step);
    const step = () => {
      if (!npc.container.active) return;
      // sometimes just pause and glance around (varied dwell time)
      if (Phaser.Math.FloatBetween(0, 1) < idleChance) {
        if (Phaser.Math.FloatBetween(0, 1) < 0.5) npc.visual.setFlipX(!npc.visual.flipX);
        idle(700, 3200);
        return;
      }
      // try a few candidate targets; skip any that land on a blocked area
      let tx = 0;
      let ty = 0;
      let ok = false;
      for (let i = 0; i < 6 && !ok; i++) {
        const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const r = Phaser.Math.Between(20, radius);
        tx = Phaser.Math.Clamp(homeX + Math.cos(ang) * r, TILE_SIZE, WORLD_W - TILE_SIZE);
        ty = Phaser.Math.Clamp(homeY + Math.sin(ang) * r, TILE_SIZE, WORLD_H - TILE_SIZE);
        ok = !this.isBlocked(tx, ty);
      }
      if (!ok) {
        idle(700, 1800);
        return;
      }
      npc.visual.setFlipX(tx < npc.container.x);
      const dist = Phaser.Math.Distance.Between(npc.container.x, npc.container.y, tx, ty);
      this.tweens.add({
        targets: npc.container,
        x: tx,
        y: ty,
        duration: Math.max(550, dist * speed),
        ease: Phaser.Math.RND.pick(["Sine.easeInOut", "Quad.easeInOut", "Linear"]),
        onComplete: () => idle(500, 2800),
      });
    };
    this.time.delayedCall(Phaser.Math.Between(200, 2600), step);
  }

  private markZoneComplete(zoneId: number): void {
    this.completedZones.add(zoneId);
    const n = this.npcs.find((e) => e.def.zoneId === zoneId);
    if (n) {
      n.visual.setTint(0x00ff88);
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
    // keep clear of the bottom edge + mobile home indicator / safe area
    const by = h - 124;
    this.joyBase.setPosition(104, by);
    if (!this.joystick.active) this.joyKnob?.setPosition(104, by);
    this.eBtn?.setPosition(w - 92, by);
    this.eLabel?.setPosition(w - 92, by);
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
      g.fillCircle(ox + n.container.x * sx, oy + n.container.y * sy, 1.8);
    }
    g.fillStyle(0xff5d6c, 1).fillCircle(ox + this.player.x * sx, oy + this.player.y * sy, 2.6);
  }

  // ---------------------------------------------------------------- interact
  private tryInteract(): void {
    if (this.interactLocked) return;
    let nearest: Npc | null = null;
    let best = INTERACT_RANGE;
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.container.x, n.container.y);
      if (d < best) {
        best = d;
        nearest = n;
      }
    }
    if (nearest) this.interactWith(nearest);
  }

  private interactWith(npc: Npc): void {
    if (this.interactLocked) return;
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, npc.container.x, npc.container.y) > INTERACT_RANGE * 1.8) return;
    this.interactLocked = true;
    this.playerBody.setVelocity(0, 0);
    gameBridge.emit("dialog:show", {
      zoneId: npc.def.zoneId,
      npcKey: npc.def.key,
      npcName: npc.def.name,
      lines: npcDialogLines(npc.def),
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

    if (!this.playerBody) return;
    const body = this.playerBody;
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
    if (moving && vx < -1) this.facing = -1;
    else if (moving && vx > 1) this.facing = 1;
    this.playerVisual.setFlipX(this.facing === -1);

    const t = this.time.now;
    const running = this.keyShift.isDown;
    if (moving) {
      // play the 2-frame walk/run cycle + a springy hop & lean for juice
      const key = animKey(PLAYER_KEY, running ? "run" : "walk");
      if (this.playerVisual.anims.currentAnim?.key !== key) this.playerVisual.play(key, true);
      const phase = Math.sin(t * (running ? 0.026 : 0.02));
      this.playerVisual.y = -Math.abs(phase) * (running ? 7 : 5);
      this.playerVisual.setRotation(phase * 0.06 * (this.facing === -1 ? -1 : 1));
    } else {
      const idle = animKey(PLAYER_KEY, "idle");
      if (this.playerVisual.anims.currentAnim?.key !== idle) this.playerVisual.play(idle, true);
      this.playerVisual.y = -Math.abs(Math.sin(t * 0.004)) * 1.6; // soft breathing
      this.playerVisual.setRotation(0);
    }

    this.player.setDepth(this.player.y);

    // NPC prompt
    let nearest: Npc | null = null;
    let best = INTERACT_RANGE;
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.container.x, n.container.y);
      n.bubble.setVisible(n.container.visible && d < INTERACT_RANGE * 1.6);
      if (d < best) {
        best = d;
        nearest = n;
      }
    }
    if (nearest) {
      const cam = this.cameras.main;
      this.prompt.setVisible(true);
      this.prompt.setPosition((nearest.container.x - cam.worldView.x) * cam.zoom, (nearest.container.y - NPC_TOP - cam.worldView.y) * cam.zoom);
    } else {
      this.prompt.setVisible(false);
    }
  }

  private updateNpcs(): void {
    const view = this.cameras.main.worldView;
    const t = this.time.now;
    for (const n of this.npcs) {
      const visible = Phaser.Geom.Rectangle.Overlaps(view, new Phaser.Geom.Rectangle(n.container.x - 60, n.container.y - 100, 120, 140));
      n.container.setVisible(visible);
      n.tag.setVisible(visible);
      if (!visible) {
        n.bubble.setVisible(false);
        continue;
      }
      // gentle breathing/idle bob on the visual (independent of wander)
      n.visual.y = -Math.abs(Math.sin((t + n.phase) * 0.004)) * 2.6;
      n.container.setDepth(n.container.y);
      n.tag.setPosition(n.container.x, n.container.y - NPC_TOP).setDepth(n.container.y + 1);
      n.bubble.setPosition(n.container.x, n.container.y - NPC_TOP - 12).setDepth(n.container.y + 1);
    }
  }
}
