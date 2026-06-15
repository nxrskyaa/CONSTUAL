import Phaser from "phaser";
import { gameBridge, type WalletState } from "../bridge";
import { zones } from "../data/zones";
import { TILE, TILE_SIZE } from "./PreloadScene";

type NpcDef = {
  zoneId: number;
  textureKey: string;
  tileX: number;
  tileY: number;
};

// Hand-authored placeholder map (0 grass, 1 path, 2 water, 3 tree).
// 20 wide x 15 tall. A path loops through grass with a water pond and tree edge.
const MAP: number[][] = [
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3],
  [3, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 3],
  [3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 3],
  [3, 0, 1, 0, 0, 2, 2, 2, 0, 0, 0, 0, 3, 3, 0, 0, 0, 1, 0, 3],
  [3, 0, 1, 0, 0, 2, 2, 2, 0, 0, 0, 0, 3, 3, 0, 0, 0, 1, 0, 3],
  [3, 0, 1, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 3],
  [3, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 3],
  [3, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3],
  [3, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 3],
  [3, 0, 1, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 3],
  [3, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3],
  [3, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 3],
  [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3],
  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
];

const INTERACT_RANGE = 56;

export default class MainWorldScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private npcs: { def: NpcDef; sprite: Phaser.Types.Physics.Arcade.SpriteWithStaticBody; marker: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }[] = [];
  private portal!: Phaser.Types.Physics.Arcade.SpriteWithStaticBody;
  private hint!: Phaser.GameObjects.Text;
  private interactionLocked = false; // true while a dialog/quiz overlay is open
  private completedZones = new Set<number>();

  constructor() {
    super("MainWorldScene");
  }

  create(): void {
    const map = this.make.tilemap({ data: MAP, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = map.addTilesetImage("tiles", "tiles", TILE_SIZE, TILE_SIZE)!;
    const layer = map.createLayer(0, tileset, 0, 0)!;
    layer.setCollision([TILE.WATER, TILE.TREE]);

    const worldW = MAP[0].length * TILE_SIZE;
    const worldH = MAP.length * TILE_SIZE;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBackgroundColor("#0f1424");

    // Player
    this.player = this.physics.add.sprite(TILE_SIZE * 3, TILE_SIZE * 3, "player");
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(18, 14).setOffset(3, 14);
    this.physics.add.collider(this.player, layer);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.6);

    // NPCs, one per zone, placed on the map.
    const npcDefs: NpcDef[] = [
      { zoneId: zones[0].id, textureKey: "npc-tirta", tileX: 6, tileY: 8 },
      { zoneId: zones[1].id, textureKey: "npc-hangat", tileX: 15, tileY: 5 },
    ];
    npcDefs.forEach((def) => this.spawnNpc(def));

    // Portal pad -> focused ZoneScene for the first zone (demonstrates ZoneScene).
    this.portal = this.physics.add.staticSprite(TILE_SIZE * 9.5, TILE_SIZE * 11.5, "portal");
    this.add
      .text(this.portal.x, this.portal.y - 26, "Quiet Clinic", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#c8f169",
      })
      .setOrigin(0.5);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyE.on("down", () => this.tryInteract());

    // On-screen hint, fixed to the camera.
    this.hint = this.add
      .text(8, 8, "WASD / Arrows to move - E or click to talk", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#e6ecff",
        backgroundColor: "#0f1424cc",
        padding: { x: 6, y: 4 },
      })
      .setScrollFactor(0)
      .setDepth(1000);

    // React -> Phaser wiring.
    const offWallet = gameBridge.on("wallet:state", (state) => this.onWallet(state));
    const offResult = gameBridge.on("tx:result", (res) => {
      if (res.ok && res.kind === "quest") this.markZoneComplete(res.zoneId);
      this.interactionLocked = false;
    });
    const offHide1 = gameBridge.on("dialog:hide", () => (this.interactionLocked = false));
    const offHide2 = gameBridge.on("quiz:hide", () => (this.interactionLocked = false));

    // Apply any wallet state already published before this scene existed.
    const cached = this.registry.get("wallet") as WalletState | undefined;
    if (cached) this.onWallet(cached);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offWallet();
      offResult();
      offHide1();
      offHide2();
    });
  }

  private spawnNpc(def: NpcDef): void {
    const x = def.tileX * TILE_SIZE + TILE_SIZE / 2;
    const y = def.tileY * TILE_SIZE + TILE_SIZE / 2;
    const sprite = this.physics.add.staticSprite(x, y, def.textureKey);
    this.physics.add.collider(this.player, sprite);
    sprite.setInteractive({ useHandCursor: true });
    sprite.on("pointerdown", () => this.interactWith(def));

    const zone = zones.find((z) => z.id === def.zoneId)!;
    const label = this.add
      .text(x, y - 24, zone.npcName, {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#e6ecff",
      })
      .setOrigin(0.5);

    const marker = this.add.image(x, y - 34, "marker").setOrigin(0.5);
    this.tweens.add({ targets: marker, y: y - 40, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    this.npcs.push({ def, sprite, marker, label });
  }

  private onWallet(state: WalletState): void {
    if (!state.isConnected) {
      this.hint.setText("Connect your wallet (top bar) to record quests on-chain");
    } else if (!state.isCorrectChain) {
      this.hint.setText("Switch to Ritual Testnet to record quests");
    } else if (!state.profileCreated) {
      this.hint.setText("Create your Constual Passport to record quests");
    } else {
      this.hint.setText("WASD / Arrows to move - E or click to talk");
    }
  }

  private markZoneComplete(zoneId: number): void {
    this.completedZones.add(zoneId);
    const entry = this.npcs.find((n) => n.def.zoneId === zoneId);
    if (entry) {
      entry.marker.setVisible(false);
      entry.sprite.setTint(0x9be15d);
      entry.label.setText(entry.label.text + " ✓");
    }
  }

  // Find the closest NPC / portal within range and trigger it.
  private tryInteract(): void {
    if (this.interactionLocked) return;

    // Portal first if standing on it.
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.portal.x, this.portal.y) < INTERACT_RANGE) {
      this.enterZoneScene(zones[0].id);
      return;
    }

    let nearest: NpcDef | null = null;
    let best = INTERACT_RANGE;
    for (const { def, sprite } of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, sprite.x, sprite.y);
      if (d < best) {
        best = d;
        nearest = def;
      }
    }
    if (nearest) this.interactWith(nearest);
  }

  private interactWith(def: NpcDef): void {
    if (this.interactionLocked) return;
    const zone = zones.find((z) => z.id === def.zoneId);
    if (!zone) return;
    this.interactionLocked = true;
    gameBridge.emit("dialog:show", {
      zoneId: zone.id,
      npcName: zone.npcName,
      lines: zone.npcDialog,
    });
  }

  private enterZoneScene(zoneId: number): void {
    this.interactionLocked = true;
    this.cameras.main.fadeOut(220, 15, 20, 36);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("ZoneScene", { zoneId });
    });
  }

  update(): void {
    if (!this.player?.body) return;
    const speed = 150;
    const body = this.player.body;
    body.setVelocity(0);

    if (this.interactionLocked) return; // freeze while an overlay is open

    const left = this.cursors.left.isDown || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;
    const up = this.cursors.up.isDown || this.keyW.isDown;
    const down = this.cursors.down.isDown || this.keyS.isDown;

    if (left) body.setVelocityX(-speed);
    else if (right) body.setVelocityX(speed);
    if (up) body.setVelocityY(-speed);
    else if (down) body.setVelocityY(speed);

    body.velocity.normalize().scale(speed);
  }
}
