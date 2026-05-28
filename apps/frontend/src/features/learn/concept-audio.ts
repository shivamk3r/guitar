import type { GlossaryAudioExample } from "@/data/glossary";
import { midiToHz } from "@/lib/math";

const NOTE_LEVEL = 0.35;

export async function playGlossaryExample(example: GlossaryAudioExample): Promise<void> {
  const ctx = createAudioContext();
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const out = ctx.createGain();
    out.gain.value = 0.35;
    out.connect(ctx.destination);

    const startTime = ctx.currentTime + 0.04;
    const endTime = scheduleExample(ctx, out, startTime, example);
    await sleep(Math.max(0, endTime - ctx.currentTime + 0.08) * 1000);
  } finally {
    await ctx.close();
  }
}

function createAudioContext(): AudioContext {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("Web Audio is not available in this browser.");
  }
  return new AudioContextConstructor();
}

function scheduleExample(
  ctx: AudioContext,
  out: AudioNode,
  startTime: number,
  example: GlossaryAudioExample,
): number {
  if (example.kind === "notes") {
    const noteSeconds = example.noteSeconds ?? 0.72;
    const gapSeconds = example.gapSeconds ?? 0.12;
    example.midi.forEach((midi, index) => {
      const cents = example.cents?.[index] ?? 0;
      const t = startTime + index * (noteSeconds + gapSeconds);
      scheduleTone(ctx, out, midi, t, noteSeconds, cents);
    });
    return startTime + example.midi.length * (noteSeconds + gapSeconds);
  }

  if (example.kind === "strum") {
    example.midi.forEach((midi, index) => {
      schedulePluckedString(ctx, out, midi, startTime + index * 0.028, 1.25);
    });
    return startTime + 1.45;
  }

  if (example.kind === "metronome") {
    const step = 60 / example.bpm;
    for (let beat = 0; beat < example.beats; beat++) {
      const accented = Boolean(example.accentFirst && beat % 4 === 0);
      scheduleClick(ctx, out, startTime + beat * step, accented);
    }
    return startTime + example.beats * step + 0.12;
  }

  const eighth = 60 / example.bpm / 2;
  example.pattern.forEach((on, index) => {
    if (!on) return;
    scheduleClick(ctx, out, startTime + index * eighth, index % 4 === 0);
  });
  return startTime + example.pattern.length * eighth + 0.12;
}

function scheduleTone(
  ctx: AudioContext,
  out: AudioNode,
  midi: number,
  startTime: number,
  duration: number,
  cents = 0,
): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = midiToHz(midi) * 2 ** (cents / 1200);
  env.gain.setValueAtTime(0.0001, startTime);
  env.gain.exponentialRampToValueAtTime(NOTE_LEVEL, startTime + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(env).connect(out);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

function schedulePluckedString(
  ctx: AudioContext,
  out: AudioNode,
  midi: number,
  startTime: number,
  duration: number,
): void {
  for (const [partial, level] of [
    [1, 0.6],
    [2, 0.22],
    [3, 0.1],
  ] as const) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = midiToHz(midi) * partial;
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.exponentialRampToValueAtTime(level, startTime + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(env).connect(out);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }
}

function scheduleClick(
  ctx: AudioContext,
  out: AudioNode,
  startTime: number,
  accented: boolean,
): void {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = accented ? 1400 : 920;
  env.gain.setValueAtTime(0.0001, startTime);
  env.gain.exponentialRampToValueAtTime(accented ? 0.5 : 0.32, startTime + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.06);
  osc.connect(env).connect(out);
  osc.start(startTime);
  osc.stop(startTime + 0.07);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
