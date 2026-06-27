import Phaser from "phaser";
import { animKey, PLAYER_KEY } from "../config/sprites";
import { NPCS, QUEST_TEACHER_NAMES, npcDialogLines, type NpcDef } from "../data/npcs";
import { zones } from "../data/zones";
import { gameBridge, type HudPayload, type WalletState } from "../bridge";
import { WeatherSystem } from "../systems/WeatherSystem";
import { CloudSystem } from "../systems/CloudSystem";
import { createBuilding } from "../objects/Buildings";
import { TILE_SIZE } from "./PreloadScene";

const MAP_W = 50;
const MAP_H = 40;
const WORLD_W = MAP_W * TILE_SIZE; // 1600
const WORLD_H = MAP_H * TILE_SIZE; // 1280
const INTERACT_RANGE = 84;
const DESKTOP_CAM_ZOOM = 1.34;
const PLAYER_SCALE = 0.27; // the player is a small cat — kept slightly under the NPCs
const NPC_SCALE = 0.32;
const NPC_TOP = Math.round(220 * NPC_SCALE * 0.8); // px above a sprite's anchor for tags

// pond footprint (tiles) — kept inside the coast quadrant, clear of the plaza paths
const POND = { tx: 5, ty: 24, tw: 8, th: 6 };

const T = { GRASS: 0, GRASS2: 1, PATH: 2, WATER: 3, SAND: 4, MYSTIC: 5, COAST: 6, FLOWER: 7, SAND2: 8, MYSTIC2: 9 };
const TILE_COUNT = 10;

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
  private scratchLine = new Phaser.Geom.Line(); // reused for NPC path checks
  private weather!: WeatherSystem;
  private clouds!: CloudSystem;
  private leafEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private waterTiles: Phaser.GameObjects.TileSprite[] = [];
  private pondEffectBounds?: Phaser.Geom.Rectangle;
  private interactLocked = false;
  private facing: 1 | -1 = 1;

  // tap / click-to-move
  private moveTarget: { x: number; y: number } | null = null;
  private tapInteractNpc: Npc | null = null;

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

    // camera: set zoom ONCE, smooth follow. roundPixels avoids tile-seam
    // tearing/shimmer while the camera pans (esp. on high-DPI mobile screens).
    this.cameras.main.setZoom(this.getCameraZoom());
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.createLeaves();
    this.createWaterSparkles();
    this.setupInput();
    this.createHud();

    this.weather = new WeatherSystem(this);
    this.weather.create();
    this.clouds = new CloudSystem(this);
    this.startSocial();
    this.startCouples();
    this.startGreetings();
    this.startRandomEvents();

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
    // (registry flag is the reliable signal; the event covers the fast path)
    this.registry.set("worldReady", true);
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
    this.cameras.main.setZoom(this.getCameraZoom());
    this.refreshHud();
    this.repositionUi();
  }

  private getCameraZoom(): number {
    const w = this.scale.width;
    const h = this.scale.height;
    if (w <= 480 || h <= 480) return 1;
    if (w <= 768) return 1.12;
    if (w <= 1024) return 1.24;
    return DESKTOP_CAM_ZOOM;
  }

  // ---------------------------------------------------------------- textures
  private rect(g: Phaser.GameObjects.Graphics, c: number, x: number, y: number, w: number, h: number, a = 1) {
    g.fillStyle(c, a).fillRect(x, y, w, h);
  }

  private buildTextures(): void {
    const ts = TILE_SIZE;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // a richer ground tile: base + a subtle 2-tone dither + scattered flecks &
    // highlight pixels so tiles read as textured pixel-art instead of flat blocks
    const ground = (base: number, dark: number, fleck: number, hi: number, ix: number) => {
      const ox = ix * ts;
      this.rect(g, base, ox, 0, ts, ts);
      // dither: a few darker 2px squares on a loose grid
      for (let yy = 2; yy < ts; yy += 8) {
        for (let xx = (yy % 16 === 2 ? 2 : 6); xx < ts; xx += 8) {
          this.rect(g, dark, ox + xx, yy, 2, 2, 0.5);
        }
      }
      // flecks (grass blades / specks)
      this.rect(g, fleck, ox + 5, 7, 3, 3);
      this.rect(g, fleck, ox + 20, 17, 3, 3);
      this.rect(g, fleck, ox + 12, 25, 3, 3);
      this.rect(g, fleck, ox + 26, 6, 2, 3);
      // highlight pixels
      this.rect(g, hi, ox + 9, 13, 2, 2, 0.8);
      this.rect(g, hi, ox + 24, 22, 2, 2, 0.8);
    };
    ground(0x2f7d46, 0x276a3b, 0x3f9657, 0x5fb277, T.GRASS);
    ground(0x357f4c, 0x2c6c41, 0x4aa05f, 0x66bd80, T.GRASS2);
    // path: cobble-ish with dither + edge highlights
    this.rect(g, 0xc9a36a, T.PATH * ts, 0, ts, ts);
    for (let yy = 3; yy < ts; yy += 7) for (let xx = (yy % 14 === 3 ? 3 : 8); xx < ts; xx += 9) this.rect(g, 0xb88f57, T.PATH * ts + xx, yy, 3, 3, 0.7);
    this.rect(g, 0xddc08c, T.PATH * ts + 6, 4, 3, 2, 0.7);
    this.rect(g, 0xddc08c, T.PATH * ts + 22, 24, 3, 2, 0.7);
    this.rect(g, 0x2b6cb0, T.WATER * ts, 0, ts, ts);
    // sand
    this.rect(g, 0xe2c98a, T.SAND * ts, 0, ts, ts);
    for (let yy = 4; yy < ts; yy += 9) for (let xx = (yy % 18 === 4 ? 4 : 10); xx < ts; xx += 10) this.rect(g, 0xd2b774, T.SAND * ts + xx, yy, 3, 2, 0.6);
    this.rect(g, 0xf0dca6, T.SAND * ts + 8, 10, 3, 2, 0.7);
    this.rect(g, 0xf0dca6, T.SAND * ts + 22, 22, 3, 2, 0.7);
    // mystic
    this.rect(g, 0x4a3b78, T.MYSTIC * ts, 0, ts, ts);
    for (let yy = 3; yy < ts; yy += 8) for (let xx = (yy % 16 === 3 ? 3 : 9); xx < ts; xx += 9) this.rect(g, 0x3c305f, T.MYSTIC * ts + xx, yy, 2, 2, 0.6);
    this.rect(g, 0x6f5cae, T.MYSTIC * ts + 6, 9, 3, 3, 0.8);
    this.rect(g, 0x8a78c8, T.MYSTIC * ts + 21, 20, 2, 2, 0.9);
    ground(0x2f8f6a, 0x256f51, 0x46a883, 0x66c4a0, T.COAST);
    ground(0x2f7d46, 0x276a3b, 0x3f9657, 0x5fb277, T.FLOWER);
    this.rect(g, 0xff7ab0, T.FLOWER * ts + 9, 9, 4, 4);
    this.rect(g, 0xffd23f, T.FLOWER * ts + 19, 19, 4, 4);
    // sand variant — slightly warmer/darker dune patch
    this.rect(g, 0xd8bc7c, T.SAND2 * ts, 0, ts, ts);
    for (let yy = 5; yy < ts; yy += 9) for (let xx = (yy % 18 === 5 ? 5 : 11); xx < ts; xx += 10) this.rect(g, 0xc4a766, T.SAND2 * ts + xx, yy, 3, 2, 0.6);
    this.rect(g, 0xe9d49a, T.SAND2 * ts + 10, 8, 3, 2, 0.7);
    this.rect(g, 0xb7995c, T.SAND2 * ts + 20, 23, 4, 2, 0.6);
    // mystic variant — deeper violet with faint runes/sparkle
    this.rect(g, 0x413567, T.MYSTIC2 * ts, 0, ts, ts);
    for (let yy = 3; yy < ts; yy += 8) for (let xx = (yy % 16 === 3 ? 3 : 9); xx < ts; xx += 9) this.rect(g, 0x342a54, T.MYSTIC2 * ts + xx, yy, 2, 2, 0.6);
    this.rect(g, 0x7d6ac0, T.MYSTIC2 * ts + 8, 11, 2, 2, 0.9);
    this.rect(g, 0xa896e0, T.MYSTIC2 * ts + 22, 19, 2, 2, 0.9);
    this.rect(g, 0x5a4a90, T.MYSTIC2 * ts + 15, 6, 3, 3, 0.8);
    g.generateTexture("worldtiles", ts * TILE_COUNT, ts);
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

  private nearPondTile(tx: number, ty: number, pad = 2): boolean {
    return tx >= POND.tx - pad && tx < POND.tx + POND.tw + pad && ty >= POND.ty - pad && ty < POND.ty + POND.th + pad;
  }

  private nearNpcTile(tx: number, ty: number, pad = 2): boolean {
    return NPCS.some((npc) => Math.abs(npc.tileX - tx) <= pad && Math.abs(npc.tileY - ty) <= pad);
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

  // deterministic 2D hash -> [0,1) (GLSL-style fract(sin) hash; well-distributed
  // across the full range, unlike a bit-mixing hash which biases low in JS floats)
  private hash2(x: number, y: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  // smooth value noise (bilinear, smoothstep) over the hash grid
  private vnoise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const tl = this.hash2(xi, yi);
    const tr = this.hash2(xi + 1, yi);
    const bl = this.hash2(xi, yi + 1);
    const br = this.hash2(xi + 1, yi + 1);
    return Phaser.Math.Linear(Phaser.Math.Linear(tl, tr, u), Phaser.Math.Linear(bl, br, u), v);
  }

  // biome by quadrant on (possibly warped) float coords — no plaza here, the
  // plaza/paths are overlaid separately so borders can be irregular
  private biomeAt(fx: number, fy: number): Area {
    const cx = MAP_W / 2;
    const cy = MAP_H / 2;
    if (fx < cx && fy < cy) return "forest";
    if (fx < cx && fy >= cy) return "coast";
    if (fx >= cx && fy < cy) return "desert";
    return "mystic";
  }

  // winding cobble paths from the central plaza out to each zone hub
  private buildPathSet(): Set<number> {
    const set = new Set<number>();
    const cx = 25;
    const cy = 20;
    const hubs: [number, number][] = [
      [13, 9], // forest
      [12, 26], // coast / springs
      [40, 11], // desert bazaar
      [38, 30], // mystic grove
    ];
    const key = (tx: number, ty: number) => tx * 1000 + ty;
    const mark = (tx: number, ty: number) => {
      if (tx >= 0 && tx < MAP_W && ty >= 0 && ty < MAP_H && !this.inPond(tx, ty)) set.add(key(tx, ty));
    };
    for (const [hx, hy] of hubs) {
      const horiz = Math.abs(hx - cx) >= Math.abs(hy - cy);
      const steps = 120;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        let x = Phaser.Math.Linear(cx, hx, t);
        let y = Phaser.Math.Linear(cy, hy, t);
        // perpendicular wobble so the path snakes instead of running straight
        const w = (this.vnoise(t * 5 + hx * 0.5, t * 5 + hy * 0.5) - 0.5) * 5;
        if (horiz) y += w;
        else x += w;
        const txi = Math.round(x);
        const tyi = Math.round(y);
        mark(txi, tyi);
        // 2-tile-wide road
        if (horiz) mark(txi, tyi + 1);
        else mark(txi + 1, tyi);
      }
    }
    return set;
  }

  private buildMap(): void {
    const paths = this.buildPathSet();
    const pathKey = (tx: number, ty: number) => tx * 1000 + ty;
    const cx = 25;
    const cy = 20;
    const data: number[][] = [];
    for (let y = 0; y < MAP_H; y++) {
      const row: number[] = [];
      for (let x = 0; x < MAP_W; x++) {
        // central stone plaza: a soft disc around the flag (irregular cobble edge)
        const dCenter = Math.hypot(x - cx, y - cy);
        const plazaR = 4.2 + (this.vnoise(x * 0.6, y * 0.6) - 0.5) * 1.8;
        if (dCenter < plazaR || paths.has(pathKey(x, y))) {
          row.push(T.PATH);
          continue;
        }
        // warp the quadrant boundary with noise so biomes meet in wavy seams
        const warp = 5.5;
        const wx = x + (this.vnoise(x * 0.16, y * 0.16) - 0.5) * warp;
        const wy = y + (this.vnoise(x * 0.16 + 41, y * 0.16 + 17) - 0.5) * warp;
        const a = this.biomeAt(wx, wy);
        // intra-biome variety from a second noise field (meadows, sandy banks…)
        const n = this.vnoise(x * 0.33 + 9, y * 0.33 + 3);
        let tile: number;
        if (a === "forest") tile = n > 0.66 ? T.FLOWER : n > 0.42 ? T.GRASS2 : T.GRASS;
        else if (a === "coast") tile = n > 0.72 ? T.SAND : n > 0.4 ? T.COAST : T.GRASS2;
        else if (a === "desert") tile = n > 0.55 ? T.SAND2 : T.SAND;
        else tile = n > 0.55 ? T.MYSTIC2 : T.MYSTIC;
        row.push(tile);
      }
      data.push(row);
    }
    const map = this.make.tilemap({ data, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileTexture = this.textures.exists("env_worldtiles") ? "env_worldtiles" : "worldtiles";
    const tileset = map.addTilesetImage(tileTexture, tileTexture, TILE_SIZE, TILE_SIZE)!;
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
    this.pondEffectBounds = new Phaser.Geom.Rectangle(px + 22, py + 18, pw - 44, ph - 36);

    if (this.textures.exists("env_pond")) {
      this.add.image(cx, cy + 5, "env_pond").setOrigin(0.5).setScale(0.93).setDepth(-6);
      const surface = this.add.graphics().setDepth(-5);
      surface.fillStyle(0x9fdcff, 0.12).fillEllipse(cx, cy + 3, pw * 0.72, ph * 0.46);
      surface.lineStyle(1, 0xd8f5ff, 0.22).strokeEllipse(cx, cy + 1, pw * 0.58, ph * 0.32);
      this.tweens.add({
        targets: surface,
        alpha: { from: 0.45, to: 0.78 },
        duration: 2600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else {
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
    }

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
        let x = 0;
        let y = 0;
        if (this.waterTiles.length > 0) {
          const w = Phaser.Utils.Array.GetRandom(this.waterTiles);
          x = w.x + Phaser.Math.Between(10, w.width - 10);
          y = w.y + Phaser.Math.Between(10, w.height - 10);
        } else if (this.pondEffectBounds) {
          x = Phaser.Math.Between(this.pondEffectBounds.left, this.pondEffectBounds.right);
          y = Phaser.Math.Between(this.pondEffectBounds.top, this.pondEffectBounds.bottom);
        } else {
          return;
        }
        const s = this.add.graphics();
        s.fillStyle(0xaaddff, 0.85).fillCircle(0, 0, Phaser.Math.Between(1, 3));
        s.setPosition(x, y).setDepth(1);
        this.tweens.add({ targets: s, y: y - 8, alpha: 0, duration: Phaser.Math.Between(800, 1400), ease: "Power1", onComplete: () => s.destroy() });
        if (Phaser.Math.FloatBetween(0, 1) < 0.28) this.spawnPondRipple(x, y);
      },
    });
  }

  private spawnPondRipple(x: number, y: number): void {
    const ripple = this.add.graphics().setPosition(x, y).setDepth(0);
    ripple.lineStyle(1.5, 0xd8f5ff, 0.5).strokeEllipse(0, 0, 16, 6);
    ripple.setScale(0.2);
    this.tweens.add({
      targets: ripple,
      scaleX: 1.7,
      scaleY: 1.25,
      alpha: 0,
      duration: 1200,
      ease: "Sine.easeOut",
      onComplete: () => ripple.destroy(),
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

  // NPCs walk via tweens (no physics body), so we must reject any target whose
  // straight-line path crosses a blocker — otherwise they tween *through*
  // buildings, the flag, the chili plot, or the pond.
  private pathBlocked(x0: number, y0: number, x1: number, y1: number): boolean {
    this.scratchLine.setTo(x0, y0, x1, y1);
    for (const r of this.blocked) {
      if (Phaser.Geom.Intersects.LineToRectangle(this.scratchLine, r)) return true;
    }
    return false;
  }

  // true when a tween target is both off a blocker and reachable without
  // crossing one from the NPC's current position
  private canMoveTo(npc: Npc, tx: number, ty: number): boolean {
    if (this.isBlocked(tx, ty)) return false;
    // if somehow already standing inside a blocker, allow any clear target so
    // the NPC can walk back out instead of freezing forever
    if (this.isBlocked(npc.container.x, npc.container.y)) return true;
    return !this.pathBlocked(npc.container.x, npc.container.y, tx, ty);
  }

  private buildScenery(): void {
    const ts = TILE_SIZE;
    const sway: Phaser.GameObjects.Image[] = [];

    const tryTree = (tx: number, ty: number) => {
      const a = this.areaOf(tx, ty);
      if (a === "plaza" || a === "desert" || a === "mystic") return;
      if (this.nearPondTile(tx, ty, 2)) return;
      if (this.nearNpcTile(tx, ty, 2)) return;
      const key = this.textures.exists("env_tree") ? "env_tree" : Phaser.Math.Between(0, 1) ? "tree" : "tree2";
      const scale = key === "env_tree" ? 0.76 : 0.9;
      sway.push(this.addSolidImage(tx * ts + ts / 2, ty * ts + ts, key, scale, 0.3, 0.16));
    };
    for (let x = 0; x < MAP_W; x += 4) {
      tryTree(x, 0);
      tryTree(x, MAP_H - 1);
    }
    for (let y = 1; y < MAP_H; y += 4) {
      tryTree(0, y);
      tryTree(MAP_W - 1, y);
    }
    for (let i = 0; i < 10; i++) tryTree(Phaser.Math.Between(1, MAP_W - 2), Phaser.Math.Between(1, MAP_H - 2));

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
        if (this.areaOf(tx, ty) === "plaza" || this.nearPondTile(tx, ty, 1) || this.nearNpcTile(tx, ty, 1)) continue;
        const img = this.add.image(tx * ts, ty * ts, key).setOrigin(0.5, 1);
        img.setDepth(ty * ts);
      }
    };
    decor("flower", 90);
    decor("flower2", 70);
    decor("flower3", 60);
    if (this.textures.exists("env_grass_1")) {
      for (let i = 0; i < 90; i++) {
        const tx = Phaser.Math.Between(2, MAP_W - 2);
        const ty = Phaser.Math.Between(2, MAP_H - 2);
        if (this.areaOf(tx, ty) === "plaza" || this.nearPondTile(tx, ty, 1) || this.nearNpcTile(tx, ty, 1)) continue;
        const key = Phaser.Utils.Array.GetRandom(["env_grass_1", "env_grass_2", "env_grass_3"]);
        const img = this.add.image(tx * ts + Phaser.Math.Between(-8, 8), ty * ts + Phaser.Math.Between(4, 15), key).setOrigin(0.5, 1);
        img.setDepth(ty * ts - 1).setScale(Phaser.Math.FloatBetween(0.7, 1.15));
      }
    }
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
      if (this.nearPondTile(tx, ty, 1) || this.nearNpcTile(tx, ty, 1)) continue;
      const b = this.add.image(tx * ts, ty * ts, "blade").setOrigin(0.5, 1).setDepth(ty * ts - 1).setScale(Phaser.Math.FloatBetween(0.8, 1.4));
      this.tweens.add({ targets: b, angle: Phaser.Math.FloatBetween(6, 12), duration: Phaser.Math.Between(1200, 2200), yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  private spawnBuildings(): void {
    const ts = TILE_SIZE;
    // Updated Constual HQ from the environment pack, with the old handmade
    // landmark as a fallback if the generated asset is missing.
    if (this.textures.exists("env_constual_hq")) {
      this.addBuildingImage(25 * ts, 13 * ts, "env_constual_hq", 0.74, 0.66, 0.36);
    } else {
      const hq = createBuilding(this, "hq", 25 * ts, 13 * ts);
      this.addStaticCollider(hq.x, hq.y - 48, 118, 96);
    }

    // Keep landmarks spaced out so NPC tags and bodies stay readable.
    const refs: [string, number, number][] = [
      ["env_building_2", 9, 34], ["b8", 18, 36], // coast
      ["env_building_3", 39, 6], // desert
      ["env_pusat_korupsi", 47, 22], ["env_dprsampah", 46, 36], // new civic landmarks
      ["b4", 42, 34], // mystic edge
    ];
    for (const [key, tx, ty] of refs) {
      if (this.nearNpcTile(tx, ty, 2)) continue;
      this.addBuildingImage(tx * ts, ty * ts, key, 0.66);
    }
  }

  private addBuildingImage(x: number, y: number, key: string, scale: number, bodyW = 0.72, bodyH = 0.42): void {
    if (!this.textures.exists(key)) return;
    const img = this.add.image(x, y, key).setOrigin(0.5, 1).setScale(scale);
    img.setDepth(y);
    const w = img.displayWidth * bodyW;
    const h = img.displayHeight * bodyH;
    this.addStaticCollider(x, y - h / 2, w, h);
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

      this.scheduleBehavior(npc, x, y);

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

  // a floating symbol above an NPC (chat / activity emote)
  private emote(npc: Npc, symbol: string, color = "#e8f4fd"): void {
    if (!npc.container.visible) return;
    const e = this.add
      .text(npc.container.x + Phaser.Math.Between(-6, 8), npc.container.y - NPC_TOP - 4, symbol, {
        fontFamily: "monospace",
        fontSize: "15px",
        color,
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(npc.container.y + 3);
    this.tweens.add({ targets: e, y: e.y - 22, alpha: { from: 1, to: 0 }, duration: 1400, ease: "Sine.easeOut", onComplete: () => e.destroy() });
  }

  // route each NPC to its activity (fishing, gardening, meditating…) or wander
  private scheduleBehavior(npc: Npc, hx: number, hy: number): void {
    const act = npc.def.activity ?? "wander";
    if (act === "wander") {
      this.scheduleWander(npc, hx, hy);
      return;
    }
    if (act === "fish") {
      const pcx = (POND.tx + POND.tw / 2) * TILE_SIZE;
      npc.visual.setFlipX(pcx < hx);
    }
    if (act === "dance") {
      this.scheduleDance(npc);
      return;
    }
    if (act === "gather") {
      this.scheduleGather(npc, hx, hy);
      return;
    }
    if (act === "stroll") {
      this.scheduleStroll(npc);
      return;
    }
    if (act === "couple") {
      // couples are wired up in startCouples() once every NPC exists; stay put
      return;
    }
    // stationary activities: stay on the spot, occasional shuffle + themed emote
    const emotes: Record<string, [string, string]> = {
      tend: ["✿", "#9be15d"],
      meditate: ["✦", "#c792ff"],
      sit: ["♪", "#9fe7ff"],
      train: ["✦", "#c8f169"],
    };
    if (act === "fish") emotes.fish = ["~", "#9fe7ff"];
    const [sym, col] = emotes[act] ?? ["·", "#e8f4fd"];
    if (act === "sit") npc.visual.setFrame(0); // calmer pose
    const step = () => {
      if (!npc.container.active) return;
      if (Phaser.Math.FloatBetween(0, 1) < 0.45) {
        const tx = Phaser.Math.Clamp(hx + Phaser.Math.Between(-16, 16), TILE_SIZE, WORLD_W - TILE_SIZE);
        const ty = Phaser.Math.Clamp(hy + Phaser.Math.Between(-10, 10), TILE_SIZE, WORLD_H - TILE_SIZE);
        if (this.canMoveTo(npc, tx, ty)) {
          npc.visual.setFlipX(tx < npc.container.x);
          this.tweens.add({ targets: npc.container, x: tx, y: ty, duration: 700, ease: "Sine.easeInOut" });
        }
      } else {
        this.emote(npc, sym, col);
      }
      this.time.delayedCall(Phaser.Math.Between(1800, 4200), step);
    };
    this.time.delayedCall(Phaser.Math.Between(300, 2200), step);
  }

  // Absol-style dancing: stays put and busts a gentle looping move.
  // with rhythmic music notes. Pure tween/visual — no body movement.
  private scheduleDance(npc: Npc): void {
    const v = npc.visual;
    const baseY = v.y;
    // a bouncy, looping shimmy + side-to-side lean
    this.tweens.add({
      targets: v,
      y: baseY - 9,
      duration: 260,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    const beat = () => {
      if (!npc.container.active) return;
      this.emote(npc, Phaser.Utils.Array.GetRandom(["♪", "♫", "✦"]), "#ffe066");
      this.time.delayedCall(Phaser.Math.Between(900, 1500), beat);
    };
    this.time.delayedCall(Phaser.Math.Between(300, 1200), beat);
  }

  // Gathering: hangs around a shared spot in a tight cluster (so groups form and
  // chat via startSocial), then occasionally roams off and wanders back —
  // "berkumpul bareng ... lalu jalan jalan lagi".
  private scheduleGather(npc: Npc, gx: number, gy: number): void {
    const moveTo = (tx: number, ty: number, onDone: () => void) => {
      tx = Phaser.Math.Clamp(tx, TILE_SIZE, WORLD_W - TILE_SIZE);
      ty = Phaser.Math.Clamp(ty, TILE_SIZE, WORLD_H - TILE_SIZE);
      if (!this.canMoveTo(npc, tx, ty)) {
        this.time.delayedCall(500, onDone);
        return;
      }
      npc.visual.setFlipX(tx < npc.container.x);
      const dist = Phaser.Math.Distance.Between(npc.container.x, npc.container.y, tx, ty);
      this.tweens.add({
        targets: npc.container,
        x: tx,
        y: ty,
        duration: Math.max(500, dist * 16),
        ease: "Sine.easeInOut",
        onComplete: onDone,
      });
    };
    const step = () => {
      if (!npc.container.active) return;
      const roll = Phaser.Math.FloatBetween(0, 1);
      if (roll < 0.2) {
        // wander off a bit, then it'll drift back on a later tick
        const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const r = Phaser.Math.Between(90, 170);
        moveTo(gx + Math.cos(ang) * r, gy + Math.sin(ang) * r, () => this.time.delayedCall(Phaser.Math.Between(1500, 3500), step));
      } else if (roll < 0.6) {
        // shuffle to a fresh spot within the cluster
        const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const r = Phaser.Math.Between(14, 48);
        moveTo(gx + Math.cos(ang) * r, gy + Math.sin(ang) * r, () => this.time.delayedCall(Phaser.Math.Between(1200, 2800), step));
      } else {
        // hang out: glance around / emote
        if (Phaser.Math.FloatBetween(0, 1) < 0.5) this.emote(npc, Phaser.Utils.Array.GetRandom(["♪", "~", "✦", "!"]), "#cfe8ff");
        this.time.delayedCall(Phaser.Math.Between(1400, 3200), step);
      }
    };
    this.time.delayedCall(Phaser.Math.Between(300, 2600), step);
  }

  // Chill long-range stroll: wanders to random points anywhere on the map (a
  // relaxed top-to-bottom walkabout), pausing to look around. Avoids blockers.
  private scheduleStroll(npc: Npc): void {
    const step = () => {
      if (!npc.container.active) return;
      let tx = 0;
      let ty = 0;
      let ok = false;
      for (let i = 0; i < 8 && !ok; i++) {
        tx = Phaser.Math.Between(TILE_SIZE * 2, WORLD_W - TILE_SIZE * 2);
        ty = Phaser.Math.Between(TILE_SIZE * 2, WORLD_H - TILE_SIZE * 2);
        ok = this.canMoveTo(npc, tx, ty);
      }
      if (!ok) {
        this.time.delayedCall(800, step);
        return;
      }
      npc.visual.setFlipX(tx < npc.container.x);
      const dist = Phaser.Math.Distance.Between(npc.container.x, npc.container.y, tx, ty);
      this.tweens.add({
        targets: npc.container,
        x: tx,
        y: ty,
        duration: Math.max(900, dist * 18), // unhurried pace
        ease: "Sine.easeInOut",
        onComplete: () => {
          if (Phaser.Math.FloatBetween(0, 1) < 0.4) this.emote(npc, Phaser.Utils.Array.GetRandom(["~", "♪", "✦"]), "#cfe8ff");
          this.time.delayedCall(Phaser.Math.Between(900, 2600), step);
        },
      });
    };
    this.time.delayedCall(Phaser.Math.Between(300, 2600), step);
  }

  private npcByKey(key: string): Npc | undefined {
    return this.npcs.find((n) => n.def.key === key);
  }

  // Couples stand together, face each other, sway, and float hearts.
  private startCouples(): void {
    const pairs: [string, string][] = [["hazelnty", "flylucifer"]];
    for (const [ak, bk] of pairs) {
      const a = this.npcByKey(ak);
      const b = this.npcByKey(bk);
      if (!a || !b) continue;
      // face each other
      a.visual.setFlipX(b.container.x < a.container.x);
      b.visual.setFlipX(a.container.x < b.container.x);
      // gentle togetherness sway
      this.time.addEvent({
        delay: 2600,
        loop: true,
        callback: () => {
          if (!a.container.visible && !b.container.visible) return;
          this.emote(a, "♥", "#ff8fc0");
          this.time.delayedCall(700, () => this.emote(b, "♥", "#ff8fc0"));
        },
      });
    }
  }

  // Friendly NPCs greet with a "Gritual!" chat bubble above their heads.
  private startGreetings(): void {
    const keys = ["josh", "jez", "stefan", "shen", "strobely", "deell"];
    const greeters = this.npcs.filter((n) => keys.includes(n.def.key));
    if (greeters.length === 0) return;
    this.time.addEvent({
      delay: 3200,
      loop: true,
      callback: () => {
        const visible = greeters.filter((n) => n.container.visible);
        if (visible.length === 0) return;
        const n = Phaser.Utils.Array.GetRandom(visible);
        this.speechBubble(n, "Gritual!");
      },
    });
  }

  // a small pixel chat bubble that pops above an NPC, then fades
  private speechBubble(npc: Npc, text: string): void {
    const x = npc.container.x;
    const y = npc.container.y - NPC_TOP - 8;
    const t = this.add
      .text(x, y, text, {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#10210a",
        backgroundColor: "#c8f169",
        padding: { x: 6, y: 3 },
        fontStyle: "bold",
      })
      .setOrigin(0.5, 1)
      .setDepth(npc.container.y + 4)
      .setScale(0);
    this.tweens.add({ targets: t, scale: 1, duration: 160, ease: "Back.easeOut" });
    this.tweens.add({
      targets: t,
      y: y - 10,
      alpha: { from: 1, to: 0 },
      delay: 1300,
      duration: 500,
      ease: "Sine.easeIn",
      onComplete: () => t.destroy(),
    });
  }

  // light-hearted random events so the world has surprises
  private startRandomEvents(): void {
    const quips = ["LOL", "GG", "WAGMI", "Gritual!", "?!", "ser", "gm", "✦✦"];
    // a random NPC does a funny little reaction
    this.time.addEvent({
      delay: 9000,
      loop: true,
      callback: () => {
        const vis = this.npcs.filter((n) => n.container.visible && (n.def.activity ?? "wander") !== "fish");
        if (vis.length === 0) return;
        const n = Phaser.Utils.Array.GetRandom(vis);
        this.speechBubble(n, Phaser.Utils.Array.GetRandom(quips));
        // a quick hop without rotating the character sprite.
        this.tweens.add({ targets: n.visual, y: n.visual.y - 14, duration: 260, yoyo: true, ease: "Quad.easeOut" });
      },
    });
    // an occasional shooting star streaks across the sky
    this.time.addEvent({
      delay: 14000,
      loop: true,
      callback: () => {
        if (Phaser.Math.FloatBetween(0, 1) > 0.5) return;
        const view = this.cameras.main.worldView;
        const sx = view.x + Phaser.Math.Between(40, view.width - 200);
        const sy = view.y + Phaser.Math.Between(20, 120);
        const star = this.add.image(sx, sy, "fx_dot").setTint(0xfff4b0).setScale(3).setDepth(8000);
        const trail = this.add.image(sx, sy, "fx_dot").setTint(0xffffff).setScale(1.5).setAlpha(0.6).setDepth(7999);
        this.tweens.add({ targets: [star, trail], x: sx + 260, y: sy + 120, duration: 900, ease: "Sine.easeIn", onComplete: () => { star.destroy(); trail.destroy(); } });
        this.tweens.add({ targets: [star, trail], alpha: 0, delay: 500, duration: 400 });
      },
    });
  }

  // every few seconds, two nearby social NPCs face each other and "chat"
  private startSocial(): void {
    this.time.addEvent({
      delay: 4500,
      loop: true,
      callback: () => {
        const social: ReadonlySet<string> = new Set(["wander", "gather", "dance"]);
        const free = this.npcs.filter((n) => social.has(n.def.activity ?? "wander") && n.container.visible);
        Phaser.Utils.Array.Shuffle(free);
        for (let i = 0; i < free.length; i++) {
          for (let j = i + 1; j < free.length; j++) {
            const a = free[i];
            const b = free[j];
            if (Phaser.Math.Distance.Between(a.container.x, a.container.y, b.container.x, b.container.y) < 130) {
              this.chat(a, b);
              return;
            }
          }
        }
      },
    });
  }

  private chat(a: Npc, b: Npc): void {
    a.visual.setFlipX(b.container.x < a.container.x);
    b.visual.setFlipX(a.container.x < b.container.x);
    const syms = ["!", "♪", "✦", "~", "?"];
    let n = 0;
    this.time.addEvent({
      delay: 750,
      repeat: 4,
      callback: () => {
        const who = n % 2 === 0 ? a : b;
        this.emote(who, Phaser.Utils.Array.GetRandom(syms), "#cfe8ff");
        n++;
      },
    });
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
        ok = this.canMoveTo(npc, tx, ty);
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

    // tap / click to walk there; tap a character to walk over and talk to them
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.interactLocked) return;
      // ignore taps on the fixed minimap (now bottom-right) so it isn't a move target
      if (p.x > this.scale.width - 150 && p.y > this.scale.height - 130) return;
      const wx = p.worldX;
      const wy = p.worldY;
      let near: Npc | null = null;
      let best = 70;
      for (const n of this.npcs) {
        const d = Phaser.Math.Distance.Between(wx, wy, n.container.x, n.container.y);
        if (d < best) {
          best = d;
          near = n;
        }
      }
      if (near) {
        this.tapInteractNpc = near;
        this.moveTarget = { x: near.container.x, y: near.container.y };
      } else {
        this.tapInteractNpc = null;
        this.moveTarget = { x: wx, y: wy };
        this.spawnTapMarker(wx, wy);
      }
      gameBridge.emit("sfx", { name: "tap" });
    });
  }

  // little expanding ring where the player tapped
  private spawnTapMarker(x: number, y: number): void {
    const g = this.add.graphics().setDepth(y + 5);
    g.lineStyle(3, 0x00ff88, 0.9).strokeCircle(0, 0, 7);
    g.setPosition(x, y);
    this.tweens.add({
      targets: g,
      scale: { from: 0.6, to: 2.4 },
      alpha: { from: 0.9, to: 0 },
      duration: 430,
      ease: "Cubic.easeOut",
      onComplete: () => g.destroy(),
    });
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
    const names = QUEST_TEACHER_NAMES.map((name) => (name === "Siggy Anime Girl" ? "Siggy" : name));
    const teacherGuide = this.scale.width < 520
      ? `EXP: ${names.slice(0, 3).join(" / ")}\n${names.slice(3).join(" / ")}`
      : `Talk: ${names.join(" / ")}`;
    this.questText?.setText(`QUEST  ${done}/${this.hud.total}\n${teacherGuide}`);
  }

  private repositionUi(): void {
    this.questText?.setPosition(12, 64);
  }

  private drawMinimap(): void {
    // smaller on phones; pinned to the BOTTOM-right so it never collides with
    // the React top bar (Exit / Connect Wallet) — which was the mobile overlap.
    const mobile = this.scale.width < 640;
    const mmW = mobile ? 84 : 120;
    const mmH = mobile ? 68 : 96;
    const ox = this.scale.width - mmW - 12;
    const oy = this.scale.height - mmH - 14;
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

    const kbActive = vx !== 0 || vy !== 0;
    if (kbActive) {
      // keyboard cancels any tap-to-move target
      this.moveTarget = null;
      this.tapInteractNpc = null;
      if (vx !== 0 && vy !== 0) {
        const inv = 1 / Math.hypot(vx, vy);
        vx = vx * inv * speed;
        vy = vy * inv * speed;
      }
    } else if (this.moveTarget) {
      const dx = this.moveTarget.x - this.player.x;
      const dy = this.moveTarget.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      const stopAt = this.tapInteractNpc ? 56 : 8;
      if (dist > stopAt) {
        vx = (dx / dist) * speed;
        vy = (dy / dist) * speed;
      } else {
        this.moveTarget = null;
        if (this.tapInteractNpc) {
          const npc = this.tapInteractNpc;
          this.tapInteractNpc = null;
          this.interactWith(npc);
        }
      }
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
      // gentle breathing/idle bob on the visual (independent of wander).
      // dancers drive their own y/angle via tween, so leave them alone.
      if (n.def.activity !== "dance") n.visual.y = -Math.abs(Math.sin((t + n.phase) * 0.004)) * 2.6;
      n.container.setDepth(n.container.y);
      n.tag.setPosition(n.container.x, n.container.y - NPC_TOP).setDepth(n.container.y + 1);
      n.bubble.setPosition(n.container.x, n.container.y - NPC_TOP - 12).setDepth(n.container.y + 1);
    }
  }
}
