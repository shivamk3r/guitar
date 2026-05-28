import {
  type AudioInputDevice,
  addAudioInputChangeListener,
  listAudioInputDevices,
} from "@/audio/devices";
import { getEngine, useEngineState } from "@/audio/useAudioEngine";
import { useSettings } from "@/storage/settings-store";
import { useEffect, useId, useMemo, useState } from "react";

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
  const activeInput = getEngine().activeInput;
  const visibleLabel =
    activeInput?.label ||
    selectedDevice?.label ||
    (settings.audioInputDeviceId ? "Selected mic" : "Browser default");

  async function handleChange(nextDeviceId: string) {
    const audioInputDeviceId = nextDeviceId || null;
    setError(null);
    try {
      await settings.update({ audioInputDeviceId });
      await getEngine().setInputDeviceId(audioInputDeviceId);
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
        {devices
          .filter((device) => device.deviceId && !device.isDefault)
          .map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
      </select>
      <div className="text-xs text-muted mt-1">
        Using: <span className="text-ink">{visibleLabel}</span>
      </div>
      {error && <div className="text-xs text-bad mt-1">{error}</div>}
    </div>
  );
}
