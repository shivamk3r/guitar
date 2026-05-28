/* global AudioWorkletProcessor, registerProcessor */

const CHUNK_FRAMES = 4096;

class RawPcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = true;
    this.channelCount = 1;
    this.buffer = new Float32Array(CHUNK_FRAMES);
    this.offsetFrames = 0;

    this.port.onmessage = (event) => {
      if (event.data?.type === "stop") {
        this.recording = false;
        this.flush();
        this.port.postMessage({ type: "stopped" });
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (output) {
      for (const channel of output) channel.fill(0);
    }

    if (!this.recording) return false;

    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;

    const frameCount = input[0].length;
    const channelCount = input.length;
    if (channelCount !== this.channelCount) {
      this.flush();
      this.channelCount = channelCount;
      this.buffer = new Float32Array(CHUNK_FRAMES * this.channelCount);
    }

    for (let frame = 0; frame < frameCount; frame++) {
      for (let channel = 0; channel < this.channelCount; channel++) {
        this.buffer[this.offsetFrames * this.channelCount + channel] = input[channel]?.[frame] ?? 0;
      }
      this.offsetFrames += 1;
      if (this.offsetFrames >= CHUNK_FRAMES) this.flush();
    }

    return true;
  }

  flush() {
    if (this.offsetFrames === 0) return;

    const sampleCount = this.offsetFrames * this.channelCount;
    const samples = this.buffer.slice(0, sampleCount);
    this.port.postMessage(
      {
        type: "chunk",
        samples,
        channelCount: this.channelCount,
        frameCount: this.offsetFrames,
      },
      [samples.buffer],
    );
    this.offsetFrames = 0;
  }
}

registerProcessor("raw-pcm-recorder", RawPcmRecorderProcessor);
