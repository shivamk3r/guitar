export interface AudioInputDevice {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

export function canEnumerateAudioInputs(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.enumerateDevices;
}

export async function listAudioInputDevices(): Promise<AudioInputDevice[]> {
  if (!canEnumerateAudioInputs()) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  let unnamed = 1;
  return devices
    .filter((device) => device.kind === "audioinput")
    .map((device) => {
      const isDefault = device.deviceId === "default";
      const label = device.label || (isDefault ? "Browser default" : `Microphone ${unnamed++}`);
      return { deviceId: device.deviceId, label, isDefault };
    });
}

export function addAudioInputChangeListener(listener: () => void): () => void {
  if (!canEnumerateAudioInputs()) return () => {};
  navigator.mediaDevices.addEventListener("devicechange", listener);
  return () => navigator.mediaDevices.removeEventListener("devicechange", listener);
}
