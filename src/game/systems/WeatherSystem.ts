import Phaser from "phaser";

// Weather + time-of-day atmosphere, all rendered in screen space
// (scrollFactor 0) so it covers the viewport at camera zoom 1 and survives
// Scale.RESIZE. Particle counts are intentionally small (well under the global
// budget) and emitters are reused, not recreated.

export type Weather = "clear" | "cloudy" | "rainy" | "foggy";
export type Phase = "morning" | "noon" | "evening" | "night";

const PHASE_TINT: Record<Phase, { color: number; alpha: number }> = {
  morning: { color: 0xffd9a0, alpha: 0.12 },
  noon: { color: 0xffffff, alpha: 0.0 },
  evening: { color: 0xff8c42, alpha: 0.2 },
  night: { color: 0x0b1130, alpha: 0.42 },
};

const PHASE_ORDER: Phase[] = ["morning", "noon", "evening", "night"];
const WEATHERS: Weather[] = ["clear", "cloudy", "rainy", "foggy"];

export class WeatherSystem {
  private scene: Phaser.Scene;
  private tint!: Phaser.GameObjects.Rectangle;
  private fog!: Phaser.GameObjects.Rectangle;
  private rain!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fireflies: Phaser.GameObjects.Image[] = [];

  private weather: Weather = "clear";
  private phase: Phase = "noon";
  private weatherTimer = 0;
  private phaseTimer = 0;
  private weatherInterval = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(): void {
    this.ensureTextures();
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;

    // time-of-day tint
    this.tint = this.scene.add
      .rectangle(0, 0, w, h, 0xffffff, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(5100);

    // fog overlay
    this.fog = this.scene.add
      .rectangle(0, 0, w, h, 0xeef3ff, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(5150);

    // rain (off until set)
    this.rain = this.scene.add
      .particles(0, -10, "fx_rain", {
        x: { min: 0, max: w },
        y: -10,
        lifespan: 750,
        speedY: { min: 520, max: 680 },
        speedX: { min: -140, max: -90 },
        scale: { min: 0.8, max: 1.2 },
        quantity: 2,
        frequency: 28,
        tint: 0xbcdcff,
        alpha: { start: 0.7, end: 0.2 },
        blendMode: Phaser.BlendModes.NORMAL,
      })
      .setScrollFactor(0)
      .setDepth(5200);
    this.rain.stop();

    // subtle always-on dust motes
    this.dust = this.scene.add
      .particles(0, 0, "fx_dot", {
        x: { min: 0, max: w },
        y: { min: 0, max: h },
        lifespan: 6000,
        speedY: { min: -6, max: 6 },
        speedX: { min: -10, max: 10 },
        scale: { min: 0.4, max: 1 },
        quantity: 1,
        frequency: 900,
        alpha: { start: 0.22, end: 0 },
        tint: 0xfff4c2,
      })
      .setScrollFactor(0)
      .setDepth(5050);

    // fireflies (shown at night)
    for (let i = 0; i < 12; i++) {
      const f = this.scene.add
        .image(Phaser.Math.Between(0, w), Phaser.Math.Between(h * 0.3, h), "fx_soft")
        .setScrollFactor(0)
        .setDepth(5120)
        .setScale(0.5)
        .setTint(0xfff07a)
        .setAlpha(0);
      this.fireflies.push(f);
      this.driftFirefly(f);
    }

    this.weatherInterval = Phaser.Math.Between(90000, 150000); // 3-5 min
    this.setWeather("clear", true);
    this.setPhase("noon", true);

    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private ensureTextures(): void {
    const t = this.scene.textures;
    if (!t.exists("fx_dot")) {
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillCircle(2, 2, 2);
      g.generateTexture("fx_dot", 4, 4);
      g.destroy();
    }
    if (!t.exists("fx_soft")) {
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 0.35).fillCircle(8, 8, 8);
      g.fillStyle(0xffffff, 0.9).fillCircle(8, 8, 3);
      g.generateTexture("fx_soft", 16, 16);
      g.destroy();
    }
    if (!t.exists("fx_rain")) {
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 12);
      g.generateTexture("fx_rain", 2, 12);
      g.destroy();
    }
    if (!t.exists("fx_cloud")) {
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 0.85).fillEllipse(110, 45, 200, 70);
      g.fillStyle(0xffffff, 0.85).fillEllipse(70, 35, 110, 55);
      g.fillStyle(0xffffff, 0.85).fillEllipse(150, 35, 110, 55);
      g.generateTexture("fx_cloud", 220, 90);
      g.destroy();
    }
    if (!t.exists("fx_leaf")) {
      const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x8fcf5a, 1).fillRect(0, 0, 6, 6);
      g.generateTexture("fx_leaf", 6, 6);
      g.destroy();
    }
  }

  private driftFirefly(f: Phaser.GameObjects.Image): void {
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    this.scene.tweens.add({
      targets: f,
      x: Phaser.Math.Between(0, w),
      y: Phaser.Math.Between(h * 0.25, h),
      duration: Phaser.Math.Between(4000, 8000),
      ease: "Sine.easeInOut",
      onComplete: () => this.driftFirefly(f),
    });
    this.scene.tweens.add({
      targets: f,
      alpha: this.phase === "night" ? Phaser.Math.FloatBetween(0.3, 0.9) : 0,
      duration: Phaser.Math.Between(600, 1400),
      yoyo: true,
      repeat: -1,
    });
  }

  setWeather(w: Weather, instant = false): void {
    this.weather = w;
    const d = instant ? 0 : 1500;

    // rain
    if (w === "rainy") this.rain.start();
    else this.rain.stop();

    // fog
    this.scene.tweens.add({ targets: this.fog, alpha: w === "foggy" ? 0.3 : 0, duration: d });
  }

  nextWeather(): void {
    let next = this.weather;
    while (next === this.weather) next = Phaser.Utils.Array.GetRandom(WEATHERS);
    this.setWeather(next);
  }

  setPhase(p: Phase, instant = false): void {
    this.phase = p;
    const { color, alpha } = PHASE_TINT[p];
    const d = instant ? 0 : 4000;
    this.tint.setFillStyle(color, this.tint.alpha); // keep current alpha; tween below
    this.scene.tweens.add({
      targets: this.tint,
      alpha,
      duration: d,
      onUpdate: () => this.tint.setFillStyle(color, this.tint.alpha),
    });
    // fireflies only glow at night
    this.fireflies.forEach((f) => this.driftFirefly(f));
  }

  nextPhase(): void {
    const idx = (PHASE_ORDER.indexOf(this.phase) + 1) % PHASE_ORDER.length;
    this.setPhase(PHASE_ORDER[idx]);
  }

  getWeather(): Weather {
    return this.weather;
  }

  getPhase(): Phase {
    return this.phase;
  }

  update(_time: number, delta: number): void {
    // weather rotation 3-5 min
    this.weatherTimer += delta;
    if (this.weatherTimer >= this.weatherInterval) {
      this.weatherTimer = 0;
      this.weatherInterval = Phaser.Math.Between(90000, 150000);
      this.nextWeather();
    }
    // time-of-day every 2 min (full day ~8 min)
    this.phaseTimer += delta;
    if (this.phaseTimer >= 80000) {
      this.phaseTimer = 0;
      this.nextPhase();
    }
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    const w = gameSize.width;
    const h = gameSize.height;
    this.tint.setSize(w, h);
    this.fog.setSize(w, h);
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
  }
}
