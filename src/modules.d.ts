// Modules that exist only at build time (scripts/worker-bundle.mjs and scripts/build.mjs).

/** The render worker's bundled source, embedded as a string. */
declare module 'virtual:render-worker' {
  const source: string;
  export default source;
}

/** Files inside the installed graphviz-renderer package, outside its public `exports`. */
declare module '#renderer/dist/interpret.js' {
  import type { RenderResult } from '@reonarudo/graphviz-renderer';
  /** What viz returns for one `svg_inline` render. */
  export interface Layout {
    status: 'success' | 'failure';
    output?: string;
    errors: { level?: 'error' | 'warning'; message: string }[];
  }
  export function interpret(layout: Layout, source: string, prefix: string, outputBytes: number): RenderResult;
}
declare module '#renderer/vendor/viz/viz.cjs' {
  export function instance(): Promise<unknown>;
}
