import Phaser from "phaser";

// Smooth drifting clouds, created ONCE (never re-created in update()).
// Rendered in screen space (scrollFactor 0) above the world but below the
// day/night tint and HUD. Each cloud is a soft multi-ellipse graphic in a
// container that tweens left-to-right and gently breathes its alpha.

const CLOUD_DEPTH = 5000;

export class CloudSystem {
  private clouds: Phaser.GameObjects.Container[] = [];
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.spawnClouds(5);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private createCloudGraphic(width: number, height: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.fillStyle(0xffffff, 0.6);
    g.fillEllipse(0, 0, width, height);
    g.fillStyle(0xffffff, 0.5);
    g.fillEllipse(-width * 0.28, -height * 0.2, width * 0.55, height * 0.75);
    g.fillEllipse(width * 0.22, -height * 0.18, width * 0.5, height * 0.7);
    g.fillStyle(0xffffff, 0.45);
    g.fillEllipse(-width * 0.05, -height * 0.38, width * 0.42, height * 0.65);
    return g;
  }

  private spawnClouds(count: number): void {
    const cam = this.scene.cameras.main;
    for (let i = 0; i < count; i++) {
      const w = Phaser.Math.Between(90, 180);
      const h = Phaser.Math.Between(32, 58);

      const graphic = this.createCloudGraphic(w, h);
      const container = this.scene.add.container(
        Phaser.Math.Between(-100, cam.width),
        Phaser.Math.Between(15, cam.height * 0.22),
      );
      container.add(graphic);
      container.setDepth(CLOUD_DEPTH);
      container.setScrollFactor(0);
      const baseAlpha = Phaser.Math.FloatBetween(0.35, 0.6);
      container.setAlpha(baseAlpha);

      this.scene.tweens.add({
        targets: container,
        x: cam.width + 250,
        duration: Phaser.Math.Between(50000, 90000),
        ease: "Linear",
        repeat: -1,
        onRepeat: () => {
          container.x = -250;
          container.y = Phaser.Math.Between(15, this.scene.cameras.main.height * 0.22);
        },
      });

      this.scene.tweens.add({
        targets: container,
        alpha: { from: baseAlpha * 0.7, to: baseAlpha },
        duration: Phaser.Math.Between(4000, 8000),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      this.clouds.push(container);
    }
  }

  destroy(): void {
    this.clouds.forEach((c) => c.destroy());
    this.clouds = [];
  }
}
