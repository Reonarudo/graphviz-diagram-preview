# Changelog

## 0.1.3 (2026-11-01)

- Settings come only from Obsidian's declarative settings definitions; the older `display()`
  method, needed only before Obsidian 1.13, is gone (the minimum is 1.14.4).
- In dark themes Graphviz's default white background is made transparent by the plugin's colour pass instead of a
  `!important` style rule.

## 0.1.2 (2026-11-01)

- Releases are built by GitHub Actions from the tagged commit, with signed build provenance
  attestations for `main.js`, `manifest.json` and `styles.css`. Check a download with
  `gh attestation verify main.js -R Reonarudo/graphviz-diagram-preview`.
- Releases carry only the files Obsidian installs; `SHA256SUMS` is gone, as the attestations
  cover it.

## 0.1.1 (2026-11-01)

- The minimum Obsidian version is now 1.14.4, the version every check ran against; 1.5.0 was
  never tested.
- The description capitalizes its proper nouns.

## 0.1.0 (2026-11-01)

First version, ported from the VS Code extension
[graphviz-diagram-preview](https://github.com/Reonarudo/graphviz-markdown-preview) 0.3.0.

- `graphviz` code blocks render as diagrams in Reading view and Live Preview, at their natural
  width, scaled down to the column.
- Attribute blocks on the fence: `alt`, `caption`, `align`, `class`.
- In Reading view, a button on every block flips it between the diagram and its source. It looks
  and sits like Obsidian's own "Edit this block" button and appears on hover. Flips are
  remembered per note, follow renames, and apply in every Reading view of the note.
- In Live Preview the block always shows its diagram, and Obsidian's own "Edit this block"
  button opens it for editing, as for Mermaid.
- Errors echo the offending line; time-outs, the 64 000-character limit and the cache of recent
  results behave as in the VS Code extension. Graphviz warnings go to the developer console
  with debug logging on, once per fresh render.
- `http:`, `https:` and `mailto:` links in diagrams open in the browser.
- Each drawing of a diagram gets ids of its own, so a hidden copy (Reading view beside Live
  Preview, a block in source view) never takes a visible diagram's gradients.
- Rendering runs in a Web Worker inside Obsidian, from graphviz-renderer 1.0.0's engine and
  sanitizer; no Node install is needed.
- Diagrams follow dark themes as Mermaid's do: each colour gets a dark-theme counterpart by its
  role (lines and text lightened only as needed, filled shapes darkened, hues kept), switching
  with the theme without a re-render. Graphviz's default white background gives way to the page;
  labels are checked against their node, cluster or the page. A graph with its own `bgcolor`
  keeps its exact colours in every theme. A setting keeps every diagram on a white card instead.
- Settings: layout time limit, following dark themes, debug logging; listed in Obsidian's
  settings search (1.13 and later).
- The renderer starts with the first diagram drawn, not when Obsidian starts.
- Diagrams draw in hover previews and PDF export, and are built with Obsidian's DOM helpers, so
  pop-out windows get their own elements.
- On an Obsidian whose Chromium lacks `light-dark()`, diagrams keep their white card.
- Commands: restart the renderer; show every diagram in the current note.
- Mobile: the plugin is no longer desktop-only; on touch devices the source button stays visible.
