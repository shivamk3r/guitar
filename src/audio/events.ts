export type PitchEvent = {
  type: "pitch";
  hz: number;
  cents: number;
  confidence: number;
  rms: number;
  t: number;
};

export type OnsetEvent = {
  type: "onset";
  strength: number;
  t: number;
};

export type ChromaEvent = {
  type: "chroma";
  chroma: Float32Array;
  rms: number;
  t: number;
};

export type LevelEvent = {
  type: "level";
  rms: number;
  peak: number;
  t: number;
};

export type AudioEvent = PitchEvent | OnsetEvent | ChromaEvent | LevelEvent;
export type AudioEventType = AudioEvent["type"];

export type AudioEventMap = {
  pitch: PitchEvent;
  onset: OnsetEvent;
  chroma: ChromaEvent;
  level: LevelEvent;
};
