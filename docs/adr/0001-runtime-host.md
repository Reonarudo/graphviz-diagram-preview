# 0001: Render in a browser Worker built from the renderer's worker code

Status: accepted, 2026-10-31.

## Context

graphviz-renderer is a Node library: `createRuntime()` starts a `node:worker_threads` Worker and
`render()` blocks on it with `Atomics.wait`. The VS Code extension calls it from a synchronous
markdown-it rule. An Obsidian plugin runs on the window's main thread of Electron's renderer
process. The pikchr pilot's spike (`docs/spike-worker-threads.md` in pikchr-diagram-preview)
measured, in Obsidian 1.14.4 (Electron 43.7.7, Node 24.21.0):

- `worker_threads` loads but cannot create a Worker ("The V8 platform used by this instance of
  Node does not support creating Workers"), so the library's runtime cannot start.
- `ELECTRON_RUN_AS_NODE` is fused off, so the plugin cannot fork Obsidian as a Node host.
- A browser `Worker` started from a blob URL runs an esbuild bundle of a renderer's worker code.

The alternatives were a system Node 22+ spawned as a host process (every user must install Node)
and adding a browser entry to each renderer package (six renderer releases before any plugin).
The user chose the browser Worker bundle, built by the plugin.

## Decision

- `src/worker/entry.ts` ports the renderer's `dist/worker.js`: viz-js (`vendor/viz/viz.cjs`,
  wasm embedded) started with `instance()`, its wasm memory caught by wrapping
  `WebAssembly.instantiate` during start-up, a snapshot of that memory restored after every
  render so output is deterministic, and the same `interpret` (and through it the sanitizer),
  all imported from the installed package. `scripts/worker-bundle.mjs` bundles it with esbuild
  for the browser. The Node the code touches is stubbed: viz names its own script through
  `require('url').pathToFileURL(__filename)` (a stub `url` module and an injected `__filename`;
  the name only locates a wasm file that is never fetched), and the sanitizer measures output
  with `Buffer.byteLength` (an injected `TextEncoder` equivalent). `scripts/build.mjs` embeds
  the bundle in `main.js` as a string, started from a blob URL.
- The worker answers with `postMessage` instead of the library's SharedArrayBuffer protocol:
  rendering is asynchronous in Obsidian, so the shared buffer bought nothing, and dropping it
  removes the need for SharedArrayBuffer and `Atomics.waitAsync`.
- `src/host.ts` ports `createRuntime` with the library's option validation, defaults (3 s per
  render, 10 s start-up, 64 000 characters, 4 MiB output), wording and recovery (terminate on
  timeout or a discarded engine, fresh worker on the next render), and the library's id prefix
  (`graphviz-` and eight hex digits of the source's SHA-256, through `crypto.subtle`). Renders
  are queued, one at a time, on one worker.
- The renderer package stays untouched and is still the dependency, pinned to its release
  tarball; its version in `package.json` decides the engine and sanitizer that ship.

## Consequences

- No Node, no files written, nothing extracted: `main.js`, `manifest.json` and `styles.css` are
  the whole plugin, as Obsidian's community install expects. `main.js` is about 1.9 MB (0.56 MB
  gzipped), almost all of it the Graphviz wasm.
- A browser Worker has no heap cap like the library's `resourceLimits` (256 MB); a runaway
  layout is stopped only by the time limit.
- The library's "output is too large to return" failure cannot occur: there is no shared buffer
  to overflow.
- The plugin's worker entry must be kept in step with the renderer's `worker.ts` when the
  renderer changes; `test/worker.test.ts` runs the embedded bundle and compares its results
  with the library's own Node runtime, byte for byte.
- Nothing in the plugin needs Node or Electron, so it is not desktop-only. A blob-URL Web Worker
  and WebAssembly are available in the mobile apps' web views; checked under Obsidian's mobile
  emulation, to be confirmed on devices through a BRAT pre-release. The 2 MB `main.js` and the
  engine's wasm memory weigh more on a phone than pikchr's.
