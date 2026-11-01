// The live run: a real Obsidian, launched with a throwaway profile and a throwaway vault holding
// the built plugin and examples/view-toggle.md, driven over the Chrome DevTools Protocol. Covers
// what the unit tests cannot: the processor in Reading view and Live Preview, attributes
// recovered from the note, the worker inside Obsidian, and the toggle's persistence across
// re-render, reopen and plugin reload.
//
// Usage: npm run build && npm run test:live
// Set OBSIDIAN_EXECUTABLE to use an Obsidian other than /Applications/Obsidian.app.
// Screenshots (light and dark, both views) are written to the directory it prints.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = 'graphviz';
const FIXTURE = {
  file: 'examples/view-toggle.md',
  /** Graphviz blocks in the note, in document order. */
  fences: 11,
  /** Positions of the two blocks with identical bodies. */
  twins: [5, 6],
  /** Position of the block with a syntax error. */
  broken: 3,
  /** Position of the block with an https link and a javascript: one. */
  links: 9,
  /** Position of the graph with its own bgcolor. */
  ownBackground: 10
};
const EXECUTABLE = process.env.OBSIDIAN_EXECUTABLE ?? '/Applications/Obsidian.app/Contents/MacOS/Obsidian';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const root = await mkdtemp(join(tmpdir(), `${BASE}-live-`));
const vault = join(root, 'vault');
const shots = join(root, 'screenshots');
const pluginDir = join(vault, '.obsidian', 'plugins', manifest.id);
await mkdir(pluginDir, { recursive: true });
await mkdir(shots);
for (const file of ['main.js', 'manifest.json', 'styles.css']) await cp(file, join(pluginDir, file));
await cp(FIXTURE.file, join(vault, 'view-toggle.md'));
await writeFile(join(vault, 'other.md'), '# Another note\n');
await writeFile(join(vault, '.obsidian', 'community-plugins.json'), JSON.stringify([manifest.id]));
await writeFile(join(vault, '.obsidian', 'app.json'), JSON.stringify({ defaultViewMode: 'preview', livePreview: true }));

const app = spawn(EXECUTABLE, [`--user-data-dir=${join(root, 'profile')}`, '--remote-debugging-port=0'], { stdio: ['ignore', 'ignore', 'pipe'] });
const endpoint = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Obsidian did not open a DevTools port')), 30000);
  app.stderr.on('data', (chunk) => {
    const found = /DevTools listening on (ws:\/\/\S+)/.exec(String(chunk));
    if (found) { clearTimeout(timer); resolve(found[1]); }
  });
  app.on('exit', (code) => reject(new Error(`Obsidian exited with ${code}`)));
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
let page;
const checks = [];
async function check(name, body) {
  await body();
  checks.push(name);
  console.log(`ok ${checks.length} - ${name}`);
}

/** The window whose URL contains `fragment`, once it exists. */
async function windowWith(fragment) {
  for (let i = 0; i < 120; i++) {
    const found = browser.contexts().flatMap((context) => context.pages()).find((p) => p.url().includes(fragment));
    if (found) return found;
    await sleep(250);
  }
  throw new Error(`no window at ${fragment}`);
}

/** Wrapper states in document order: view, key, and what the rendering slot holds. */
const state = (scope) => page.evaluate(({ base, scope }) => {
  const container = scope === 'live'
    ? app.workspace.activeLeaf.view.containerEl.querySelector('.markdown-source-view')
    : app.workspace.activeLeaf.view.containerEl.querySelector('.markdown-reading-view');
  return [...container.querySelectorAll(`.${base}-fence`)].map((fence) => {
    const slot = fence.querySelector(`.${base}-rendering`);
    return {
      view: fence.getAttribute('data-view') ?? 'rendering',
      key: fence.getAttribute('data-fence-key'),
      holds: slot.querySelector(':scope > svg, :scope > figure, :scope > div[role="img"]') ? 'diagram'
        : slot.querySelector(`.${base}-error`) ? 'error'
        : slot.querySelector(`.${base}-loading`) ? 'loading' : 'empty',
      caption: slot.querySelector('figcaption')?.textContent ?? null,
      align: [...(slot.querySelector('figure')?.classList ?? [])].find((name) => name.startsWith(`${base}-align-`)) ?? null,
      alt: slot.querySelector('[role="img"]')?.getAttribute('aria-label') ?? null,
      error: slot.querySelector(`.${base}-error pre`)?.textContent ?? null,
      sourceShown: getComputedStyle(fence.querySelector(':scope > pre')).display !== 'none',
      renderingShown: getComputedStyle(slot).display !== 'none'
    };
  });
}, { base: BASE, scope });

/** Reading view renders sections lazily; scroll through so every block is drawn, and wait until none is loading. */
async function settle(scope, count = FIXTURE.fences) {
  for (let i = 0; i < 80; i++) {
    await page.evaluate((scope) => {
      const view = app.workspace.activeLeaf.view;
      const scroller = scope === 'live'
        ? view.containerEl.querySelector('.cm-scroller')
        : view.containerEl.querySelector('.markdown-preview-view');
      scroller.scrollTop = scroller.scrollHeight;
    }, scope);
    await sleep(100);
    const fences = await state(scope);
    if (fences.length === count && fences.every((fence) => fence.holds !== 'loading' && fence.holds !== 'empty')) {
      return fences;
    }
  }
  const last = await state(scope);
  throw new Error(`${scope}: expected ${count} settled blocks, have ${JSON.stringify(last.map((fence) => fence.holds))}`);
}

const click = (scope, position) => page.evaluate(({ base, scope, position }) => {
  const selector = scope === 'live' ? '.markdown-source-view' : '.markdown-reading-view';
  const container = app.workspace.activeLeaf.view.containerEl.querySelector(selector);
  const button = container.querySelectorAll(`.${base}-fence > .${base}-toggle`)[position];
  button.scrollIntoView({ block: 'center' });
  const rect = button.getBoundingClientRect();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { x, y, hit: hit === button || button.contains(hit) ? null : `${hit?.tagName}.${hit?.className}` };
}, { base: BASE, scope, position }).then(async ({ x, y, hit }) => {
  if (hit) throw new Error(`block ${position}'s toggle is covered by ${hit}`);
  await page.mouse.click(x, y);
  await sleep(50);
});

const setMode = (mode) => page.evaluate(async (mode) => {
  const leaf = app.workspace.activeLeaf;
  const viewState = leaf.getViewState();
  viewState.state.mode = mode === 'live' ? 'source' : 'preview';
  viewState.state.source = false;
  await leaf.setViewState(viewState);
}, mode);

const storedToggles = async () => {
  await sleep(400);
  const data = JSON.parse(await readFile(join(pluginDir, 'data.json'), 'utf8').catch(() => '{}'));
  return data.toggles?.['view-toggle.md'] ?? null;
};

const views = (fences) => fences.map((fence, index) => fence.view === 'source' ? index : -1).filter((index) => index >= 0);

try {
  browser = await chromium.connectOverCDP(endpoint);
  const starter = await windowWith('starter');
  await starter.evaluate((path) => require('electron').ipcRenderer.sendSync('vault-open', path, false), vault);
  page = await windowWith('index.html');
  // Tall enough for the whole note: Reading view keeps only the sections near the viewport.
  await page.setViewportSize({ width: 1200, height: 4000 });
  await page.waitForFunction(() => window.app?.workspace?.layoutReady, null, { timeout: 30000 });
  await page.evaluate(() => app.changeTheme('obsidian'));
  await page.evaluate(async (id) => {
    await app.plugins.setEnable(true);
    await app.plugins.enablePluginAndSave(id);
  }, manifest.id);
  await page.waitForFunction((id) => !!app.plugins.plugins[id], manifest.id, { timeout: 10000 });
  // A fresh vault greets with a modal (trust prompt or welcome); it would sit over every block.
  for (let i = 0; i < 10; i++) {
    const title = await page.evaluate(() => document.querySelector('.modal-container')?.textContent?.slice(0, 80) ?? null);
    if (title === null) break;
    console.log(`# dismissing modal: ${title}`);
    await page.keyboard.press('Escape');
    await sleep(200);
  }
  await page.evaluate(async () => {
    const file = app.vault.getAbstractFileByPath('view-toggle.md');
    await app.workspace.getLeaf(false).openFile(file, { state: { mode: 'preview' } });
  });

  let fences = await settle('reading');
  await check('Reading view draws every graphviz block, wrapped, and no other fence', async () => {
    assert.equal(fences.length, FIXTURE.fences);
    const unclaimed = await page.evaluate((base) => document.querySelectorAll(`.markdown-reading-view pre > code.language-json`).length
      - document.querySelectorAll(`.${base}-fence code.language-json`).length, BASE);
    assert.equal(unclaimed, 1);
    fences.forEach((fence, index) => {
      if (index === FIXTURE.broken) assert.equal(fence.holds, 'error');
      else assert.equal(fence.holds, 'diagram', `block ${index}`);
      assert.equal(fence.view, 'rendering');
      assert.equal(fence.renderingShown, true);
      assert.equal(fence.sourceShown, false);
    });
  });

  await check('attributes are read from the note, including in a list item and a callout', async () => {
    assert.equal(fences[1].caption, 'Figure 1: a small state machine');
    assert.equal(fences[1].align, `${BASE}-align-center`);
    assert.equal(fences[2].alt, 'a two-node graph');
    assert.equal(fences[2].align, `${BASE}-align-right`);
    assert.equal(fences[7].caption, 'Inside a list item');
    assert.equal(fences[8].caption, 'Inside a callout');
    assert.equal(fences[8].align, `${BASE}-align-center`);
    assert.match(fences[FIXTURE.broken].error, /^Graphviz error at line 2: syntax error near ';'/);
    assert.match(fences[FIXTURE.broken].error, /\n\n2 │ {3}a -> ;$/);
  });

  await check('diagrams have their natural width in pt, scaled down to the column', async () => {
    const sizes = await page.evaluate((base) => [...document.querySelectorAll(`.markdown-reading-view .${base}-rendering svg.${base}`)].map((svg) => {
      const column = svg.closest(`.${base}-fence`).getBoundingClientRect().width;
      return { width: svg.getAttribute('width'), shown: svg.getBoundingClientRect().width, column };
    }), BASE);
    assert.equal(sizes.length, FIXTURE.fences - 1);
    for (const size of sizes) {
      assert.match(size.width, /^[\d.]+pt$/);
      assert.ok(size.shown <= size.column + 0.5, JSON.stringify(size));
    }
    // The two-node graph keeps its own size rather than stretching to the column.
    assert.ok(sizes[2].shown < sizes[2].column / 2, JSON.stringify(sizes[2]));
  });

  await check('diagrams take dark-theme colours by default, readable on the page, and the setting keeps the white card', async () => {
    // Section 9's graph: link text on a lightyellow node, black text on a lightblue one, a dark green
    // edge label and black edges on the page. Section 5's: black text on a 0xf0f4ff box.
    const look = () => page.evaluate(({ base, links, own }) => {
      const fences = document.querySelectorAll(`.markdown-reading-view .${base}-fence`);
      const svg = fences[links].querySelector(`svg.${base}`);
      const text = (root, words) => [...root.querySelectorAll('text')].find((one) => one.textContent === words);
      const fill = (element) => getComputedStyle(element).fill;
      const boxOf = (label) => fill(label.parentElement.querySelector('polygon, ellipse, path'));
      const link = text(svg, 'graphviz.org');
      const plain = text(svg, 'script link');
      const tall = [...fences].map((fence) => fence.querySelector(`svg.${base}`)).find((one) => one?.textContent.includes('sanitize'));
      const parse = text(tall, 'parse');
      const ownSvg = fences[own].querySelector(`svg.${base}`);
      const css = getComputedStyle(svg);
      return {
        background: css.backgroundColor, filter: css.filter, scheme: css.colorScheme,
        page: getComputedStyle(document.querySelector('.markdown-reading-view .markdown-preview-view')).backgroundColor,
        backdrop: fill(svg.querySelector(':scope > g.graph > polygon')),
        link: fill(link), linkBox: boxOf(link), plain: fill(plain), plainBox: boxOf(plain),
        edgeLabel: fill(text(svg, 'follows')), edge: getComputedStyle(svg.querySelector('g.edge path')).stroke,
        parse: fill(parse), parseBox: boxOf(parse),
        own: { scheme: getComputedStyle(ownSvg).colorScheme, background: getComputedStyle(ownSvg).backgroundColor,
          backdrop: fill(ownSvg.querySelector(':scope > g.graph > polygon')), text: fill(text(ownSvg, 'sea')), box: boxOf(text(ownSvg, 'sea')) }
      };
    }, { base: BASE, links: FIXTURE.links, own: FIXTURE.ownBackground });
    const channels = (css) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (css) => {
      const [r, g, b] = channels(css).map((c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (x, y) => { const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
    const reads = (text, on, target, what) => assert.ok(contrast(text, on) >= target, `${what}: ${text} on ${on} is ${contrast(text, on).toFixed(2)}`);
    const own = { scheme: 'light', background: 'rgba(0, 0, 0, 0)', backdrop: 'rgb(29, 53, 87)', text: 'rgb(29, 53, 87)', box: 'rgb(241, 250, 238)' };
    const followed = await look();
    assert.equal(followed.background, 'rgba(0, 0, 0, 0)');
    assert.equal(followed.filter, 'none');
    assert.equal(followed.scheme, 'dark');
    assert.equal(followed.backdrop, 'none');
    reads(followed.link, followed.linkBox, 4.5, 'link text on its lightyellow node');
    reads(followed.plain, followed.plainBox, 4.5, 'text on its lightblue node');
    reads(followed.parse, followed.parseBox, 4.5, 'text on its pale box');
    reads(followed.edgeLabel, followed.page, 4.5, 'dark green edge label on the page');
    reads(followed.edge, followed.page, 3, 'edge on the page');
    assert.ok(luminance(followed.linkBox) < 0.1 && luminance(followed.parseBox) < 0.1, `pale boxes go dark: ${followed.linkBox}, ${followed.parseBox}`);
    assert.deepEqual(followed.own, own, 'an author\'s bgcolor keeps its exact colours');
    await page.evaluate((id) => app.plugins.plugins[id].updateSettings({ followDarkTheme: false }), manifest.id);
    const card = await look();
    assert.equal(card.background, 'rgb(255, 255, 255)');
    assert.equal(card.backdrop, 'rgb(255, 255, 255)');
    assert.equal(card.link, 'rgb(26, 95, 180)', 'the author\'s own colour, exactly');
    assert.equal(card.linkBox, 'rgb(255, 255, 224)');
    assert.equal(card.plainBox, 'rgb(173, 216, 230)');
    assert.equal(card.edgeLabel, 'rgb(0, 100, 0)');
    assert.deepEqual(card.own, own);
    await page.screenshot({ path: join(shots, 'reading-dark-card.png') });
    await page.evaluate((id) => app.plugins.plugins[id].updateSettings({ followDarkTheme: true }), manifest.id);
    assert.equal((await look()).scheme, 'dark');
  });

  await check('a diagram link keeps its https href, loses its javascript: one, and opens through window.open', async () => {
    const links = await page.evaluate(({ base, position }) => {
      const fence = document.querySelectorAll(`.markdown-reading-view .${base}-fence`)[position];
      return [...fence.querySelectorAll(`.${base}-rendering a`)].map((a) => ({
        ns: a.namespaceURI,
        href: a.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? a.getAttribute('href')
      }));
    }, { base: BASE, position: FIXTURE.links });
    assert.deepEqual(links, [{ ns: 'http://www.w3.org/2000/svg', href: 'https://graphviz.org/' }]);
    const html = await page.evaluate(() => document.querySelector('.markdown-reading-view').innerHTML);
    assert.doesNotMatch(html.replace(/<pre>[^]*?<\/pre>/g, ''), /href="javascript:/);
    const point = await page.evaluate(({ base, position }) => {
      const fence = document.querySelectorAll(`.markdown-reading-view .${base}-fence`)[position];
      const text = fence.querySelector(`.${base}-rendering a text`);
      text.scrollIntoView({ block: 'center' });
      window.__opened = [];
      window.__open = window.open;
      window.open = (...args) => { window.__opened.push(args); return null; };
      window.__before = location.href;
      const rect = text.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    }, { base: BASE, position: FIXTURE.links });
    await page.mouse.click(point.x, point.y);
    await sleep(300);
    const opened = await page.evaluate(() => {
      window.open = window.__open;
      return { calls: window.__opened, same: location.href === window.__before };
    });
    assert.deepEqual(opened.calls, [['https://graphviz.org/', '_blank', 'noopener']]);
    assert.equal(opened.same, true);
  });

  await check('identical bodies share a fence key', async () => {
    const [a, b] = FIXTURE.twins;
    assert.equal(fences[a].key, fences[b].key);
    assert.equal(new Set(fences.map((fence) => fence.key)).size, FIXTURE.fences - 1);
  });

  await page.screenshot({ path: join(shots, 'reading-dark.png') });

  const [first, second] = FIXTURE.twins;
  await check('a click flips only that block, and a second click flips it back', async () => {
    await click('reading', second);
    fences = await state('reading');
    assert.deepEqual(views(fences), [second]);
    assert.equal(fences[second].sourceShown, true);
    assert.equal(fences[second].renderingShown, false);
    await click('reading', FIXTURE.broken);
    await click('reading', FIXTURE.broken);
    assert.deepEqual(views(await state('reading')), [second]);
    assert.deepEqual(await storedToggles(), [{ key: fences[second].key, ordinal: 1, index: second }]);
  });

  await page.screenshot({ path: join(shots, 'reading-flipped.png') });

  await check('a flip survives a re-render of the view', async () => {
    await page.evaluate(() => app.workspace.activeLeaf.view.previewMode.rerender(true));
    assert.deepEqual(views(await settle('reading')), [second]);
  });

  await check('a flip survives closing and reopening the note', async () => {
    await page.evaluate(async () => {
      const leaf = app.workspace.activeLeaf;
      await leaf.openFile(app.vault.getAbstractFileByPath('other.md'));
      await leaf.openFile(app.vault.getAbstractFileByPath('view-toggle.md'), { state: { mode: 'preview' } });
    });
    assert.deepEqual(views(await settle('reading')), [second]);
  });

  await check('a flip survives reloading the plugin', async () => {
    await page.evaluate(async (id) => {
      await app.plugins.disablePlugin(id);
      await app.plugins.enablePlugin(id);
    }, manifest.id);
    await page.evaluate(() => app.workspace.activeLeaf.view.previewMode.rerender(true));
    assert.deepEqual(views(await settle('reading')), [second]);
  });

  await check('Live Preview always shows the diagram and leaves the corner to Obsidian\'s edit button', async () => {
    await setMode('live');
    const live = await settle('live');
    assert.equal(live[8].caption, 'Inside a callout');
    // The flip saved in Reading view does not apply here, as Mermaid has no source view either.
    live.forEach((fence, index) => {
      assert.equal(fence.renderingShown, true, `block ${index}`);
      assert.equal(fence.sourceShown, false, `block ${index}`);
    });
    const corner = await page.evaluate((base) => {
      const block = document.querySelectorAll('.markdown-source-view .cm-preview-code-block')[0];
      block.scrollIntoView({ block: 'center' });
      const toggle = block.querySelector(`.${base}-toggle`);
      const edit = block.querySelector('.edit-block-button').getBoundingClientRect();
      return { toggle: getComputedStyle(toggle).display, x: edit.left + edit.width / 2, y: edit.top + edit.height / 2 };
    }, BASE);
    assert.equal(corner.toggle, 'none');
    await page.mouse.move(corner.x, corner.y);
    await sleep(200);
    const under = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.edit-block-button'), corner);
    assert.equal(under, true);
  });

  await page.screenshot({ path: join(shots, 'live-dark.png') });

  await check('Obsidian\'s edit button opens the fence for editing, as for Mermaid', async () => {
    await page.evaluate(() => app.workspace.activeLeaf.view.editor.setCursor({ line: 0, ch: 0 }));
    await sleep(200);
    const button = await page.evaluate(() => {
      const block = document.querySelectorAll('.markdown-source-view .cm-preview-code-block')[0];
      block.scrollIntoView({ block: 'center' });
      const r = block.querySelector('.edit-block-button').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(button.x, button.y);
    await sleep(150);
    await page.mouse.click(button.x, button.y);
    await sleep(300);
    const editing = await page.evaluate(() => {
      const editor = app.workspace.activeLeaf.view.editor;
      return { line: editor.getLine(editor.getCursor().line - 1), selection: editor.getSelection() };
    });
    assert.match(editing.line, /^```graphviz/);
    assert.match(editing.selection, /source -> parse -> layout -> render/);
    await page.evaluate(() => app.workspace.activeLeaf.view.editor.setCursor({ line: 0, ch: 0 }));
  });

  await check('in Reading view the button appears on hover, dressed as Obsidian\'s, and names what it shows', async () => {
    await setMode('reading');
    const fences = await settle('reading');
    assert.deepEqual(views(fences), [second]);
    const look = (position) => page.evaluate(({ base, position }) => {
      const fence = document.querySelectorAll(`.markdown-reading-view .${base}-fence`)[position];
      const button = fence.querySelector(`.${base}-toggle`);
      const f = fence.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return { opacity: style.opacity, background: style.backgroundColor, label: button.getAttribute('aria-label'),
        inset: [Math.round(f.right - b.right), Math.round(b.top - f.top)], size: [Math.round(b.width), Math.round(b.height)] };
    }, { base: BASE, position });
    await page.mouse.move(1, 1);
    await sleep(200);
    const away = await look(first);
    assert.equal(away.opacity, '0');
    assert.equal(away.label, 'Show source');
    assert.deepEqual(away.inset, [4, 4]);
    assert.deepEqual(away.size, [28, 24]);
    assert.equal(away.background, 'rgba(0, 0, 0, 0)');
    const box = await page.evaluate(({ base, position }) => {
      const fence = document.querySelectorAll(`.markdown-reading-view .${base}-fence`)[position];
      fence.scrollIntoView({ block: 'center' });
      const r = fence.getBoundingClientRect();
      return { x: r.left + 40, y: r.top + r.height / 2 };
    }, { base: BASE, position: first });
    await page.mouse.move(box.x, box.y);
    await sleep(200);
    assert.equal((await look(first)).opacity, '1');
    await page.screenshot({ path: join(shots, 'reading-hover-button.png'), clip: { x: box.x - 40, y: box.y - 120, width: 760, height: 240 } });
    assert.equal((await look(second)).label, 'Show diagram');
  });

  await page.screenshot({ path: join(shots, 'reading-hover.png') });

  await check('a flip reaches the same note open in a second Reading view, and flipping back clears the saved data', async () => {
    await page.evaluate(async () => {
      const file = app.vault.getAbstractFileByPath('view-toggle.md');
      const original = app.workspace.activeLeaf;
      const split = app.workspace.getLeaf('split');
      await split.openFile(file, { state: { mode: 'preview' } });
      app.workspace.setActiveLeaf(original, { focus: true });
    });
    await sleep(1500);
    const otherViews = () => page.evaluate((base) => {
      const leaves = app.workspace.getLeavesOfType('markdown').filter((leaf) => leaf !== app.workspace.activeLeaf);
      return [...leaves[0].view.containerEl.querySelectorAll(`.markdown-reading-view .${base}-fence`)]
        .flatMap((fence, index) => fence.getAttribute('data-view') === 'source' ? [index] : []);
    }, BASE);
    assert.deepEqual(await otherViews(), [second]);
    await click('reading', second);
    assert.deepEqual(views(await state('reading')), []);
    await sleep(300);
    assert.deepEqual(await otherViews(), []);
    assert.equal(await storedToggles(), null);
    await page.evaluate(() => {
      for (const leaf of app.workspace.getLeavesOfType('markdown')) if (leaf !== app.workspace.activeLeaf) leaf.detach();
    });
    // Closing the split widens the remaining view, which Obsidian lays out again; let it settle
    // before the next check clicks a toggle.
    await sleep(500);
    await settle('reading');
  });

  await check('the command shows every diagram in the note again', async () => {
    await click('reading', FIXTURE.broken);
    assert.deepEqual(views(await state('reading')), [FIXTURE.broken]);
    await page.evaluate((id) => app.commands.executeCommandById(`${id}:reset-source-views`), manifest.id);
    assert.deepEqual(views(await state('reading')), []);
    assert.equal(await storedToggles(), null);
  });

  await check('the light theme draws the same', async () => {
    await page.evaluate(() => app.changeTheme('moonstone'));
    const light = await settle('reading');
    const lightLook = await page.evaluate((base) => {
      const svg = document.querySelector(`.markdown-reading-view svg.${base}`);
      return { scheme: getComputedStyle(svg).colorScheme, filter: getComputedStyle(svg).filter,
        text: getComputedStyle(svg.querySelector('text')).fill, background: getComputedStyle(svg).backgroundColor };
    }, BASE);
    assert.deepEqual(lightLook, { scheme: 'light', filter: 'none', text: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)' });
    assert.equal(light.filter((fence) => fence.holds === 'diagram').length, FIXTURE.fences - 1);
    assert.deepEqual(views(light), []);
    await page.screenshot({ path: join(shots, 'reading-light.png') });
  });

  await check('with Live Preview drawn beside it, every gradient and clip reference resolves inside its own diagram', async () => {
    const report = await page.evaluate((base) => {
      const svgs = [...document.querySelectorAll(`.${base}-rendering svg.${base}`)];
      const ids = svgs.flatMap((svg) => [...svg.querySelectorAll('[id]')].map((element) => element.id));
      let references = 0;
      const stray = [];
      for (const svg of svgs.filter((svg) => svg.closest('.markdown-reading-view'))) {
        for (const element of svg.querySelectorAll('*')) {
          for (const attribute of element.attributes) {
            const id = /^url\(#(.+)\)$/.exec(attribute.value)?.[1];
            if (!id) continue;
            references++;
            if (document.getElementById(id)?.closest(`svg.${base}`) !== svg) stray.push(id);
          }
        }
      }
      return { drawings: svgs.length, duplicates: ids.length - new Set(ids).size, references, stray };
    }, BASE);
    assert.ok(report.drawings > FIXTURE.fences, JSON.stringify(report));
    assert.ok(report.references > 0, JSON.stringify(report));
    assert.equal(report.duplicates, 0);
    assert.deepEqual(report.stray, []);
  });

  await check('the renderer runs in a browser Worker and stops with the plugin', async () => {
    const stopped = await page.evaluate(async (id) => {
      const plugin = app.plugins.plugins[id];
      const host = plugin.host;
      await app.plugins.disablePlugin(id);
      return { hadHost: !!host, after: await host.render('digraph { a }') };
    }, manifest.id);
    assert.equal(stopped.hadHost, true);
    assert.deepEqual(stopped.after, { status: 'unavailable', reason: 'the renderer was stopped' });
  });

  console.log(`\n${checks.length} live checks passed. Screenshots: ${shots}`);
} catch (error) {
  await page?.screenshot({ path: 'test-live-failure.png' }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  app.kill();
  await sleep(500);
  await rm(join(root, 'profile'), { recursive: true, force: true }).catch(() => {});
}
