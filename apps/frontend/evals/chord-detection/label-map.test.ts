import { describe, expect, it } from "vitest";
import { normalizeChordLabel } from "./label-map";

describe("normalizeChordLabel", () => {
  it.each([
    ["A", "A"],
    ["Am", "Am"],
    ["A:min", "Am"],
    ["D:7", "D7"],
    ["E:5", "E5"],
    ["F:maj/1", "F"],
    ["E#:maj", "F"],
  ])("maps %s to %s", (input, expected) => {
    expect(normalizeChordLabel(input)).toBe(expected);
  });

  it.each(["A#", "Bb:maj", "C:min7", "N", "noise"])("rejects unsupported label %s", (input) => {
    expect(normalizeChordLabel(input)).toBeNull();
  });
});
