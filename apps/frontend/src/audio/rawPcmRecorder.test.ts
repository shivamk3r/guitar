import { describe, expect, it } from "vitest";
import { encodePcm16Wav, floatToPcm16 } from "./rawPcmRecorder";

describe("raw pcm recorder encoding", () => {
  it("converts float samples to clipped signed 16-bit pcm", () => {
    expect(Array.from(floatToPcm16(new Float32Array([-2, -1, 0, 0.5, 1, 2])))).toEqual([
      -32768, -32768, 0, 16384, 32767, 32767,
    ]);
  });

  it("writes a playable pcm wav container", async () => {
    const blob = encodePcm16Wav([new Int16Array([0, 32767, -32768, 1024])], {
      channelCount: 2,
      sampleRate: 48000,
    });
    const buffer = await readBlobAsArrayBuffer(blob);
    const view = new DataView(buffer);

    expect(blob.type).toBe("audio/wav");
    expect(readAscii(view, 0, 4)).toBe("RIFF");
    expect(readAscii(view, 8, 4)).toBe("WAVE");
    expect(readAscii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(readAscii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
    expect(view.getInt16(50, true)).toBe(1024);
  });
});

function readAscii(view: DataView, offset: number, length: number): string {
  let text = "";
  for (let i = 0; i < length; i++) {
    text += String.fromCharCode(view.getUint8(offset + i));
  }
  return text;
}

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read blob"));
    reader.readAsArrayBuffer(blob);
  });
}
