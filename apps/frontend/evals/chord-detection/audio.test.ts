import { describe, expect, it } from "vitest";
import { decodeWavBuffer } from "./audio";

describe("decodeWavBuffer", () => {
  it("decodes and downmixes 16-bit PCM WAV audio", () => {
    const wav = makeStereo16BitWav({
      sampleRate: 8000,
      frames: [
        [0, 32767],
        [-32768, 0],
      ],
    });

    const decoded = decodeWavBuffer(wav);

    expect(decoded.sampleRate).toBe(8000);
    expect(decoded.samples).toHaveLength(2);
    expect(decoded.samples[0]).toBeCloseTo(0.5, 2);
    expect(decoded.samples[1]).toBeCloseTo(-0.5, 2);
  });
});

function makeStereo16BitWav(input: {
  sampleRate: number;
  frames: Array<[number, number]>;
}): Buffer {
  const channels = 2;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = input.frames.length * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(input.sampleRate, 24);
  buffer.writeUInt32LE(input.sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  let offset = 44;
  for (const [left, right] of input.frames) {
    buffer.writeInt16LE(left, offset);
    buffer.writeInt16LE(right, offset + 2);
    offset += blockAlign;
  }
  return buffer;
}
