import {
  DARK_PAGE, LINE_CONTRAST, TEXT_CONTRAST, TEXT_ON_PAGE, areaColor, inkColor, parseColor, readableOn, themeSvg, toLab,
  type Rgb
} from './theme';

/**
 * Dark-theme colours for a Graphviz drawing: `themeSvg` (shared by every plugin, unchanged), then
 * its text checked against what it really sits on, which Graphviz's structure tells.
 *
 * `themeSvg` checks text against the last filled shape before it in its group. In Graphviz's
 * output that is right for a node or a cluster (its shape, then its label), but an edge group
 * holds its arrowhead, a filled mark, before its label, which sits on the page; and a node drawn
 * without a fill (the default) has text on the page too, where a light `fontcolor` was mirrored as
 * if it sat on a dark box. Here every label's dark colour is computed again against its real
 * background: the node's or cluster's own filled shape, else the page (Graphviz's white background
 * polygon becomes transparent in dark themes, below).
 */
export function themeGraphviz(svg: Element): void {
  themeSvg(svg);
  // Graphviz paints the graph's background as the first shape of the graph group.
  clearBackgroundInDark(svg.querySelector(':scope > g.graph > polygon'));
  for (const text of svg.querySelectorAll('text')) {
    const original = text.getAttribute('fill') ?? 'black';
    const rgb = parseColor(original);
    if (!rgb) continue;
    const box = boxOf(text);
    const fill = toLab(rgb).L >= 0.75 && box ? areaColor(rgb) : inkColor(rgb, TEXT_ON_PAGE);
    const dark = box ? readableOn(fill.rgb, box, TEXT_CONTRAST) : readableOn(fill.rgb, DARK_PAGE, TEXT_CONTRAST);
    const value = dark.rgb === fill.rgb ? fill.value : dark.value;
    const style = (text.getAttribute('style') ?? '').split(';').filter((part) => part && !/^\s*fill\s*:/.test(part));
    text.setAttribute('style', [`fill:light-dark(${original}, ${value})`, ...style].join(';'));
    // Where `light-dark()` is not understood the declaration is dropped; the attribute keeps the original.
    if (!text.hasAttribute('fill')) text.setAttribute('fill', original);
  }
}

/** The dark colour of the filled shape a label sits on: its node's or cluster's, if it has one. */
function boxOf(text: Element): Rgb | undefined {
  const owner = text.closest('g.node, g.cluster, g.edge, g.graph');
  if (!owner || !/\b(?:node|cluster)\b/.test(owner.getAttribute('class') ?? '')) return undefined;
  let box: Rgb | undefined;
  for (const sibling of text.parentElement?.children ?? []) {
    if (sibling === text) break;
    if (!['polygon', 'ellipse', 'path', 'rect', 'circle'].includes(sibling.localName)) continue;
    const rgb = parseColor(sibling.getAttribute('fill') ?? '');
    if (rgb) box = toLab(rgb).L < 0.4 ? inkColor(rgb, LINE_CONTRAST).rgb : areaColor(rgb).rgb;
  }
  return box;
}

/**
 * In dark themes, `shape` (the drawing's own full-size white background) becomes transparent, so
 * the drawing sits on whatever is behind it (the page, a callout) instead of on a box: its dark
 * colour is `transparent`. The light colour stays the original, kept in the `fill` attribute.
 */
export function clearBackgroundInDark(shape: Element | null): void {
  const original = shape?.getAttribute('fill');
  if (!shape || !original) return;
  const others = (shape.getAttribute('style') ?? '').split(';').filter((part) => part.trim() && !/^\s*fill\s*:/.test(part));
  shape.setAttribute('style', [...others, `fill:light-dark(${original}, transparent)`].join(';'));
}
