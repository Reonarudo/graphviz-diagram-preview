// The render worker, bundled for a browser Worker by scripts/worker-bundle.mjs and embedded in
// main.js. A port of graphviz-renderer's dist/worker.js: the same engine (viz-js, loaded the same
// way), the same memory snapshot restored after every render, and the same `interpret` (which
// sanitizes the SVG), answering over postMessage instead of shared memory.
import { interpret, type Layout } from '#renderer/dist/interpret.js';
import * as vizModule from '#renderer/vendor/viz/viz.cjs';
import type { Reply, Request, Started } from '../protocol';

interface Viz {
  render(source: string, options: { format: string }): Layout;
}

interface Scope {
  onmessage: ((event: { data: Request }) => void) | null;
  postMessage(message: Started | Reply): void;
}
const scope = self as unknown as Scope;

/**
 * Load viz and catch hold of its wasm memory, which it does not export. Graphviz keeps state
 * across renders — gradient ids count up from one render to the next — so every render starts
 * from the memory the engine had when it was ready; without that, output would not be
 * deterministic. As in the library, `WebAssembly.instantiate` is wrapped only while viz starts,
 * and a missing memory is a failed start, not a crash.
 */
async function load(): Promise<{ viz: Viz; memory: WebAssembly.Memory }> {
  let memory: WebAssembly.Memory | undefined;
  const instantiate = WebAssembly.instantiate;
  WebAssembly.instantiate = (async (...args: [BufferSource | WebAssembly.Module, WebAssembly.Imports?]) => {
    const result: WebAssembly.WebAssemblyInstantiatedSource | WebAssembly.Instance =
      await (instantiate as (...a: typeof args) => Promise<WebAssembly.WebAssemblyInstantiatedSource | WebAssembly.Instance>)(...args);
    const exports = ('instance' in result ? result.instance : result).exports;
    for (const value of Object.values(exports)) if (value instanceof WebAssembly.Memory) memory = value;
    return result;
  }) as typeof instantiate;
  try {
    const viz = await (vizModule as { instance(): Promise<Viz> }).instance();
    if (!memory) throw new Error('viz memory not found');
    return { viz, memory };
  } finally {
    WebAssembly.instantiate = instantiate;
  }
}

load().then(({ viz, memory }) => {
  const snapshot = new Uint8Array(memory.buffer).slice();
  scope.onmessage = ({ data: { id, source, prefix, outputBytes } }) => {
    let layout: Layout;
    try {
      // `svg_inline` omits the xml-stylesheet processing instruction, and no `images` option is
      // passed, so Graphviz finds no image files and emits no <image>.
      layout = viz.render(source, { format: 'svg_inline' });
    } catch {
      // viz turns Graphviz's own exit into a failure and rethrows only an abort, such as running
      // out of memory, which leaves the instance unusable; the plugin discards this worker.
      scope.postMessage({ type: 'reply', id, result: { status: 'failure', message: 'graphviz stopped unexpectedly' }, discard: true });
      return;
    }
    new Uint8Array(memory.buffer).set(snapshot);
    scope.postMessage({ type: 'reply', id, result: interpret(layout, source, prefix, outputBytes) });
  };
  scope.postMessage({ type: 'started' });
}, () => {
  // The error would name bundle internals; the reason stays plain.
  scope.postMessage({ type: 'failed', reason: 'graphviz could not start' });
});
