import Phaser from "phaser";

// Five unique hand-drawn landmark buildings (Phaser Graphics in containers).
// Each container's (x, y) is its ground baseline; graphics are drawn with their
// base at local y = 0 so depth = container.y sorts correctly against characters.
// Collision footprint is stored via setData('collW'/'collH') and read by the
// scene to add a static body at the building's base.

const PIXEL_FONT = '"Press Start 2P", monospace';

export function createBuildings(scene: Phaser.Scene): Phaser.GameObjects.Container[] {
  const buildings: Phaser.GameObjects.Container[] = [];

  // BUILDING 1: Constual HQ — central hub, dark blue with glowing green windows
  {
    const hq = scene.add.container(800, 470);
    const g = scene.add.graphics();
    g.fillStyle(0x1a2040, 1).fillRect(-60, -100, 120, 100);
    g.fillStyle(0x0d1428, 1).fillRect(-65, -115, 130, 20).fillRect(-45, -130, 90, 18).fillRect(-25, -143, 50, 14);
    g.fillStyle(0x00ff88, 0.9);
    for (const ry of [-85, -55, -25]) for (const rx of [-45, -10, 25]) g.fillRect(rx, ry, 20, 16);
    g.fillStyle(0x00cc66, 1).fillRect(-15, -40, 30, 40);
    g.fillStyle(0x002211, 1).fillRect(-50, -72, 100, 18);
    const sign = scene.add.text(0, -63, "CONSTUAL", { fontSize: "8px", color: "#00ff88", fontFamily: PIXEL_FONT }).setOrigin(0.5);
    hq.add([g, sign]);
    hq.setData("collW", 120).setData("collH", 34);
    scene.tweens.add({ targets: g, alpha: { from: 0.9, to: 1 }, duration: 1500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    buildings.push(hq);
  }

  // BUILDING 2: Health Clinic — white/teal with red cross
  {
    const c = scene.add.container(330, 430);
    const g = scene.add.graphics();
    g.fillStyle(0xdff5f0, 1).fillRect(-50, -80, 100, 80);
    g.fillStyle(0x88ccbb, 1).fillRect(-55, -92, 110, 16);
    g.fillStyle(0xff3333, 1).fillRect(-8, -70, 16, 44).fillRect(-22, -54, 44, 16);
    g.fillStyle(0x55aaaa, 1).fillRect(-15, -36, 30, 36);
    g.fillStyle(0xaaddee, 1).fillRect(-42, -68, 18, 14).fillRect(24, -68, 18, 14);
    c.add(g);
    c.setData("collW", 100).setData("collH", 30);
    buildings.push(c);
  }

  // BUILDING 3: Web3 Lab — dark futuristic with neon purple + blinking antenna
  {
    const lab = scene.add.container(1290, 380);
    const g = scene.add.graphics();
    g.fillStyle(0x150a2a, 1).fillRect(-55, -90, 110, 90);
    g.lineStyle(2, 0xaa44ff, 1).strokeRect(-55, -90, 110, 90).strokeRect(-55, -90, 110, 22);
    g.fillStyle(0x9933ff, 0.8).fillRect(-40, -60, 22, 18).fillRect(18, -60, 22, 18).fillRect(-40, -30, 22, 18).fillRect(18, -30, 22, 18);
    g.lineStyle(3, 0xaa44ff, 1).lineBetween(0, -90, 0, -115);
    g.fillStyle(0x6622cc, 1).fillRect(-14, -38, 28, 38);
    const beacon = scene.add.graphics();
    beacon.fillStyle(0xff44ff, 1).fillCircle(0, -117, 5);
    const sign = scene.add.text(0, -80, "WEB3 LAB", { fontSize: "6px", color: "#cc88ff", fontFamily: PIXEL_FONT }).setOrigin(0.5);
    lab.add([g, beacon, sign]);
    lab.setData("collW", 110).setData("collH", 30);
    scene.tweens.add({ targets: beacon, alpha: { from: 0.5, to: 1 }, duration: 800, yoyo: true, repeat: -1 });
    buildings.push(lab);
  }

  // BUILDING 4: Ancient Temple (mystic) — stone pillars + mystical orb
  {
    const t = scene.add.container(1240, 1000);
    const g = scene.add.graphics();
    g.fillStyle(0x9988aa, 1).fillRect(-65, -10, 130, 10);
    g.fillStyle(0x887799, 1).fillRect(-75, 0, 150, 8);
    g.fillStyle(0xbbaacc, 1).fillRect(-60, -80, 18, 80).fillRect(-20, -80, 18, 80).fillRect(20, -80, 18, 80).fillRect(42, -80, 18, 80);
    g.fillStyle(0x554466, 1).fillTriangle(-75, -80, 0, -130, 75, -80).fillRect(-60, -85, 120, 10);
    const orb = scene.add.graphics();
    orb.fillStyle(0xdd99ff, 0.8).fillCircle(0, -55, 12);
    orb.fillStyle(0xaa44dd, 1).fillCircle(0, -55, 7);
    t.add([g, orb]);
    t.setData("collW", 150).setData("collH", 26);
    scene.tweens.add({ targets: orb, alpha: { from: 0.55, to: 1 }, scale: { from: 0.9, to: 1.1 }, duration: 2000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    buildings.push(t);
  }

  // BUILDING 5: Nutrition Market — warm stall with striped awning
  {
    const m = scene.add.container(340, 1060);
    const g = scene.add.graphics();
    g.fillStyle(0xcc7722, 1).fillRect(-55, -65, 110, 65);
    for (let i = 0; i < 6; i++) {
      g.fillStyle(i % 2 === 0 ? 0xff9933 : 0xffcc44, 1).fillRect(-60 + i * 20, -82, 20, 22);
    }
    g.lineStyle(2, 0x884400, 1).strokeRect(-60, -82, 120, 22);
    g.fillStyle(0xffddaa, 1).fillRect(-45, -50, 90, 30);
    const sign = scene.add.text(0, -76, "NUTRITION", { fontSize: "6px", color: "#442200", fontFamily: PIXEL_FONT }).setOrigin(0.5);
    m.add([g, sign]);
    m.setData("collW", 110).setData("collH", 24);
    buildings.push(m);
  }

  for (const b of buildings) b.setDepth(b.y);
  return buildings;
}
