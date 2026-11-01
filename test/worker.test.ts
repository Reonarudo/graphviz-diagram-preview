// The embedded worker bundle, built exactly as main.js embeds it, run under Node through the
// plugin's host. A small prelude gives the bundle the `self` a browser Worker would have. These
// pin the plugin's assumptions about the library's output, port the real-library checks of
// graphviz-markdown-preview's test/preview.test.ts, and compare the bundle with the library's own
// Node runtime byte for byte; rendering itself is graphviz-renderer's to test.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RenderResult } from '@reonarudo/graphviz-renderer';
import { bundleWorker } from '../scripts/worker-bundle.mjs';
import { createCache } from '../src/cache';
import { createHost, type Host, type WorkerLike } from '../src/host';
import { describe } from '../src/fence';
import { fence, rendering } from './helpers';

const PRELUDE = `
const { parentPort } = require('node:worker_threads');
globalThis.self = {
  postMessage: (message) => parentPort.postMessage(message),
  set onmessage(handler) {
    parentPort.removeAllListeners('message');
    if (handler) parentPort.on('message', (data) => handler({ data }));
  }
};
`;

let source: string;
let host: Host;
const spawned: Worker[] = [];

function spawn(): WorkerLike {
  const worker = new Worker(PRELUDE + source, { eval: true });
  spawned.push(worker);
  const like: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (message) => worker.postMessage(message),
    terminate: () => void worker.terminate()
  };
  worker.on('message', (data) => like.onmessage?.({ data }));
  worker.on('error', (error) => like.onerror?.(error));
  return like;
}

before(async () => {
  source = await bundleWorker();
  // The engine's first start compiles a megabyte of wasm; leave room on a slow machine.
  host = createHost(spawn, { timeout: 20000, startupTimeout: 30000 });
});
after(() => host.dispose());

/**
 * The library's own results, from its Node runtime in a separate plain `node` running a script
 * file: under the test runner Node hands the runner's `--import` flags (tsx, test/setup.ts) to
 * every worker thread, and with them, as with `node -e`, the library's worker does not start.
 */
function libraryRender(sources: string[]): RenderResult[] {
  const dir = mkdtempSync(join(tmpdir(), 'graphviz-library-'));
  const script = join(dir, 'render.mjs');
  const entry = pathToFileURL(join(process.cwd(), 'node_modules/@reonarudo/graphviz-renderer/dist/index.js')).href;
  writeFileSync(script, `
    const { createRuntime } = await import(${JSON.stringify(entry)});
    const runtime = await createRuntime({ timeout: 20000, startupTimeout: 30000 });
    const results = JSON.parse(process.argv[2]).map((source) => runtime.render({ source }));
    await runtime.dispose();
    process.stdout.write(JSON.stringify(results));`);
  try {
    return JSON.parse(execFileSync(process.execPath, [script, JSON.stringify(sources)], { encoding: 'utf8' })) as RenderResult[];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const success = (result: RenderResult): string => {
  if (result.status !== 'success') assert.fail(`expected a diagram, got ${JSON.stringify(result)}`);
  return result.output;
};

test('the bundle carries no Node module imports and no dynamic require', () => {
  assert.doesNotMatch(source, /require\(["']node:|from["']node:|require\(["']url["']\)/);
  assert.doesNotMatch(source, /Dynamic require/);
});

test('the bundle keeps the viz-js notice', () => {
  assert.match(source, /Viz\.js 3\.30\.0/);
});

test('a diagram renders as one sanitized <svg class="graphviz"> with a viewBox and no size', async () => {
  const output = success(await host.render('digraph { a -> b }'));
  const root = /^<svg [^>]*>/.exec(output)![0];
  assert.match(root, /\sclass="graphviz"/);
  assert.match(root, /\sviewBox="[^"]+"/);
  assert.doesNotMatch(root, /\swidth=|\sheight=/);
});

const SOURCES = [
  'digraph { a [style=filled fillcolor="red:blue" URL="javascript:alert(1)"] a -> b }',
  'digraph { rankdir=LR; a [URL="https://graphviz.org/" tooltip="docs"]; a -> b [label="<e>"] }',
  'graph { layout=neato; a -- b -- c -- a }',
  'digraph { n [shape=bogus] }',
  'digraph {\n  x -> ;\n}',
  'digraph { a [label=<<B>bold</I>>] }',
  ''
];

test('every result is the library\'s own, byte for byte, including ids and notes', async () => {
  const expected = libraryRender(SOURCES);
  for (const [index, body] of SOURCES.entries()) {
    assert.deepEqual(await host.render(body), expected[index], body);
  }
});

test('output is deterministic: the wasm memory snapshot is restored after every render', async () => {
  const gradient = SOURCES[0]!;
  const first = success(await host.render(gradient));
  await host.render(SOURCES[1]!);
  await host.render('digraph { g [style=filled fillcolor="green:yellow"] }');
  assert.equal(success(await host.render(gradient)), first);
});

test('a document of fences: sizes in pt, the class, the caption, no javascript: link, ids from the digest', async () => {
  const captioned = fence('graphviz {caption="Pipeline" class="wide"}', SOURCES[0]!, await host.render(SOURCES[0]!));
  const svg = captioned.querySelector('figure.graphviz-figure > svg')!;
  assert.match(svg.getAttribute('width')!, /^[\d.]+pt$/);
  assert.equal(svg.getAttribute('class'), 'graphviz wide');
  assert.equal(captioned.querySelector('figcaption')!.textContent, 'Pipeline');
  // The sanitised diagram carries no javascript: link; the source view beside it quotes the body.
  assert.doesNotMatch(rendering(captioned), /javascript/);
  assert.match(captioned.querySelector('pre > code')!.textContent!, /javascript:alert/);
  assert.match(rendering(captioned), /<linearGradient id="graphviz-[0-9a-f]{8}-/);
});

test('an http link survives as SVG <a xlink:href>, with its tooltip', async () => {
  const wrapper = fence('graphviz', SOURCES[1]!, await host.render(SOURCES[1]!));
  const anchor = wrapper.querySelector('.graphviz-rendering a')!;
  assert.equal(anchor.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(anchor.getAttributeNS('http://www.w3.org/1999/xlink', 'href'), 'https://graphviz.org/');
  assert.equal(anchor.getAttributeNS('http://www.w3.org/1999/xlink', 'title'), 'docs');
});

test('a syntax error is reported with its line, and the line is echoed', async () => {
  const wrapper = fence('graphviz', SOURCES[4]!, await host.render(SOURCES[4]!));
  const text = wrapper.querySelector('.graphviz-error pre')!.textContent!;
  assert.match(text, /^Graphviz error at line 2: syntax error near ';'/);
  assert.match(text, /\n\n2 │ {3}x -> ;$/);
});

test('warnings arrive as notes, heard once per fresh render through the cache', async () => {
  const heard: string[] = [];
  const cache = createCache((body) => host.render(body), 96, (body, result) => {
    if (result.status === 'success') for (const note of result.notes) heard.push(`${body}: ${note}`);
  });
  await cache.render(SOURCES[3]!);
  await cache.render(SOURCES[3]!);
  assert.deepEqual(heard, ['digraph { n [shape=bogus] }: using box for unknown shape bogus']);
});

test('ten concurrent renders each get their own diagram', async () => {
  const bodies = Array.from({ length: 10 }, (_, i) => `digraph { n${i} }`);
  const results = await Promise.all(bodies.map((body) => host.render(body)));
  results.forEach((result, i) => assert.match(success(result), new RegExp(`>n${i}<`)));
});

test('an empty fence is a failure, not an empty image', async () => {
  const result = await host.render('');
  assert.equal(result.status, 'failure');
  if (result.status === 'failure') assert.equal(describe(result, ''), 'Graphviz error: the fence contains no graph');
});

test('dark-theme colours of a real graph read: text on its node and on the page, lines on the page', async () => {
  const { parseColor, contrast, DARK_PAGE, DARK_TEXT } = await import('../src/theme');
  const body = 'digraph { rankdir=LR; node [style=filled]; ' +
    'a [fillcolor=lightyellow URL="https://graphviz.org/" fontcolor="#1a5fb4"]; b [fillcolor=lightblue]; ' +
    'c [fillcolor="#ffd8a8:#a5d8ff"]; d [fillcolor=darkgreen fontcolor=white]; e [style=solid color=yellow fontcolor=orange]; a -> b -> c -> d -> e [color=gold] }';
  const wrapper = fence('graphviz', body, await host.render(body));
  const dark = (element: Element, property: string): ReturnType<typeof parseColor> => {
    const value = /light-dark\((?:[^()]|\([^()]*\))*?,\s*((?:[^()]|\([^()]*\))*)\)/.exec(
      new RegExp(`(?:^|;)${property}:([^;]*)`).exec(element.getAttribute('style') ?? '')?.[1] ?? '')?.[1];
    if (value === undefined) return undefined;
    return value.trim() === 'var(--text-normal)' ? DARK_TEXT : parseColor(value);
  };
  const texts = [...wrapper.querySelectorAll('.graphviz-rendering g.node text')];
  assert.equal(texts.length, 5);
  for (const text of texts) {
    const fill = dark(text, 'fill')!;
    // The node's own shape, when it is filled; otherwise the text sits on the page.
    const box = [...text.parentElement!.children].filter((sibling) => sibling.localName !== 'text')
      .map((sibling) => dark(sibling, 'fill')).find((colour) => colour !== undefined);
    const background = box ?? DARK_PAGE;
    assert.ok(contrast(fill, background) >= 4.5, `${text.textContent}: ${contrast(fill, background).toFixed(2)}`);
  }
  for (const edge of wrapper.querySelectorAll('.graphviz-rendering g.edge path')) {
    assert.ok(contrast(dark(edge, 'stroke')!, DARK_PAGE) >= 3);
  }
});

test('edge labels and labels of unfilled nodes read on the page, cluster labels on their cluster', async () => {
  const { parseColor, contrast, DARK_PAGE, DARK_TEXT } = await import('../src/theme');
  const body = 'digraph { subgraph cluster_a { style=filled; fillcolor=lightgrey; label="cl"; fontcolor=gold; x } ' +
    'y [fontcolor=orange]; z [fontcolor=white]; x -> y [label="edge" fontcolor=darkgreen] }';
  const wrapper = fence('graphviz', body, await host.render(body));
  const darkOf = (style: string): NonNullable<ReturnType<typeof parseColor>> => {
    const value = /fill:light-dark\((?:[^()]|\([^()]*\))*?,\s*((?:[^()]|\([^()]*\))*)\)/.exec(style)![1]!.trim();
    return value === 'var(--text-normal)' ? DARK_TEXT : parseColor(value)!;
  };
  const label = (text: string) => [...wrapper.querySelectorAll('.graphviz-rendering text')].find((t) => t.textContent === text)!;
  for (const text of ['edge', 'y', 'z']) {
    assert.ok(contrast(darkOf(label(text).getAttribute('style')!), DARK_PAGE) >= 4.5, text);
  }
  const cluster = darkOf(label('cl').parentElement!.querySelector('polygon')!.getAttribute('style')!);
  assert.ok(contrast(darkOf(label('cl').getAttribute('style')!), cluster) >= 4.5);
});
