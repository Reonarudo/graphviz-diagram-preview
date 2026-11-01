// Injected by esbuild into the worker bundle: the Node globals the renderer's code reads.
// viz.cjs takes its own script name from `__filename` (see url-stub.ts), and the sanitizer
// measures its output with `Buffer.byteLength(output, 'utf8')`.
export const __filename = '/viz.cjs';

export const Buffer = {
  byteLength: (text: string, _encoding: 'utf8'): number => new TextEncoder().encode(text).length
};
