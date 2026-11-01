// viz.cjs is an Emscripten build with its wasm embedded. With no `document` it names its own
// script through `require('url').pathToFileURL(__filename)`, only to locate a wasm file it never
// fetches; this stands in for Node's `url` module there.
export function pathToFileURL(path: string): URL {
  return new URL(`file://${path}`);
}
export default { pathToFileURL };
