import { DEFAULT_SETTINGS } from "@/storage/db";
import { useSettings } from "@/storage/settings-store";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioInputSelect } from "./AudioInputSelect";

const devicesMock = vi.hoisted(() => ({
  devices: [] as Array<{ deviceId: string; label: string; isDefault: boolean }>,
  listAudioInputDevices: vi.fn(),
  listeners: new Set<() => void>(),
}));

const engineMock = vi.hoisted(() => {
  type LevelHandler = (event: { type: "level"; rms: number; peak: number; t: number }) => void;
  const levelHandlers = new Set<LevelHandler>();
  return {
    state: "idle" as "idle" | "starting" | "running" | "stopping" | "error",
    activeInput: null as { deviceId: string | null; label: string } | null,
    inputFallback: null as { requestedDeviceId: string; reason: "unavailable" } | null,
    setInputDeviceId: vi.fn(async () => {}),
    on: vi.fn((type: string, handler: LevelHandler) => {
      if (type === "level") levelHandlers.add(handler);
      return () => levelHandlers.delete(handler);
    }),
    emitLevel(event: { rms: number; peak: number; t: number }) {
      for (const handler of levelHandlers) handler({ type: "level", ...event });
    },
    reset() {
      this.state = "idle";
      this.activeInput = null;
      this.inputFallback = null;
      this.setInputDeviceId.mockClear();
      this.on.mockClear();
      levelHandlers.clear();
    },
  };
});

vi.mock("@/audio/devices", () => ({
  listAudioInputDevices: devicesMock.listAudioInputDevices,
  addAudioInputChangeListener: vi.fn((listener: () => void) => {
    devicesMock.listeners.add(listener);
    return () => devicesMock.listeners.delete(listener);
  }),
}));

vi.mock("@/audio/useAudioEngine", () => ({
  getEngine: () => ({
    setInputDeviceId: engineMock.setInputDeviceId,
    on: engineMock.on,
    get activeInput() {
      return engineMock.activeInput;
    },
    get inputFallback() {
      return engineMock.inputFallback;
    },
  }),
  useEngineState: () => engineMock.state,
}));

describe("AudioInputSelect", () => {
  beforeEach(() => {
    engineMock.reset();
    devicesMock.devices = [
      { deviceId: "default", label: "Browser default", isDefault: true },
      { deviceId: "usb-1", label: "USB Interface", isDefault: false },
    ];
    devicesMock.listAudioInputDevices.mockImplementation(async () => devicesMock.devices);
    useSettings.setState({
      ...DEFAULT_SETTINGS,
      hydrated: true,
      async hydrate() {},
      async update(patch: Partial<typeof DEFAULT_SETTINGS>) {
        useSettings.setState(patch);
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists audio inputs and remembers the selected microphone locally", async () => {
    const user = userEvent.setup();
    render(<AudioInputSelect />);

    await screen.findByRole("option", { name: "USB Interface" });
    await user.selectOptions(screen.getByLabelText("Microphone"), "usb-1");

    await waitFor(() => {
      expect(useSettings.getState().audioInputDeviceId).toBe("usb-1");
    });
    expect(engineMock.setInputDeviceId).toHaveBeenCalledWith("usb-1");
    expect(screen.getByLabelText("Microphone")).toHaveValue("usb-1");
  });

  it("disables switching and shows the active input level while audio is running", async () => {
    engineMock.state = "running";
    engineMock.activeInput = { deviceId: "default-1", label: "Built-in Microphone" };
    render(<AudioInputSelect />);

    expect(screen.getByLabelText("Microphone")).toBeDisabled();
    expect(screen.getByText("Built-in Microphone")).toBeInTheDocument();

    act(() => {
      engineMock.emitLevel({ rms: 0.04, peak: 0.2, t: 1 });
    });

    await waitFor(() => {
      const meter = screen.getByRole("meter", { name: "Input level" });
      expect(Number(meter.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
    });
  });

  it("tells the learner when the selected microphone falls back to browser default", async () => {
    engineMock.state = "running";
    engineMock.activeInput = { deviceId: "default-1", label: "Built-in Microphone" };
    engineMock.inputFallback = { requestedDeviceId: "missing-device", reason: "unavailable" };
    useSettings.setState({ audioInputDeviceId: "missing-device" });

    render(<AudioInputSelect />);

    await screen.findByRole("option", { name: "USB Interface" });
    expect(
      screen.getByText("Selected microphone is unavailable. Using browser default."),
    ).toBeInTheDocument();
    expect(screen.getByText("Built-in Microphone")).toBeInTheDocument();
  });
});
