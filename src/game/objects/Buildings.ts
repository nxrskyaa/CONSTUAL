import Phaser from "phaser";

// Placeable hand-drawn landmark buildings (Phaser Graphics in a container).
// The container's (x, y) is its ground baseline; graphics are drawn with their
// base at local y = 0 so depth = container.y sorts correctly against characters.
// Collision footprint is stored via setData('collW'/'collH') and read by the
// scene to add a static body at the building's base.

const PIXEL_FONT = '"Press Start 2P", monospace';

export type BuildingType = "hq" | "clinic" | "lab" | "temple" | "market" | "house" | "crystal";

export function createBuilding(scene: Phaser.Scene, type: BuildingType, x: number, y: number): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  c.add(g);

  switch (type) {
    case "hq": {
      g.fillStyle(0x1a2040, 1).fillRect(-60, -100, 120, 100);
      g.fillStyle(0x0d1428, 1).fillRect(-65, -115, 130, 20).fillRect(-45, -130, 90, 18).fillRect(-25, -143, 50, 14);
      g.fillStyle(0x00ff88, 0.9);
      for (const ry of [-85, -55, -25]) for (const rx of [-45, -10, 25]) g.fillRect(rx, ry, 20, 16);
      g.fillStyle(0x00cc66, 1).fillRect(-15, -40, 30, 40);
      g.fillStyle(0x002211, 1).fillRect(-50, -72, 100, 18);
      g.lineStyle(2, 0x05060f, 1).strokeRect(-60, -100, 120, 100).strokeRect(-65, -115, 130, 20).strokeRect(-15, -40, 30, 40).strokeRect(-50, -72, 100, 18);
      for (const ry of [-85, -55, -25]) for (const rx of [-45, -10, 25]) g.strokeRect(rx, ry, 20, 16);
      c.add(scene.add.text(0, -63, "CONSTUAL", { fontSize: "8px", color: "#00ff88", fontFamily: PIXEL_FONT }).setOrigin(0.5));
      c.setData("collW", 118).setData("collH", 96);
      scene.tweens.add({ targets: g, alpha: { from: 0.9, to: 1 }, duration: 1500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      break;
    }
    case "clinic": {
      g.fillStyle(0xdff5f0, 1).fillRect(-50, -80, 100, 80);
      g.fillStyle(0x88ccbb, 1).fillRect(-55, -92, 110, 16);
      g.fillStyle(0xff3333, 1).fillRect(-8, -70, 16, 44).fillRect(-22, -54, 44, 16);
      g.fillStyle(0x55aaaa, 1).fillRect(-15, -36, 30, 36);
      g.fillStyle(0xaaddee, 1).fillRect(-42, -68, 18, 14).fillRect(24, -68, 18, 14);
      g.lineStyle(2, 0x123a38, 1).strokeRect(-50, -80, 100, 80).strokeRect(-55, -92, 110, 16).strokeRect(-15, -36, 30, 36).strokeRect(-42, -68, 18, 14).strokeRect(24, -68, 18, 14);
      c.setData("collW", 100).setData("collH", 76);
      break;
    }
    case "lab": {
      g.fillStyle(0x150a2a, 1).fillRect(-55, -90, 110, 90);
      g.lineStyle(2, 0xaa44ff, 1).strokeRect(-55, -90, 110, 90).strokeRect(-55, -90, 110, 22);
      g.fillStyle(0x9933ff, 0.8).fillRect(-40, -60, 22, 18).fillRect(18, -60, 22, 18).fillRect(-40, -30, 22, 18).fillRect(18, -30, 22, 18);
      g.lineStyle(3, 0xaa44ff, 1).lineBetween(0, -90, 0, -115);
      g.fillStyle(0x6622cc, 1).fillRect(-14, -38, 28, 38);
      g.lineStyle(2, 0x05060f, 1).strokeRect(-14, -38, 28, 38).strokeRect(-40, -60, 22, 18).strokeRect(18, -60, 22, 18).strokeRect(-40, -30, 22, 18).strokeRect(18, -30, 22, 18);
      const beacon = scene.add.graphics();
      beacon.fillStyle(0xff44ff, 1).fillCircle(0, -117, 5);
      c.add([beacon, scene.add.text(0, -80, "WEB3 LAB", { fontSize: "6px", color: "#cc88ff", fontFamily: PIXEL_FONT }).setOrigin(0.5)]);
      c.setData("collW", 110).setData("collH", 86);
      scene.tweens.add({ targets: beacon, alpha: { from: 0.5, to: 1 }, duration: 800, yoyo: true, repeat: -1 });
      break;
    }
    case "temple": {
      g.fillStyle(0x9988aa, 1).fillRect(-65, -10, 130, 10);
      g.fillStyle(0x887799, 1).fillRect(-75, 0, 150, 8);
      g.fillStyle(0xbbaacc, 1).fillRect(-60, -80, 18, 80).fillRect(-20, -80, 18, 80).fillRect(20, -80, 18, 80).fillRect(42, -80, 18, 80);
      g.fillStyle(0x554466, 1).fillTriangle(-75, -80, 0, -130, 75, -80).fillRect(-60, -85, 120, 10);
      g.lineStyle(2, 0x1c1430, 1).strokeRect(-60, -80, 18, 80).strokeRect(-20, -80, 18, 80).strokeRect(20, -80, 18, 80).strokeRect(42, -80, 18, 80).strokeRect(-60, -85, 120, 10);
      const orb = scene.add.graphics();
      orb.fillStyle(0xdd99ff, 0.8).fillCircle(0, -55, 12);
      orb.fillStyle(0xaa44dd, 1).fillCircle(0, -55, 7);
      c.add(orb);
      c.setData("collW", 132).setData("collH", 78);
      scene.tweens.add({ targets: orb, alpha: { from: 0.55, to: 1 }, scale: { from: 0.9, to: 1.1 }, duration: 2000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      break;
    }
    case "market": {
      g.fillStyle(0xcc7722, 1).fillRect(-55, -65, 110, 65);
      for (let i = 0; i < 6; i++) g.fillStyle(i % 2 === 0 ? 0xff9933 : 0xffcc44, 1).fillRect(-60 + i * 20, -82, 20, 22);
      g.lineStyle(2, 0x884400, 1).strokeRect(-60, -82, 120, 22);
      g.fillStyle(0xffddaa, 1).fillRect(-45, -50, 90, 30);
      g.lineStyle(2, 0x3a1d00, 1).strokeRect(-55, -65, 110, 65).strokeRect(-45, -50, 90, 30);
      c.add(scene.add.text(0, -76, "NUTRITION", { fontSize: "6px", color: "#442200", fontFamily: PIXEL_FONT }).setOrigin(0.5));
      c.setData("collW", 110).setData("collH", 62);
      break;
    }
    case "house": {
      g.fillStyle(0xb5743a, 1).fillRect(-42, -64, 84, 64);
      g.fillStyle(0x8a4f24, 1).fillTriangle(-50, -64, 0, -98, 50, -64);
      g.fillStyle(0x5e3a1d, 1).fillRect(-12, -34, 24, 34); // door
      g.fillStyle(0xffe9a8, 1).fillRect(-32, -52, 16, 14).fillRect(16, -52, 16, 14); // windows
      g.lineStyle(2, 0x3a2413, 1).strokeRect(-42, -64, 84, 64).strokeRect(-12, -34, 24, 34).strokeRect(-32, -52, 16, 14).strokeRect(16, -52, 16, 14);
      c.setData("collW", 84).setData("collH", 50);
      break;
    }
    case "crystal": {
      // mystic crystal shrine — glowing purple shards on a stone base
      g.fillStyle(0x3a2c5e, 1).fillRect(-34, -16, 68, 16);
      g.fillStyle(0x2a2046, 1).fillRect(-40, 0, 80, 8);
      g.fillStyle(0x8a5cff, 1).fillTriangle(-18, -16, -2, -84, 12, -16);
      g.fillStyle(0xb38cff, 1).fillTriangle(8, -16, 22, -60, 32, -16);
      g.fillStyle(0xc7a6ff, 1).fillTriangle(-32, -16, -22, -50, -12, -16);
      g.lineStyle(2, 0x1c1430, 1).strokeTriangle(-18, -16, -2, -84, 12, -16).strokeTriangle(8, -16, 22, -60, 32, -16).strokeTriangle(-32, -16, -22, -50, -12, -16);
      const glow = scene.add.graphics();
      glow.fillStyle(0xe9d6ff, 0.7).fillCircle(-3, -50, 6);
      c.add(glow);
      c.setData("collW", 78).setData("collH", 22);
      scene.tweens.add({ targets: glow, alpha: { from: 0.3, to: 0.9 }, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      break;
    }
  }

  c.setDepth(y);
  return c;
}
