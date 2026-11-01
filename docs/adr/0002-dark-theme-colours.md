# 0002: Dark-theme colours by role, not by inverting the drawing

Status: accepted, 2026-11-01.

## Context

Mermaid diagrams in Obsidian follow the theme. The plugins first did the same with
`filter: invert(1) hue-rotate(180deg)`, which keeps every label's contrast with its own box but
flips every colour, readable or not: gnuplot's yellow line turned dark olive, SMILES chlorine a dark
green, light-blue and orange lines went dim. A Graphviz graph's own background could not be told
from the renderer's default.

## Decision

`src/theme.ts` gives each colour in the drawing a dark counterpart by its role, computed once when
the plugin inserts the SVG, in OKLab so hue is kept:

- **Ink** (strokes, the `color` property, dark marks such as arrowheads, dark text): lightened
  only as far as needed to read on Obsidian's dark page, 3:1 for lines and marks, 5:1 for text
  (4.5 plus a margin for text on a darkened pastel box). Near-black greys become `--text-normal`.
- **Areas** (fills of L 0.4 and up, gradient stops): lightness mirrored between white and the
  page, so paper becomes the page and pale boxes become dark ones.
- **Knockout text** (near-white text, L 0.75 and up with almost no colour, drawn on a dark fill):
  mirrored like an area. Coloured light text, such as a bright green atom label, is ink.
- A fill set on a group that holds text counts as text, so a group colouring its labels reaches
  the text target.
- Text inside a group that also holds a filled shape is checked against that shape's dark fill;
  near-black marks such as arrowheads never count as what a label sits on.

Each colour is written as `light-dark(<original>, <dark>)`, the original text kept verbatim, and
the stylesheet sets the drawing's `color-scheme` to `dark` only in a dark theme with "Follow dark
themes" on. Switching theme or setting needs no re-render; the light theme and the white card are
exactly the renderer's colours.

## Consequences

- Readable colours stay as they are; only what would not read changes.
- The dark targets are measured against Obsidian's default dark page (#1e1e1e) and text
  (#dadada); a custom theme with a much lighter dark background gets less margin.
- Colours the module cannot parse (`url()`, `currentColor`, unknown names) are left alone; so is
  anything a renderer sets in an embedded `<style>`, unless the plugin handles it.
- Flat drawings (pikchr) have no groups, so text on a dark author-chosen fill relies on the
  knockout rule.

## Graphviz

- **The background.** Graphviz paints every graph on a polygon, the first shape of the graph
  group, white unless the author sets `bgcolor`. Mapped as an area it becomes the default dark
  page, which would show as a box on a callout or any other background, so the stylesheet drops
  it in a dark theme with "Follow dark themes" on and the page shows through.
- **An author's `bgcolor`.** The SVG cannot tell an author's white background from the default,
  so the fence source is read instead (`src/background.ts`): a `bgcolor` in the root graph's body,
  as a statement or in `graph [...]`, outside strings, comments and HTML labels. Such a graph is
  the author's picture: `themeSvg` is skipped, it keeps its own background and exact colours in
  every theme, and it gets no white card (class `graphviz-own-background`). A cluster's or
  subgraph's `bgcolor` does not count; the cluster is themed like any filled shape.
- **Labels.** `src/graphviz-theme.ts` runs `themeSvg` unchanged, then sets every label's dark
  colour again against what it really sits on, which Graphviz's group structure tells: the
  filled shape of its node or cluster, else the page. `themeSvg`'s own group check would put an
  edge label on its arrowhead (a filled mark before the label in the edge group) and darken it
  into the page, and would mirror a light `fontcolor` on an unfilled node as if it were knockout
  text. Measured in the live run: link text on a `lightyellow` node, black on `lightblue`, a
  `darkgreen` edge label, all at least 4.5:1; edges at least 3:1.
- **Gradients** (`fillcolor="a:b"`) map their stops as areas; text on them is checked against the
  page, which they are close to once darkened. **Links** (`fontcolor` on a node with `URL`) are text
  like any other and keep their hue. **Named colours** (`lightyellow`, `darkgreen`) parse through the
  module's CSS colour table. A dark named fill such as `darkgreen` (lightness under 0.4) is treated
  as a mark and lightened; its knockout label is then made to read on it.
