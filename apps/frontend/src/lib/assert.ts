export function assert(condition: unknown, message = "assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

export function unreachable(value: never, message = "unreachable"): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}
