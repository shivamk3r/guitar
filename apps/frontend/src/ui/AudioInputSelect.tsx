import {
  type AudioInputDevice,
  addAudioInputChangeListener,
  listAudioInputDevices,
} from "@/audio/devices";
import { normalizeInputLevel } from "@/audio/level";
import { getEngine, useEngineState } from "@/audio/useAudioEngine";
import { useSettings } from "@/storage/settings-store";
import { useEffect, useId, useMemo, useState } from "react";

const LEVEL_UPDATE_INTERVAL_MS = 80;

interface Props {
  disabled?: boolean;
  className?: string;
}

export function AudioInputSelect({ disabled = false, className }: Props) {
  const id = useId();
  const engineState = useEngineState();
  const settings = useSettings();
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const isAudioActive = engineState === "running";
  const level = useInputLevel(isAudioActive);
  const isSwitchingDisabled =
    disabled ||
    engineState === "running" ||
    engineState === "starting" ||
    engineState === "stopping";

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const nextDevices = await listAudioInputDevices();
        if (!cancelled) setDevices(nextDevices);
      } catch (err) {
        if (!cancelled) {
          console.error("audio input enumeration failed", err);
          setError(err instanceof Error ? err.message : "Could not list microphones.");
        }
      }
    }
    refresh();
    const removeListener = addAudioInputChangeListener(refresh);
    return () => {
      cancelled = true;
      removeListener();
    };
  }, []);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.deviceId === settings.audioInputDeviceId),
    [devices, settings.audioInputDeviceId],
  );
  const engine = getEngine();
  const activeInput = engine.activeInput;
  const fallback = engine.inputFallback;
  const hasEnumeratedDeviceIds = devices.some((device) => device.deviceId && !device.isDefault);
  const selectedDeviceMissing = Boolean(
    settings.audioInputDeviceId && !selectedDevice && hasEnumeratedDeviceIds,
  );
  const visibleLabel = isAudioActive
    ? activeInput?.label || (fallback ? "Browser default" : selectedDevice?.label) || "Microphone"
    : selectedDevice?.label ||
      (settings.audioInputDeviceId ? "Preferred microphone" : "Browser default");
  const statusPrefix = isAudioActive ? "Using" : "Selected";
  const notice = fallback
    ? isAudioActive
      ? "Selected microphone is unavailable. Using browser default."
      : "Selected microphone was unavailable, so the browser default was used."
    : selectedDeviceMissing
      ? "Preferred microphone is not currently listed. The browser default will be used if it cannot be opened."
      : null;

  async function handleChange(nextDeviceId: string) {
    const audioInputDeviceId = nextDeviceId || null;
    setError(null);
    if (isSwitchingDisabled) {
      setError("Stop listening before switching microphones.");
      return;
    }
    try {
      await settings.update({ audioInputDeviceId });
      await engine.setInputDeviceId(audioInputDeviceId);
    } catch (err) {
      console.error("microphone switch failed", err);
      setError(err instanceof Error ? err.message : "Could not switch microphone.");
    }
  }

  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm text-muted block mb-1">
        Microphone
      </label>
      <select
        id={id}
        className="bg-panel border border-white/10 rounded px-2 py-1 text-ink max-w-full"
        value={settings.audioInputDeviceId ?? ""}
        onChange={(event) => handleChange(event.target.value)}
        disabled={isSwitchingDisabled}
      >
        <option value="">Browser default</option>
        {settings.audioInputDeviceId && !selectedDevice && (
          <option value={settings.audioInputDeviceId} disabled>
            Preferred microphone
          </option>
        )}
        {devices
          .filter((device) => device.deviceId && !device.isDefault)
          .map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
      </select>
      <div className="text-xs text-muted mt-1">
        {statusPrefix}: <span className="text-ink">{visibleLabel}</span>
      </div>
      {isAudioActive && <InputLevelMeter level={level} />}
      {notice && <output className="mt-1 block max-w-xs text-xs text-warn">{notice}</output>}
      {error && (
        <div className="text-xs text-bad mt-1" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function InputLevelMeter({ level }: { level: number }) {
  const percent = Math.round(level * 100);
  return (
    <div className="mt-2 w-44 max-w-full">
      <div
        aria-label="Input level"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-white/10"
        role="meter"
      >
        <div
          className="h-full bg-accent transition-[width] duration-75"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function useInputLevel(enabled: boolean): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLevel(0);
      return;
    }

    let lastUpdate = Number.NEGATIVE_INFINITY;
    const unsubscribe = getEngine().on("level", (event) => {
      const now = performance.now();
      if (now - lastUpdate < LEVEL_UPDATE_INTERVAL_MS) return;
      lastUpdate = now;
      setLevel(normalizeInputLevel(event));
    });
    return unsubscribe;
  }, [enabled]);

  return level;
}
