import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAttributes } from '../src/attributes';

test('a bare fence has no attributes and nothing to report', () => {
  assert.deepEqual(parseAttributes('graphviz'), { attributes: {}, diagnostics: [] });
});

test('reads every supported key, in any order', () => {
  const { attributes, diagnostics } = parseAttributes(
    'graphviz {caption="Figure 1: Sine wave" alt="Sine curve" align="center" class="wide"}'
  );
  assert.deepEqual(attributes, {
    caption: 'Figure 1: Sine wave',
    alt: 'Sine curve',
    align: 'center',
    class: 'wide'
  });
  assert.deepEqual(diagnostics, []);
});

test('accepts single or double quotes and unescapes quotes and backslashes', () => {
  assert.equal(parseAttributes(`graphviz {alt='a "quoted" word'}`).attributes.alt, 'a "quoted" word');
  assert.equal(parseAttributes(`graphviz {alt="it's"}`).attributes.alt, "it's");
  assert.equal(parseAttributes(`graphviz {alt='it\\'s'}`).attributes.alt, "it's");
  assert.equal(parseAttributes('graphviz {alt="a \\"quote\\""}').attributes.alt, 'a "quote"');
  assert.equal(parseAttributes('graphviz {alt="back\\\\slash"}').attributes.alt, 'back\\slash');
});

test('an unknown key is dropped and the rest is honoured', () => {
  const { attributes, diagnostics } = parseAttributes('graphviz {algin="center" alt="kept"}');
  assert.deepEqual(attributes, { alt: 'kept' });
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0]!, /algin/);
});

test('an unknown alignment is dropped and the rest is honoured', () => {
  const { attributes, diagnostics } = parseAttributes('graphviz {align="middle" alt="kept"}');
  assert.deepEqual(attributes, { alt: 'kept' });
  assert.match(diagnostics[0]!, /middle/);
});

test('a duplicate key keeps the first value', () => {
  const { attributes, diagnostics } = parseAttributes('graphviz {alt="first" alt="second"}');
  assert.equal(attributes.alt, 'first');
  assert.match(diagnostics[0]!, /Duplicate/);
});

test('a malformed block is dropped whole, never partially applied', () => {
  for (const info of [
    'graphviz {alt="unterminated',
    'graphviz {alt="ok" caption=unquoted}',
    'graphviz {alt="ok" garbage}',
    'graphviz {alt="ok"',
    'graphviz alt="ok"',
    'graphviz {'
  ]) {
    const { attributes, diagnostics } = parseAttributes(info);
    assert.deepEqual(attributes, {}, info);
    assert.equal(diagnostics.length, 1, info);
  }
});

test('never throws, whatever the info string', () => {
  const inputs = [
    'graphviz', 'graphviz {}', 'graphviz {   }', 'graphviz {"}', "graphviz {'''}", 'graphviz {a=}',
    'graphviz {=""}', 'graphviz {alt=""}', 'graphviz {' + 'a="b" '.repeat(500) + '}',
    'graphviz {alt="' + '\\'.repeat(100) + '"}', 'graphviz {alt="\u0000￿"}'
  ];
  for (const info of inputs) {
    assert.doesNotThrow(() => parseAttributes(info), info);
  }
});

test('an empty value is a value, not a missing attribute', () => {
  assert.deepEqual(parseAttributes('graphviz {alt=""}').attributes, { alt: '' });
});
