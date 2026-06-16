// Procedural chiptune background music via the Web Audio API — no audio files.
// A gentle looping arpeggio over an Am–F–C–G progression with a triangle bass
// and a soft hi-hat. Must be started from a user gesture (browser autoplay).

type Chord = { notes: number[]; root: number }; // semitones relative to A4

const A4 = 440;
const freq = (semis: number): number => A4 * Math.pow(2, semis / 12);

// Am – F – C – G (uplifting), each chord = 4 sixteenth-note steps.
const PROG: Chord[] = [
  { notes: [0, 3, 7], root: -12 }, // A minor (A C E)
  { notes: [-4, 0, 3], root: -16 }, // F major (F A C)
  { notes: [-9, -5, -2], root: -21 }, // C major (C E G)
  { notes: [-2, 2, 5], root: -14 }, // G major (G B D)
];

export class MusicSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private muted = false;
  private started = false;
  private readonly bpm = 104;
  private readonly volume = 0.16;

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
      this.master.connect(this.ctx.destination);
    }
    void this.ctx.resume();
    if (!this.started) {
      this.started = true;
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      this.scheduler();
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
    this.started = false;
  }

  private scheduler(): void {
    if (!this.ctx) return;
    const sixteenth = 60 / this.bpm / 4;
    while (this.nextNoteTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextNoteTime, sixteenth);
      this.nextNoteTime += sixteenth;
      this.step = (this.step + 1) % 16;
    }
    this.timer = window.setTimeout(() => this.scheduler(), 25);
  }

  private playStep(step: number, time: number, sixteenth: number): void {
    const chord = PROG[Math.floor(step / 4)];
    const arp = step % 4;

    // lead arpeggio (square), one octave up, with a little sparkle on the 4th
    const leadSemi = chord.notes[arp % chord.notes.length] + 12 + (arp === 3 ? 12 : 0);
    this.tone(freq(leadSemi), time, sixteenth * 1.7, "square", 0.22);

    // bass on each chord change
    if (arp === 0) this.tone(freq(chord.root), time, sixteenth * 3.4, "triangle", 0.5);

    // soft hi-hat on off-beats
    if (arp === 1 || arp === 3) this.hat(time, 0.03);
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
    g.gain.value = 0.06;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    src.start(time);
    src.stop(time + dur);
  }
}
