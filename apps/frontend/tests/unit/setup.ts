import "@testing-library/jest-dom";

// Fake IndexedDB in jsdom for storage tests. `idb` needs IDBKeyRange and all the bits;
// use `fake-indexeddb` in tests that need persistence. For most tests we skip storage.

// Silence noisy console.error from React in tests unless explicitly asserted.
const originalError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const first = args[0];
  if (typeof first === "string" && /Warning: ReactDOM.render is no longer supported/.test(first)) {
    return;
  }
  originalError(...(args as []));
};
