const RAW_RECORDER_WORKLET_URL = "/raw-recorder.worklet.js";
const WAV_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;
const WAV_MIME_TYPE = "audio/wav";

interface RawPcmRecorderInput {
  ctx: AudioContext;
  mediaStream: MediaStream;
}

export interface RawPcmRecorder {
  stop(): Promise<Blob>;
}

interface ChunkMessage {
  type: "chunk";
  samples: Float32Array;
  channelCount: number;
  frameCount: number;
}

interface StoppedMessage {
  type: "stopped";
}

type RecorderMessage = ChunkMessage | StoppedMessage;

export async function startRawPcmRecorder(input: RawPcmRecorderInput): Promise<RawPcmRecorder> {
  if (!input.ctx.audioWorklet || typeof AudioWorkletNode === "undefined") {
    throw new Error("AudioWorklet recording is not supported in this browser.");
  }

  await input.ctx.audioWorklet.addModule(RAW_RECORDER_WORKLET_URL);

  const source = input.ctx.createMediaStreamSource(input.mediaStream);
  const recorder = new AudioWorkletNode(input.ctx, "raw-pcm-recorder", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  const sinkGain = input.ctx.createGain();
  sinkGain.gain.value = 0;

  const chunks: Int16Array[] = [];
  let channelCount = Math.max(
    1,
    input.mediaStream.getAudioTracks()[0]?.getSettings().channelCount ?? 1,
  );
  let stopPromise: Promise<Blob> | null = null;
  let resolveStop: ((blob: Blob) => void) | null = null;
  let finalized = false;

  recorder.port.onmessage = (event: MessageEvent<RecorderMessage>) => {
    const message = event.data;
    if (message.type === "chunk" && message.frameCount > 0) {
      channelCount = Math.max(1, message.channelCount);
      chunks.push(floatToPcm16(message.samples));
      return;
    }
    if (message.type === "stopped") {
      finalize();
    }
  };

  source.connect(recorder);
  recorder.connect(sinkGain);
  sinkGain.connect(input.ctx.destination);

  function cleanup(): void {
    source.disconnect();
    recorder.disconnect();
    sinkGain.disconnect();
  }

  function finalize(): void {
    if (finalized) return;
    finalized = true;
    cleanup();
    resolveStop?.(
      encodePcm16Wav(chunks, {
        channelCount,
        sampleRate: input.ctx.sampleRate,
      }),
    );
  }

  return {
    stop() {
      if (!stopPromise) {
        stopPromise = new Promise((resolve) => {
          resolveStop = resolve;
          recorder.port.postMessage({ type: "stop" });
        });
      }
      return stopPromise;
    },
  };
}

export function floatToPcm16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    pcm[i] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return pcm;
}

export function encodePcm16Wav(
  chunks: readonly Int16Array[],
  options: { sampleRate: number; channelCount: number },
): Blob {
  const channelCount = Math.max(1, options.channelCount);
  const dataBytes = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, options.sampleRate, true);
  view.setUint32(28, options.sampleRate * channelCount * BYTES_PER_SAMPLE, true);
  view.setUint16(32, channelCount * BYTES_PER_SAMPLE, true);
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  const pcm = new Int16Array(buffer, WAV_HEADER_BYTES);
  let offset = 0;
  for (const chunk of chunks) {
    pcm.set(chunk, offset);
    offset += chunk.length;
  }

  return new Blob([buffer], { type: WAV_MIME_TYPE });
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
