import { describe, expect, it, vi } from "vitest";
import { Emitter } from "./events";

type Events = { ping: { n: number }; pong: { s: string } };

describe("Emitter", () => {
  it("dispatches to subscribed handlers only", () => {
    const e = new Emitter<Events>();
    const a = vi.fn();
    const b = vi.fn();
    e.on("ping", a);
    e.on("pong", b);
    e.emit("ping", { n: 1 });
    expect(a).toHaveBeenCalledWith({ n: 1 });
    expect(b).not.toHaveBeenCalled();
  });

  it("unsubscribe stops handlers firing", () => {
    const e = new Emitter<Events>();
    const a = vi.fn();
    const off = e.on("ping", a);
    e.emit("ping", { n: 1 });
    off();
    e.emit("ping", { n: 2 });
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("clear removes all handlers", () => {
    const e = new Emitter<Events>();
    const a = vi.fn();
    e.on("ping", a);
    e.clear();
    e.emit("ping", { n: 1 });
    expect(a).not.toHaveBeenCalled();
  });
});
