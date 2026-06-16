import Phaser from "phaser";

// Drifting clouds + occasional bird flocks for a livelier sky. Rendered in
// screen space (scrollFactor 0) above the world but below the day/night tint
// and HUD. Created once; never re-created in update().

const CLOUD_DEPTH = 5000;
const BIRD_DEPTH = 4990;

export class CloudSystem {
  private objects: Phaser.GameObjects.GameObject[] = [];
  private scene: Phaser.Scene;
  private birdTimer?: Phaser.Time.TimerEvent;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.spawnClouds(8);
    this.birdTimer = scene.time.addEvent({ delay: Phaser.Math.Between(6000, 12000), loop: true, callback: () => this.spawnFlock() });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private createCloudGraphic(width: number, height: number, soft: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.fillStyle(0xffffff, 0.6 * soft);
    g.fillEllipse(0, 0, width, height);
    g.fillStyle(0xffffff, 0.5 * soft);
    g.fillEllipse(-width * 0.28, -height * 0.2, width * 0.55, height * 0.75);
    g.fillEllipse(width * 0.22, -height * 0.18, width * 0.5, height * 0.7);
    g.fillStyle(0xffffff, 0.45 * soft);
    g.fillEllipse(-width * 0.05, -height * 0.38, width * 0.42, height * 0.65);
    g.fillEllipse(width * 0.34, -height * 0.05, width * 0.3, height * 0.5);
    return g;
  }

  private spawnClouds(count: number): void {
    const cam = this.scene.cameras.main;
    for (let i = 0; i < count; i++) {
      // bigger clouds drift slower & sit higher (cheap parallax feel)
      const scale = Phaser.Math.FloatBetween(0.6, 1.5);
      const w = Math.round(110 * scale);
      const h = Math.round(46 * scale);
      const graphic = this.createCloudGraphic(w, h, Phaser.Math.FloatBetween(0.8, 1));
      const container = this.scene.add.container(
        Phaser.Math.Between(-120, cam.width),
        Phaser.Math.Between(10, Math.round(cam.height * 0.3)),
      );
      container.add(graphic);
      container.setDepth(CLOUD_DEPTH);
      container.setScrollFactor(0);
      const baseAlpha = Phaser.Math.FloatBetween(0.3, 0.6);
      container.setAlpha(baseAlpha);

      this.scene.tweens.add({
        targets: container,
        x: cam.width + 280,
        duration: Math.round(Phaser.Math.Between(42000, 95000) / scale),
        ease: "Linear",
        repeat: -1,
        onRepeat: () => {
          container.x = -280;
          container.y = Phaser.Math.Between(10, Math.round(this.scene.cameras.main.height * 0.3));
        },
      });
      this.scene.tweens.add({
        targets: container,
        alpha: { from: baseAlpha * 0.7, to: baseAlpha },
        duration: Phaser.Math.Between(4000, 9000),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.objects.push(container);
    }
  }

  private spawnFlock(): void {
    const cam = this.scene.cameras.main;
    const count = Phaser.Math.Between(2, 4);
    const dir = Phaser.Math.RND.pick([-1, 1]);
    const startX = dir === 1 ? -40 : cam.width + 40;
    const endX = dir === 1 ? cam.width + 60 : -60;
    const baseY = Phaser.Math.Between(30, Math.round(cam.height * 0.32));
    const dur = Phaser.Math.Between(7000, 12000);
    for (let i = 0; i < count; i++) {
      const g = this.scene.add.graphics().setScrollFactor(0).setDepth(BIRD_DEPTH);
      const draw = (flap: number) => {
        g.clear();
        g.lineStyle(2, 0x2a3550, 0.7);
        g.beginPath();
        g.moveTo(-7, 0);
        g.lineTo(0, -3 * flap);
        g.lineTo(7, 0);
        g.strokePath();
      };
      draw(1);
      g.setPosition(startX - dir * i * 18, baseY + i * 10);
      this.scene.tweens.add({ targets: g, x: endX - dir * i * 18, y: baseY + i * 10 - Phaser.Math.Between(0, 20), duration: dur, ease: "Sine.easeInOut", onComplete: () => g.destroy() });
      // wing flap
      this.scene.tweens.addCounter({ from: 0, to: 1, duration: 260, yoyo: true, repeat: Math.ceil(dur / 520), onUpdate: (tw) => draw(1 - (tw.getValue() ?? 0) * 1.6) });
    }
  }

  destroy(): void {
    this.birdTimer?.remove();
    this.objects.forEach((c) => c.destroy());
    this.objects = [];
  }
}
