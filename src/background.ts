/**
 * Whether a DOT source sets its own graph background: a `bgcolor` in the root graph's body, as a
 * statement (`bgcolor=lightblue`) or in a `graph [...]` attribute list. A cluster's or
 * subgraph's `bgcolor`, and the word inside strings, comments or HTML labels, do not count.
 *
 * Such a diagram keeps its exact colours in every theme (docs/adr/0002-dark-theme-colours.md):
 * the author chose a background, and its own colours are drawn to read on it.
 */
export function setsBackground(source: string): boolean {
  let depth = 0;
  /** Inside `[...]` at the root graph's depth: whether that list follows the `graph` keyword. */
  let list: 'graph' | 'other' | undefined;
  let lastWord = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i]!;
    // Comments: `//` and `#` (at a line start) to the end of the line, `/* */` blocks.
    if (c === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (c === '#' && (i === 0 || source[i - 1] === '\n')) {
      i = source.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    // Quoted strings, with `\"` escapes.
    if (c === '"') {
      i++;
      while (i < n && source[i] !== '"') i += source[i] === '\\' ? 2 : 1;
      i++;
      lastWord = '';
      continue;
    }
    // HTML-like labels: balanced `<...>`.
    if (c === '<') {
      let nest = 0;
      for (; i < n; i++) {
        if (source[i] === '<') nest++;
        else if (source[i] === '>' && --nest === 0) break;
      }
      i++;
      lastWord = '';
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '[') {
      if (depth === 1 && list === undefined) list = lastWord.toLowerCase() === 'graph' ? 'graph' : 'other';
    } else if (c === ']') {
      if (depth === 1) list = undefined;
    } else if (/[A-Za-z_\d.\u0080-￿]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z_\d.\u0080-￿]/.test(source[j]!)) j++;
      const word = source.slice(i, j);
      if (word.toLowerCase() === 'bgcolor' && depth === 1 && list !== 'other' && /^\s*=/.test(source.slice(j))) return true;
      lastWord = word;
      i = j;
      continue;
    }
    if (!/\s/.test(c)) lastWord = c === '[' ? lastWord : '';
    i++;
  }
  return false;
}
