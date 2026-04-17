import type { ChordDef } from "@/data/chords";
import { midiToHz } from "@/lib/math";

/**
 * Strum a chord using Web Audio synthesis.
 *
 * A real library of recorded strums would sound much better than this, but we can't
 * ship guitar samples for 17 chords in v1. The synthesised version is "clearly a
 * chord", which is enough for beginners to check what they're aiming at.
 */
export async function playChordReference(chord: ChordDef): Promise<void> {
  const ctx = new AudioContext();
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const out = ctx.createGain();
    out.gain.value = 0.35;
    out.connect(ctx.destination);

    const startTime = ctx.currentTime;
    const strumDuration = 0.12; // ms between strings

    chord.playedMidi.forEach((midi, i) => {
      if (midi == null) return;
      const hz = midiToHz(midi);
      const t = startTime + i * (strumDuration / 6);
      // Fundamental + two harmonics, plucked-like envelope.
      for (const [partial, level] of [
        [1, 0.6],
        [2, 0.25],
        [3, 0.1],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = hz * partial;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(level * 0.5, t + 0.01);
        env.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
        osc.connect(env).connect(out);
        osc.start(t);
        osc.stop(t + 1.4);
      }
    });
    // Let the sound finish before closing the context
    await new Promise((r) => setTimeout(r, 1500));
  } finally {
    await ctx.close();
  }
}
