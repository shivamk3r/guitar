import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FloatingAudioInputControl } from "./FloatingAudioInputControl";

vi.mock("./AudioInputSelect", () => ({
  AudioInputSelect: ({ className }: { className?: string }) => (
    <div className={className}>
      <label htmlFor="mock-microphone">Microphone</label>
      <select id="mock-microphone">
        <option>Browser default</option>
      </select>
      <div>Selected: Browser default</div>
    </div>
  ),
}));

describe("FloatingAudioInputControl", () => {
  it("starts expanded with the microphone selector visible", () => {
    render(<FloatingAudioInputControl />);

    expect(screen.getByRole("region", { name: "Audio input selector" })).toBeVisible();
    expect(screen.getByLabelText("Microphone")).toBeVisible();
    expect(screen.getByRole("button", { name: "Minimize audio input selector" })).toHaveAttribute(
      "title",
      "Minimize audio input selector",
    );
  });

  it("minimizes to a compact expand button", async () => {
    const user = userEvent.setup();
    render(<FloatingAudioInputControl />);

    await user.click(screen.getByRole("button", { name: "Minimize audio input selector" }));

    expect(screen.queryByRole("region", { name: "Audio input selector" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Microphone")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand audio input selector" })).toHaveAttribute(
      "title",
      "Expand audio input selector",
    );
  });

  it("expands again from the compact button", async () => {
    const user = userEvent.setup();
    render(<FloatingAudioInputControl />);

    await user.click(screen.getByRole("button", { name: "Minimize audio input selector" }));
    await user.click(screen.getByRole("button", { name: "Expand audio input selector" }));

    expect(screen.getByRole("region", { name: "Audio input selector" })).toBeVisible();
    expect(screen.getByLabelText("Microphone")).toBeVisible();
  });
});
