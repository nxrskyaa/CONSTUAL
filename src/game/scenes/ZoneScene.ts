import Phaser from "phaser";
import { gameBridge, type WalletState } from "../bridge";
import { getZone, type Zone } from "../data/zones";
import { TILE, TILE_SIZE } from "./PreloadScene";

const INTERACT_RANGE = 60;

type ZoneSceneData = { zoneId: number };

/**
 * ZoneScene
 *
 * A reusable template for a single health-topic "room". It is launched with a
 * `{ zoneId }` payload, builds a small enclosed map, places the topic's NPC, and
 * runs the same dialog -> quiz -> on-chain flow as the overworld. Press B (or the
 * exit pad) to return to the main world.
 */
export default class ZoneScene extends Phaser.Scene {
  private zone!: Zone;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyB!: Phaser.Input.Keyboard.Key;
  private npc!: Phaser.Types.Physics.Arcade.SpriteWithStaticBody;
  private exitPad!: Phaser.Types.Physics.Arcade.SpriteWithStaticBody;
  private interactionLocked = false;

  constructor() {
    super("ZoneScene");
  }

  create(data: ZoneSceneData): void {
    const zone = getZone(data?.zoneId);
    if (!zone) {
      this.scene.start("MainWorldScene");
      return;
    }
    this.zone = zone;
    this.interactionLocked = false;

    const cols = 13;
    const rows = 10;
    const mapData: number[][] = [];
    for (let y = 0; y < rows; y++) {
      const row: number[] = [];
      for (let x = 0; x < cols; x++) {
        const border = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
        row.push(border ? TILE.TREE : TILE.GRASS);
      }
      mapData.push(row);
    }
    // A little decorative water feature for the hydration room, path otherwise.
    mapData[4][6] = TILE.PATH;
    mapData[5][6] = TILE.PATH;

    const map = this.make.tilemap({ data: mapData, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = map.addTilesetImage("tiles", "tiles", TILE_SIZE, TILE_SIZE)!;
    const layer = map.createLayer(0, tileset, 0, 0)!;
    layer.setCollision([TILE.WATER, TILE.TREE]);

    const worldW = cols * TILE_SIZE;
    const worldH = rows * TILE_SIZE;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBackgroundColor("#0f1424");

    // Title banner.
    this.add
      .text(worldW / 2, 14, `${zone.name}  (${zone.nameId})`, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#c8f169",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);

    // Player
    this.player = this.physics.add.sprite(TILE_SIZE * 2, worldH - TILE_SIZE * 2, "player");
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(18, 14).setOffset(3, 14);
    this.physics.add.collider(this.player, layer);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.7);

    // Topic NPC
    const npcKey = zone.id === 1 ? "npc-hangat" : "npc-tirta";
    this.npc = this.physics.add.staticSprite(worldW / 2, TILE_SIZE * 3, npcKey);
    this.physics.add.collider(this.player, this.npc);
    this.npc.setInteractive({ useHandCursor: true });
    this.npc.on("pointerdown", () => this.talk());
    this.add.text(this.npc.x, this.npc.y - 24, zone.npcName, { fontFamily: "monospace", fontSize: "10px", color: "#e6ecff" }).setOrigin(0.5);
    const marker = this.add.image(this.npc.x, this.npc.y - 34, "marker").setOrigin(0.5);
    this.tweens.add({ targets: marker, y: this.npc.y - 40, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    // Exit pad back to overworld
    this.exitPad = this.physics.add.staticSprite(TILE_SIZE * 1.5, TILE_SIZE * 1.5, "portal");
    this.add.text(this.exitPad.x, this.exitPad.y - 24, "Exit", { fontFamily: "monospace", fontSize: "10px", color: "#ffb35c" }).setOrigin(0.5);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyB = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.keyE.on("down", () => this.tryInteract());
    this.keyB.on("down", () => this.leave());

    this.add
      .text(8, worldH - 4, "WASD move - E talk - B back", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#e6ecff",
        backgroundColor: "#0f1424cc",
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(1000);

    // Bridge wiring
    const offResult = gameBridge.on("tx:result", () => (this.interactionLocked = false));
    const offHide1 = gameBridge.on("dialog:hide", () => (this.interactionLocked = false));
    const offHide2 = gameBridge.on("quiz:hide", () => (this.interactionLocked = false));
    const cached = this.registry.get("wallet") as WalletState | undefined;
    void cached;

    this.cameras.main.fadeIn(220, 15, 20, 36);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offResult();
      offHide1();
      offHide2();
    });
  }

  private tryInteract(): void {
    if (this.interactionLocked) return;
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.exitPad.x, this.exitPad.y) < INTERACT_RANGE) {
      this.leave();
      return;
    }
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.npc.x, this.npc.y) < INTERACT_RANGE) {
      this.talk();
    }
  }

  private talk(): void {
    if (this.interactionLocked) return;
    this.interactionLocked = true;
    gameBridge.emit("dialog:show", {
      zoneId: this.zone.id,
      npcName: this.zone.npcName,
      lines: this.zone.npcDialog,
    });
  }

  private leave(): void {
    this.cameras.main.fadeOut(200, 15, 20, 36);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("MainWorldScene");
    });
  }

  update(): void {
    if (!this.player?.body) return;
    const speed = 150;
    const body = this.player.body;
    body.setVelocity(0);
    if (this.interactionLocked) return;

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
