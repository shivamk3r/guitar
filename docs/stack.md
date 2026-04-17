# Stack Decision

**Status:** accepted (2026-04-17) · **Scope:** v1 frontend-only build.

## Summary

| Area             | Choice                                                  |
| ---------------- | ------------------------------------------------------- |
| Build / dev      | **Vite** + React 18 + TypeScript (strict)               |
| Language         | TypeScript                                              |
| Styling          | Tailwind CSS for layout/UI; SVG for domain visuals      |
| State            | Zustand (global slices) + local React state             |
| Audio            | Web Audio API + AudioWorklet (DSP in the audio thread)  |
| Persistence      | IndexedDB via [`idb`](https://www.npmjs.com/package/idb) |
| Testing          | Vitest + React Testing Library (unit), Playwright (e2e) |
| Lint / format    | Biome (single tool, single config)                      |
| Package manager  | pnpm                                                    |
| Deploy           | Static hosting (Vercel / Netlify / Cloudflare Pages)    |

## Why Vite and not Next.js

Next.js is built around server rendering, React Server Components, and server routes. For Guitar Coach v1 every feature runs *after* a user gesture in the browser: mic permission, `AudioContext` creation, DSP in an AudioWorklet. Nothing the user cares about can be produced on a server. Shipping Next's server runtime and then disabling most of it is a poor fit for the problem.

Concretely:

- **Latency targets (NFR-1)** are met by keeping everything in the browser and moving DSP into an AudioWorklet. Server rendering adds no value to that path.
- **Privacy (NFR-3)** is "all audio stays client-side". No backend simplifies that promise.
- **Offline (NFR-5)** is "works after first load". A static Vite build plus a service worker gets there with less ceremony than Next.
- **Dev loop.** Vite's cold start and hot reload are dramatically faster than Next when iterating on audio code — essential when you're testing pitch detection on real plucks.
- **Bundle.** We ship React + Zustand + `idb` + a thin audio layer. Vite's tree-shaken build is smaller than Next's default client runtime.

Next.js *would* win if we wanted SEO-heavy marketing pages, an integrated Node API layer from day one, or per-route server rendering. None are in scope for v1.

If we later need a backend (accounts, cross-device sync, telemetry), we add a separate service — the React code doesn't change. Migration to Next.js from Vite+React is feasible but unnecessary; adding a sibling backend (Hono, Fastify, or a Next API app) is simpler.

## Why these specific picks

- **TypeScript strict.** Guitar Coach is event-driven with real-time audio and per-event data shapes (pitch frames, chord results, scored drills). TS catches shape drift at compile time, which is cheaper than debugging it at 48 kHz.
- **Tailwind + SVG, not a component library.** The high-value UI pieces are domain visuals: a tuner needle, a fretboard diagram, a strum pulse. Those are SVG we own. Tailwind keeps the surrounding layout terse without importing a design system we'd have to override.
- **Zustand, not Redux or Context.** State is a handful of independent slices (settings, progress, current-drill). Zustand gives small typed stores with no provider tree and no action boilerplate. Redux is overkill for this shape.
- **`idb` for IndexedDB, not Dexie.** `idb` is a thin typed wrapper with no query language. We don't need Dexie's reactive queries — our persistence is "load settings on boot, append session results, read progress for charts".
- **Vitest + Playwright, not Jest + Cypress.** Vitest shares Vite's config and transforms; no duplicate toolchain. Playwright handles `fake-media-stream` out of the box, which matters for testing the audio pipeline without a live mic.
- **Biome, not ESLint + Prettier.** One binary, one config, much faster. Agent-friendlier because a single tool owns both lint and format rules.
- **pnpm, not npm or yarn.** Faster installs and a strict node_modules layout that catches phantom dependencies. If this becomes an obstacle on any contributor's machine, npm works as a drop-in.

## Explicitly deferred

- **Backend service.** Not needed for v1. Will be added when we introduce accounts or cross-device sync.
- **Authentication.** None in v1. Progress is stored locally in IndexedDB.
- **PWA / service worker.** Planned (NFR-5) but not in the initial scaffold. Adding Vite's PWA plugin once the app shell stabilizes is straightforward.
- **Mobile packaging.** Desktop browsers only for v1. If mobile becomes primary, Capacitor over the Vite build is the likely route — not React Native.
- **Telemetry / analytics.** Out of scope until there are real users and an explicit privacy story.

## Open items to decide later

- **Hosting.** Vercel / Netlify / Cloudflare Pages are equivalent for our needs. Pick when we're ready to deploy.
- **Chord reference audio format.** Short WAV vs compressed OGG/Opus — decide based on file size once we record samples.
- **State persistence schema versioning.** Needs a migration strategy before we ship to real users. Not urgent for local development.
