import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setsBackground } from '../src/background';

test('a root-graph bgcolor, as a statement or in graph [...], is the author\'s background', () => {
  for (const source of [
    'digraph { bgcolor=lightblue; a -> b }',
    'digraph {\n  bgcolor = "#202020"\n  a\n}',
    'graph G { graph [rankdir=LR bgcolor="white"]; a -- b }',
    'strict digraph "x" { GRAPH [ BGCOLOR = red ] a }',
    'digraph { a; bgcolor="red:blue" }'
  ]) assert.equal(setsBackground(source), true, source);
});

test('bgcolor anywhere else does not count', () => {
  for (const source of [
    'digraph { a -> b }',
    'digraph { subgraph cluster_x { bgcolor=lightgrey; a } b }',
    'digraph { subgraph s { graph [bgcolor=red] a } }',
    'digraph { node [bgcolor=red]; a [label="bgcolor=red"] }',
    'digraph { a [label=<<b>bgcolor=red</b>>] }',
    'digraph {\n// bgcolor=red\n/* bgcolor=red */\n#bgcolor=red\n a }',
    'digraph { a [bgcolor=red] }',
    'digraph { mybgcolor=red; bgcolors=red }',
    ''
  ]) assert.equal(setsBackground(source), false, source);
});
