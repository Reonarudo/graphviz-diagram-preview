// The DOM each graphviz block gets: graphviz-markdown-preview's test/markdown.test.ts, ported from
// HTML strings to built nodes. Tests about delegating other fences, VS Code's scroll sync
// (`code-line`, `data-line`) and its highlighter are gone with the markdown-it rule; Obsidian
// routes blocks by language itself and draws the source view's highlighting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RenderResult } from '@reonarudo/graphviz-renderer';
import { parseAttributes } from '../src/attributes';
import { buildFence, describe, diagramLink, fenceKey, isSourceView, setView, showError, showLoading, showResult } from '../src/fence';
import { document, fence, rendering } from './helpers';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const diagram = (output = `<svg ${NS} class="graphviz"></svg>`): RenderResult => ({ status: 'success', output, notes: [] });

const LUCIDE = 'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICON_CODE = `<svg ${LUCIDE} class="svg-icon lucide-code-2 graphviz-icon-code">` +
  '<path d="m18 16 4-4-4-4"></path><path d="m6 8-4 4 4 4"></path><path d="m14.5 4-5 16"></path></svg>';
const ICON_GRAPH = `<svg ${LUCIDE} class="svg-icon lucide-network graphviz-icon-graph">` +
  '<rect x="16" y="16" width="6" height="6" rx="1"></rect><rect x="2" y="16" width="6" height="6" rx="1"></rect><rect x="9" y="2" width="6" height="6" rx="1"></rect>' +
  '<path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"></path><path d="M12 12V8"></path></svg>';
const TOGGLE = `<button type="button" class="graphviz-toggle clickable-icon" aria-pressed="false" aria-label="Show source">${ICON_CODE}${ICON_GRAPH}</button>`;

// The DOM contract, asserted exactly once, here.
test('every block is wrapped: toggle first, rendering slot, then the source <pre>', () => {
  assert.equal(fence('graphviz', 'm\n', diagram()).outerHTML,
    `<div class="graphviz-fence" data-fence-key="bd2eb076">${TOGGLE}` +
    `<div class="graphviz-rendering"><svg ${NS} class="graphviz"></svg></div>` +
    '<pre><code class="language-graphviz">m\n</code></pre></div>');
});

test('the fence key is FNV-1a of the exact body', () => {
  assert.equal(fenceKey('m\n'), 'bd2eb076');
  assert.equal(fenceKey(''), '811c9dc5');
  // The info string and attributes play no part: same body, same key.
  assert.equal(fence('graphviz {caption="c"}', 'm\n', diagram()).getAttribute('data-fence-key'), 'bd2eb076');
  assert.match(fenceKey('m \n'), /^(?!bd2eb076)[0-9a-f]{8}$/);
});

test('the source view is the body as text, never markup', () => {
  const wrapper = fence('graphviz', '<m>', diagram());
  assert.equal(wrapper.querySelector('pre > code.language-graphviz')!.textContent, '<m>');
  assert.equal(wrapper.querySelectorAll('m').length, 0);
});

test('setView flips the wrapper, the button state and its name, and back', () => {
  const wrapper = fence('graphviz', 'm', diagram());
  const button = wrapper.querySelector('button')!;
  setView(wrapper, true);
  assert.equal(wrapper.getAttribute('data-view'), 'source');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(button.getAttribute('aria-label'), 'Show diagram');
  assert.equal(isSourceView(wrapper), true);
  setView(wrapper, false);
  assert.equal(wrapper.hasAttribute('data-view'), false);
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.getAttribute('aria-label'), 'Show source');
});

test('the loading line and error cards sit in the rendering slot', () => {
  const parts = buildFence(document, 'm', fenceKey('m'));
  showLoading(parts.rendering);
  assert.equal(rendering(parts.wrapper), '<p class="graphviz-loading" role="status">Rendering Graphviz diagram…</p>');
  showError(parts.rendering, 'Graphviz error: x');
  assert.equal(rendering(parts.wrapper), '<div class="graphviz-error" role="alert"><pre>Graphviz error: x</pre></div>');
});

test('the error card and a renderer that threw sit in the rendering slot, with the source <pre> beside them', () => {
  assert.equal(fence('graphviz', 'm\n', { status: 'failure', message: 'no' }).outerHTML,
    `<div class="graphviz-fence" data-fence-key="bd2eb076">${TOGGLE}` +
    '<div class="graphviz-rendering"><div class="graphviz-error" role="alert"><pre>Graphviz error: no</pre></div></div>' +
    '<pre><code class="language-graphviz">m\n</code></pre></div>');
  // The plugin turns a throw into a failure carrying its message, as the extension's rule does.
  assert.equal(rendering(fence('graphviz', 'm', { status: 'failure', message: 'x' })),
    '<div class="graphviz-error" role="alert"><pre>Graphviz error: x</pre></div>');
});

test('a bare fence emits the diagram at its natural width in points, with no figure', () => {
  const wrapper = fence('graphviz', 'digraph {}', diagram(`<svg ${NS} class="graphviz" viewBox="0.00 0.00 62.00 116.00"><g/></svg>`));
  assert.equal(rendering(wrapper), `<svg ${NS} class="graphviz" viewBox="0.00 0.00 62.00 116.00" width="62pt"><g></g></svg>`);
});

test('a diagram without a viewBox gets no width', () => {
  const wrapper = fence('graphviz', 'digraph {}', diagram(`<svg ${NS} class="graphviz"><g viewBox="0 0 9 9"/></svg>`));
  assert.equal(rendering(wrapper), `<svg ${NS} class="graphviz"><g viewBox="0 0 9 9"></g></svg>`);
});

test('alt becomes an accessible name, caption a figure, align a class', () => {
  const html = rendering(fence('graphviz {alt="Two nodes" caption="Figure 1" align="center"}', 'digraph {}', diagram()));
  assert.equal(html, '<figure class="graphviz-figure graphviz-align-center">' +
    `<div role="img" aria-label="Two nodes"><svg ${NS} class="graphviz"></svg></div><figcaption>Figure 1</figcaption></figure>`);
  // The caption must sit outside the image role to stay readable by assistive technology.
  assert.ok(html.indexOf('</div>') < html.indexOf('<figcaption>'));
});

test('align alone still produces a figure to carry the class', () => {
  assert.equal(rendering(fence('graphviz {align="right"}', 'digraph {}', diagram())),
    `<figure class="graphviz-figure graphviz-align-right"><svg ${NS} class="graphviz"></svg></figure>`);
});

test('class lands on the root svg beside the base class, as text', () => {
  const wrapper = fence('graphviz {class="wide &quot;x\\" onload=\\"y"}', 'digraph {}',
    diagram(`<svg ${NS} class="graphviz"><g class="graphviz"></g></svg>`));
  assert.equal(rendering(wrapper), `<svg ${NS} class="graphviz wide &amp;quot;x&quot; onload=&quot;y"><g class="graphviz"></g></svg>`);
  const svg = wrapper.querySelector('.graphviz-rendering > svg')!;
  assert.equal(svg.getAttribute('onload'), null);
  assert.equal(svg.getAttribute('class'), 'graphviz wide &quot;x" onload="y');
});

test('attribute text stays text, including quotes, markup and Markdown', () => {
  const wrapper = fence('graphviz {alt="<img src=x onerror=alert(1)>" caption="**bold** & \\"quoted\\""}', 'digraph {}', diagram());
  assert.equal(wrapper.querySelectorAll('img, strong').length, 0);
  assert.equal(wrapper.querySelector('[role="img"]')!.getAttribute('aria-label'), '<img src=x onerror=alert(1)>');
  assert.equal(wrapper.querySelector('figcaption')!.textContent, '**bold** & "quoted"');
  assert.match(rendering(wrapper), /<figcaption>\*\*bold\*\* &amp; "quoted"<\/figcaption>/);
});

test('malformed attributes are reported, never shown, and the diagram still renders', () => {
  assert.equal(parseAttributes('graphviz {alt="unterminated}').diagnostics.length, 1);
  assert.equal(rendering(fence('graphviz {alt="unterminated}', 'digraph {}', diagram())), `<svg ${NS} class="graphviz"></svg>`);
});

test('a throwing renderer becomes an error report, not a broken preview', () => {
  const wrapper = fence('graphviz', 'digraph {}', { status: 'failure', message: 'render() called after <dispose()>' });
  assert.equal(wrapper.querySelector('.graphviz-error pre')!.textContent, 'Graphviz error: render() called after <dispose()>');
  assert.match(rendering(wrapper), /<pre>Graphviz error: render\(\) called after &lt;dispose\(\)&gt;<\/pre>/);
});

test('a failure shows the message, escaped, with its line echoed from the source', () => {
  const wrapper = fence('graphviz', 'digraph {\n  a -> -> b\n}', {
    status: 'failure', message: "syntax error near '->'\n<b>second</b> problem", line: 2
  });
  assert.equal(rendering(wrapper),
    "<div class=\"graphviz-error\" role=\"alert\"><pre>Graphviz error at line 2: syntax error near '-&gt;'\n&lt;b&gt;second&lt;/b&gt; problem\n\n2 │   a -&gt; -&gt; b</pre></div>");
  assert.equal(wrapper.querySelectorAll('.graphviz-rendering b').length, 0);
});

test('a line past the end of the body is not echoed', () => {
  assert.equal(describe({ status: 'failure', message: 'x', line: 3 }, 'a\nb'), 'Graphviz error at line 3: x');
});

test('a failure without a line shows the message only', () => {
  assert.match(rendering(fence('graphviz', '', { status: 'failure', message: 'the fence contains no graph' })),
    /<pre>Graphviz error: the fence contains no graph<\/pre>/);
});

test('a timeout states its budget; an unavailable renderer says it will retry', () => {
  assert.equal(rendering(fence('graphviz', 'digraph {}', { status: 'timeout', budget: 3000 })),
    '<div class="graphviz-error" role="alert"><pre>Graphviz layout took longer than 3 s. Simplify or split the graph.</pre></div>');
  assert.match(rendering(fence('graphviz', 'digraph {}', { status: 'unavailable', reason: 'out of <memory>' })),
    /<pre>Graphviz could not start: out of &lt;memory&gt;\. It will retry on the next render\.<\/pre>/);
  assert.match(describe({ status: 'timeout', budget: 1500 }, ''), /longer than 1\.5 s\./);
});

test('output that is not a well-formed <svg> becomes an error card, not markup', () => {
  for (const output of ['<img src=x onerror=alert(1)>', `<svg ${NS}><unclosed></svg>`, 'plain text', '<html><body/></html>']) {
    const wrapper = fence('graphviz', 'digraph {}', diagram(output));
    assert.equal(rendering(wrapper),
      '<div class="graphviz-error" role="alert"><pre>Graphviz error: the renderer returned a diagram that could not be read</pre></div>', output);
  }
});

test('a diagram link is followed only for the schemes the sanitizer keeps, and only inside this block', () => {
  const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
  const wrapper = fence('graphviz', 'digraph {}', diagram(`<svg ${NS} ${XLINK} class="graphviz" viewBox="0 0 10 10">` +
    '<a xlink:href="https://graphviz.org/" xlink:title="docs"><g id="n"><text>web</text></g></a>' +
    '<a xlink:href="mailto:a@example.org"><text>mail</text></a>' +
    '<a xlink:href="javascript:alert(1)"><text>bad</text></a>' +
    '<g id="plain"><text>plain</text></g></svg>'));
  const slot = wrapper.querySelector<HTMLElement>('.graphviz-rendering')!;
  const texts = [...slot.querySelectorAll('text')];
  assert.equal(diagramLink(slot, texts[0]!), 'https://graphviz.org/');
  assert.equal(diagramLink(slot, texts[1]!), 'mailto:a@example.org');
  assert.equal(diagramLink(slot, texts[2]!), undefined);
  assert.equal(diagramLink(slot, texts[3]!), undefined);
  assert.equal(diagramLink(slot, null), undefined);
  // The toggle button is outside the rendering slot.
  assert.equal(diagramLink(slot, wrapper.querySelector('button')), undefined);
});

test('showResult replaces whatever the slot held', () => {
  const parts = buildFence(document, 'm', fenceKey('m'));
  showLoading(parts.rendering);
  showResult(parts.rendering, diagram(), {}, 'm');
  assert.equal(rendering(parts.wrapper), `<svg ${NS} class="graphviz"></svg>`);
});

test('each drawing gets ids of its own, and its references follow them', () => {
  const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
  const output = `<svg ${NS} ${XLINK} class="graphviz" viewBox="0 0 10 10"><defs>` +
    '<linearGradient id="graphviz-0123abcd-l_1"><stop offset="0"/></linearGradient>' +
    '<clipPath id="graphviz-0123abcd-c"><rect width="1" height="1"/></clipPath></defs>' +
    '<g id="graphviz-0123abcd-node1"><path fill="url(#graphviz-0123abcd-l_1)" clip-path="url(#graphviz-0123abcd-c)" d="M0 0"/>' +
    '<use xlink:href="#graphviz-0123abcd-node1"/><use href="#elsewhere"/></g></svg>';
  const [first, second] = [fence('graphviz', 'g', diagram(output)), fence('graphviz', 'g', diagram(output))];
  const ids = (wrapper: Element) => [...wrapper.querySelectorAll('.graphviz-rendering [id]')].map((element) => element.id);
  assert.equal(new Set([...ids(first), ...ids(second)]).size, 6);
  for (const wrapper of [first, second]) {
    const [gradient, clip, node] = ids(wrapper);
    assert.match(gradient!, /^graphviz-0123abcd-l_1-\d+$/);
    const path = wrapper.querySelector('path[d="M0 0"]')!;
    assert.equal(path.getAttribute('fill'), `url(#${gradient})`);
    assert.equal(path.getAttribute('clip-path'), `url(#${clip})`);
    const [use, other] = [...wrapper.querySelectorAll('use')];
    assert.equal(use!.getAttributeNS('http://www.w3.org/1999/xlink', 'href'), `#${node}`);
    // A reference to no id of this diagram is left alone.
    assert.equal(other!.getAttribute('href'), '#elsewhere');
  }
});

test('a diagram gets dark-theme colours by role, its light colours kept verbatim', () => {
  const wrapper = fence('graphviz', 'digraph { a }', diagram(`<svg ${NS} class="graphviz" viewBox="0 0 10 10"><g class="graph">` +
    '<polygon fill="white" stroke="none" points="0,0"/><g class="node"><ellipse fill="lightyellow" stroke="black"/><text fill="black">a</text></g></g></svg>'));
  const svg = wrapper.querySelector('.graphviz-rendering > svg')!;
  assert.equal(svg.getAttribute('class'), 'graphviz');
  assert.match(svg.querySelector('polygon')!.getAttribute('style')!, /^fill:light-dark\(white, rgb\(30, 30, 30\)\)/);
  assert.match(svg.querySelector('ellipse')!.getAttribute('style')!, /fill:light-dark\(lightyellow, rgb\(/);
  assert.match(svg.querySelector('text')!.getAttribute('style')!, /^fill:light-dark\(black, var\(--text-normal\)\)$/);
});

test('a graph with its own bgcolor keeps its exact colours, marked for the stylesheet', () => {
  const output = `<svg ${NS} class="graphviz" viewBox="0 0 10 10"><g class="graph"><polygon fill="navy" points="0,0"/><text fill="white">a</text></g></svg>`;
  const wrapper = fence('graphviz {class="wide"}', 'digraph { bgcolor=navy; a [fontcolor=white] }', diagram(output));
  const svg = wrapper.querySelector('.graphviz-rendering > svg')!;
  assert.equal(svg.getAttribute('class'), 'graphviz wide graphviz-own-background');
  assert.equal(svg.querySelectorAll('[style]').length, 0);
});
