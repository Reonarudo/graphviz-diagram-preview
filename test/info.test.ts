import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locate, scanFences } from '../src/info';

test('finds graphviz fences with their line, info string and body', () => {
  const text = '# T\n\n```graphviz {caption="c"}\nbox\narrow\n```\n\ntext\n\n~~~graphviz\ncircle\n~~~\n';
  assert.deepEqual(scanFences(text, 'graphviz'), [
    { line: 2, info: 'graphviz {caption="c"}', body: 'box\narrow' },
    { line: 9, info: 'graphviz', body: 'circle' }
  ]);
});

test('only the first word of the info string names the language, as in Obsidian', () => {
  const text = '```Graphviz\na\n```\n```graphviz2\nb\n```\n```graphviz extra\nc\n```\n``` graphviz\nd\n```';
  assert.deepEqual(scanFences(text, 'graphviz').map((f) => f.body), ['c', 'd']);
});

test('a graphviz fence quoted inside another fence is not a fence', () => {
  const text = '````markdown\n```graphviz\nbox\n```\n````\n\n```graphviz\nreal\n```';
  assert.deepEqual(scanFences(text, 'graphviz').map((f) => f.body), ['real']);
});

test('a closing fence must use the same character and be at least as long', () => {
  const text = '````graphviz\nbox\n```\n~~~~\n````\n';
  assert.deepEqual(scanFences(text, 'graphviz'), [{ line: 0, info: 'graphviz', body: 'box\n```\n~~~~' }]);
});

test('a backtick fence whose info contains a backtick is not a fence', () => {
  assert.deepEqual(scanFences('```graphviz `x`\nbox\n```', 'graphviz'), []);
});

test('an unclosed fence runs to the end of the note', () => {
  assert.deepEqual(scanFences('```graphviz\nbox\narrow', 'graphviz'), [{ line: 0, info: 'graphviz', body: 'box\narrow' }]);
});

test('fences in blockquotes and list items lose their container prefix', () => {
  const quoted = '> ```graphviz {alt="q"}\n> box\n> ```\n';
  assert.deepEqual(scanFences(quoted, 'graphviz'), [{ line: 0, info: 'graphviz {alt="q"}', body: 'box' }]);
  const nested = '- item\n\n    ```graphviz\n    box\n      indented\n    ```\n';
  assert.deepEqual(scanFences(nested, 'graphviz'), [{ line: 2, info: 'graphviz', body: 'box\n  indented' }]);
  // Leaving the blockquote closes the fence.
  assert.deepEqual(scanFences('> ```graphviz\n> box\nafter', 'graphviz'), [{ line: 0, info: 'graphviz', body: 'box' }]);
});

test('CRLF line endings are handled', () => {
  assert.deepEqual(scanFences('```graphviz\r\nbox\r\n```\r\n', 'graphviz'), [{ line: 0, info: 'graphviz', body: 'box' }]);
});

test('locate picks the fence in the section, or the matching body when a section holds several', () => {
  const fences = scanFences('```graphviz\na\n```\n- x\n  ```graphviz\n  b\n  ```\n- y\n  ```graphviz\n  c\n  ```\n', 'graphviz');
  assert.equal(locate(fences, 0, 2, 'a'), 0);
  assert.equal(locate(fences, 3, 10, 'c\n'), 2);
  assert.equal(locate(fences, 3, 10, 'b'), 1);
  // No body matches: the first in range.
  assert.equal(locate(fences, 3, 10, 'zzz'), 1);
  assert.equal(locate(fences, 20, 30, 'a'), -1);
});
