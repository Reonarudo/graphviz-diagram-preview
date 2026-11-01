# Third-party notices

The plugin's own TypeScript, tests and scripts are MIT licensed (see `LICENSE`). This does not
relicense the embedded software.

`main.js` embeds a Web Worker bundle built from the following. Their licenses are reproduced in
full in the renderer package (`node_modules/@reonarudo/graphviz-renderer/licenses/`), whose
`THIRD_PARTY_NOTICES.md` gives the engine's provenance; keep them with any redistribution.

## Graphviz renderer

[graphviz-renderer](https://github.com/Reonarudo/graphviz-renderer) 1.0.0 (MIT) supplies the
interpreter of the engine's output and the SVG sanitizer, and carries the engine:

- **Graphviz 16.0.0**, the unmodified official release compiled to WebAssembly, under the
  Eclipse Public License 2.0 (`licenses/GRAPHVIZ-EPL-2.0`); copyright AT&T and the Graphviz
  contributors, <https://graphviz.org>. Source code:
  <https://gitlab.com/graphviz/graphviz>, release tarball
  `graphviz-16.0.0.tar.gz`, SHA-256
  `36a1de1aaf5a2023b14f95170a5f8f0b12522d1c305b517fc261966597050749`.
- **viz-js 3.30.0** by Michael Daines, MIT (`licenses/VIZ-JS-LICENSE`): the WebAssembly build
  and its JavaScript wrapper. Its `/*! Viz.js 3.30.0 ... */` notice is kept in the bundle.
- **Expat 2.8.4**, MIT (`licenses/EXPAT-COPYING`), linked into Graphviz.
- The **Emscripten** runtime, MIT / University of Illinois/NCSA (`licenses/EMSCRIPTEN-LICENSE`).

## xmldom

[`@xmldom/xmldom`](https://github.com/xmldom/xmldom) 0.9.12 (MIT, `licenses/XMLDOM-LICENSE`),
used by the renderer's sanitizer.
