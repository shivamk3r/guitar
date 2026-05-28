export type Unsubscribe = () => void;

export class Emitter<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<(e: unknown) => void>>();

  on<K extends keyof Events>(type: K, handler: (e: Events[K]) => void): Unsubscribe {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as (e: unknown) => void);
    return () => {
      set?.delete(handler as (e: unknown) => void);
    };
  }

  emit<K extends keyof Events>(type: K, event: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of set) {
      (handler as (e: Events[K]) => void)(event);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
