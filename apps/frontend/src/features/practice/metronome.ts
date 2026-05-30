/**
 * Metronome: visual beats + optional audible clicks.
 *
 * Beat scheduling uses `AudioContext.currentTime` for accuracy — the visual tick
 * is driven by requestAnimationFrame but uses the scheduled beat time as the
 * source of truth so it doesn't drift.
 */

export type MetronomeMode = "normal" | "accented" | "silent-bars" | "groove";

export interface MetronomeOptions {
  bpm: number;
  audible: boolean;
  mode?: MetronomeMode;
  volume: number;
  onBeat: (info: { beat: number; tAudio: number }) => void;
}

export class Metronome {
  private rafId: number | null = null;
  private scheduleTimer: number | null = null;
  private ctx: AudioContext | null = null;
  private clickGain: GainNode | null = null;
  private running = false;
  private startTime = 0;
  private nextBeatNumber = 0;
  private nextBeatTime = 0;
  private lastEmitted = -1;

  constructor(private options: MetronomeOptions) {}

  setOptions(patch: Partial<MetronomeOptions>): void {
    this.options = { ...this.options, ...patch };
    if (this.clickGain) this.clickGain.gain.value = this.options.audible ? this.options.volume : 0;
  }

  start(ctx: AudioContext): void {
    if (this.running) return;
    this.ctx = ctx;
    this.clickGain = ctx.createGain();
    this.clickGain.gain.value = this.options.audible ? this.options.volume : 0;
    this.clickGain.connect(ctx.destination);
    this.running = true;
    this.startTime = ctx.currentTime + 0.1;
    this.nextBeatNumber = 0;
    this.nextBeatTime = this.startTime;
    this.lastEmitted = -1;
    this.scheduleLoop();
    this.animateLoop();
  }

  stop(): void {
    this.running = false;
    if (this.scheduleTimer !== null) {
      window.clearTimeout(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.clickGain) {
      this.clickGain.disconnect();
      this.clickGain = null;
    }
    this.ctx = null;
  }

  /** Convert an AudioContext time to the nearest beat number and delta (ms). */
  beatAt(tAudio: number): { beat: number; deltaMs: number } | null {
    if (!this.running) return null;
    const secondsPerBeat = 60 / this.options.bpm;
    const rel = tAudio - this.startTime;
    const beat = Math.round(rel / secondsPerBeat);
    const target = this.startTime + beat * secondsPerBeat;
    return { beat, deltaMs: (tAudio - target) * 1000 };
  }

  get isRunning(): boolean {
    return this.running;
  }

  get startedAtAudioTime(): number | null {
    return this.running ? this.startTime : null;
  }

  private scheduleLoop = () => {
    if (!this.running || !this.ctx) return;
    const lookAhead = 0.2; // schedule 200ms ahead
    while (this.nextBeatTime < this.ctx.currentTime + lookAhead) {
      if (this.options.audible && this.clickGain && this.shouldClick(this.nextBeatNumber)) {
        this.scheduleClick(this.nextBeatTime, this.isAccent(this.nextBeatNumber));
        if (this.options.mode === "groove") {
          this.scheduleClick(this.nextBeatTime + 30 / this.options.bpm, false, 0.45);
        }
      }
      this.nextBeatNumber++;
      this.nextBeatTime += 60 / this.options.bpm;
    }
    this.scheduleTimer = window.setTimeout(this.scheduleLoop, 25);
  };

  private shouldClick(beat: number): boolean {
    if (this.options.mode !== "silent-bars") return true;
    return Math.floor(beat / 4) % 4 !== 3;
  }

  private isAccent(beat: number): boolean {
    return this.options.mode !== "normal" && beat % 4 === 0;
  }

  private scheduleClick(time: number, isDownbeat: boolean, level = 1): void {
    if (!this.ctx || !this.clickGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = isDownbeat ? 1200 : 800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(level, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    osc.connect(g).connect(this.clickGain);
    osc.start(time);
    osc.stop(time + 0.07);
  }

  private animateLoop = () => {
    if (!this.running || !this.ctx) return;
    const now = this.ctx.currentTime;
    const secondsPerBeat = 60 / this.options.bpm;
    const beat = Math.floor((now - this.startTime) / secondsPerBeat);
    if (beat > this.lastEmitted && beat >= 0) {
      this.lastEmitted = beat;
      const tAudio = this.startTime + beat * secondsPerBeat;
      try {
        this.options.onBeat({ beat, tAudio });
      } catch (err) {
        console.error("metronome onBeat threw", err);
      }
    }
    this.rafId = requestAnimationFrame(this.animateLoop);
  };
}
