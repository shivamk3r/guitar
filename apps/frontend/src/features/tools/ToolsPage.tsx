import {
  type CalibrationResult,
  calibrationGuidance,
  calibrationQualityLabel,
  runCalibration,
} from "@/audio/calibration";
import type { AudioEngine } from "@/audio/engine";
import { ensureEngineStarted, useEngineState } from "@/audio/useAudioEngine";
import { useSettings } from "@/storage/settings-store";
import { Button } from "@/ui/Button";
import { clsx } from "@/ui/clsx";
import { useState } from "react";
import { Link } from "react-router-dom";

const TOOLS = [
  {
    title: "Tuner",
    body: "Tune standard or alternate tunings with pitch trace and local session metadata.",
    to: "/tools/tuner",
  },
  {
    title: "Chord library",
    body: "Open shapes, reference audio, chord checks, and per-string feedback.",
    to: "/chords",
  },
  {
    title: "Audio input",
    body: "Use the floating input control to choose a microphone or interface before practice.",
    to: "/settings",
  },
  {
    title: "History review",
    body: "Replay consented recordings, inspect backend analysis, and download local audio.",
    to: "/history",
  },
];

export function ToolsPage() {
  return (
    <section className="space-y-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Tools</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Fast utilities for tuning, checking chord shapes, managing input, and reviewing takes.
        </p>
      </header>

      <AudioCalibrationPanel />

      <div className="grid gap-4 md:grid-cols-2">
        {TOOLS.map((tool) => (
          <Link
            key={tool.title}
            to={tool.to}
            className="rounded-lg border border-white/5 bg-panel p-4 transition-colors hover:border-white/15"
          >
            <h2 className="text-lg font-semibold">{tool.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{tool.body}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function AudioCalibrationPanel() {
  const settings = useSettings();
  const engineState = useEngineState();
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastQuality = settings.lastCalibrationQuality;
  const busy = calibrating || engineState === "starting" || engineState === "stopping";

  async function calibrate() {
    setCalibrating(true);
    setError(null);
    const engineWasRunning = engineState === "running";
    let engine: AudioEngine | null = null;
    try {
      engine = await ensureEngineStarted();
      const nextResult = await runCalibration(engine);
      setResult(nextResult);
      await settings.update({ lastCalibrationQuality: nextResult.quality });
    } catch (err) {
      console.error("audio calibration failed", err);
      setError(err instanceof Error ? err.message : "Could not calibrate audio input.");
    } finally {
      if (engine && !engineWasRunning) await engine.stop().catch(console.error);
      setCalibrating(false);
    }
  }

  return (
    <section className="rounded-lg border border-white/5 bg-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Audio calibration</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Check signal level and browser latency before scored practice.
          </p>
        </div>
        <Button onClick={calibrate} disabled={busy}>
          {calibrating ? "Listening..." : "Run calibration"}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <CalibrationMetric
          label="Saved"
          value={lastQuality ? calibrationQualityLabel(lastQuality) : "Not run"}
          tone={lastQuality}
        />
        <CalibrationMetric
          label="Peak"
          value={result ? `${Math.round(result.peak * 100)}%` : "-"}
          tone={result?.quality ?? lastQuality}
        />
        <CalibrationMetric
          label="Latency"
          value={result?.latencyMs == null ? "-" : `${result.latencyMs} ms`}
          tone={result?.quality ?? lastQuality}
        />
      </div>

      {result && <p className="mt-3 text-sm text-muted">{calibrationGuidance(result)}</p>}
      {error && (
        <div className="mt-3 text-sm text-bad" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

function CalibrationMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: string | null | undefined;
  value: string;
}) {
  return (
    <div className="rounded-md border border-white/10 p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div
        className={clsx(
          "mt-1 text-lg font-semibold tabular-nums",
          tone === "good" && "text-accent",
          (tone === "quiet" || tone === "silent") && "text-warn",
          tone === "clipping" && "text-bad",
        )}
      >
        {value}
      </div>
    </div>
  );
}
