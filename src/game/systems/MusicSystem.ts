// Procedural lo-fi background music via the Web Audio API — no audio files.
// A slow, mellow arpeggio over warm maj7/min7 chords with a sine bass, a soft
// sustained pad, and a gentle hat — run through a lowpass filter for that chill
// lo-fi warmth. Must be started from a user gesture (browser autoplay).

type Chord = { notes: number[]; root: number }; // semitones relative to A4

const A4 = 440;
const freq = (semis: number): number => A4 * Math.pow(2, semis / 12);

// Warm, chilled progression: Am7 – Fmaj7 – Cmaj7 – G7. Each chord lasts 8
// sixteenth-steps (a slow 32-step loop) so it breathes instead of rushing.
const PROG: Chord[] = [
  { notes: [0, 3, 7, 10], root: -24 }, // Am7  (A C E G)
  { notes: [-4, 0, 3, 7], root: -28 }, // Fmaj7 (F A C E)
  { notes: [-9, -5, -2, 2], root: -33 }, // Cmaj7 (C E G B)
  { notes: [-2, 2, 5, 8], root: -26 }, // G7   (G B D F)
];

export class MusicSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lp: BiquadFilterNode | null = null;
  private timer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private muted = false;
  private started = false;
  private readonly bpm = 64; // slower, warmer lo-fi
  private readonly volume = 0.14;

  /** Start (or resume) playback. Call from a user gesture. */
  start(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      // a gentle lowpass rolls off the highs for a soft, warm lo-fi tone
      this.lp = this.ctx.createBiquadFilter();
      this.lp.type = "lowpass";
      this.lp.frequency.value = 1550;
      this.lp.Q.value = 0.65;
      this.master.connect(this.lp);
      this.lp.connect(this.ctx.destination);
    }
    void this.ctx.resume();
    if (!this.started) {
      this.started = true;
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      this.scheduler();
    }
  }

  /** Short UI sound effects (tap to move, etc.). */
  playSfx(name: string): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    if (name === "tap") {
      this.tone(720, now, 0.07, "square", 0.16);
      this.tone(1080, now + 0.035, 0.09, "square", 0.13);
    } else if (name === "talk") {
      this.tone(520, now, 0.06, "triangle", 0.18);
      this.tone(780, now + 0.05, 0.08, "triangle", 0.15);
    } else if (name === "success") {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, now + i * 0.07, 0.12, "square", 0.16));
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  destroy(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.lp = null;
    this.started = false;
  }

  private scheduler(): void {
    if (!this.ctx) return;
    const sixteenth = 60 / this.bpm / 4;
    while (this.nextNoteTime < this.ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextNoteTime, sixteenth);
      this.nextNoteTime += sixteenth;
      this.step = (this.step + 1) % 32; // 4 chords × 8 steps
    }
    this.timer = window.setTimeout(() => this.scheduler(), 30);
  }

  private playStep(step: number, time: number, sixteenth: number): void {
    const chord = PROG[Math.floor(step / 8)];
    const arp = step % 8;

    // mellow arpeggio (triangle) on the eighth-notes only — sparse + soft
    if (arp % 2 === 0) {
      const idx = (arp / 2) % chord.notes.length;
      const leadSemi = chord.notes[idx] + 12;
      // notes overlap a little (long release) so the line feels smooth, not plucky
      this.tone(freq(leadSemi), time, sixteenth * 3.4, "triangle", 0.08);
    }

    // a soft swung grace note near the end of the bar for a lo-fi lilt
    if (arp === 6) this.tone(freq(chord.notes[chord.notes.length - 1] + 24), time, sixteenth * 2.2, "sine", 0.035);

    // warm sine bass + a sustained pad chord on each chord change
    if (arp === 0) {
      this.tone(freq(chord.root), time, sixteenth * 7.5, "sine", 0.32);
      for (const n of chord.notes) this.tone(freq(n), time, sixteenth * 7.5, "sine", 0.04);
    }

    // one soft, airy hat per chord (very light)
    if (arp === 4) this.hat(time, 0.02);
  }

  private tone(f: number, time: number, dur: number, type: OscillatorType, peak: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(time);
    osc.stop(time + dur + 0.03);
  }

  private hat(time: number, dur: number): void {
    if (!this.ctx || !this.master) return;
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = 0.018;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7600;
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    src.start(time);
    src.stop(time + dur);
  }
}
