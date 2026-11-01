import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RenderResult } from '@reonarudo/graphviz-renderer';
import { createCache } from '../src/cache';

const ok = (source: string): RenderResult => ({ status: 'success', output: `<svg>${source}</svg>`, notes: [] });

test('renders once per body, sharing a render still in flight', async () => {
  const calls: string[] = [];
  const cache = createCache(async (source) => { calls.push(source); return ok(source); });
  const [a, b] = await Promise.all([cache.render('box'), cache.render('box')]);
  assert.deepEqual(a, b);
  await cache.render('box');
  assert.deepEqual(calls, ['box']);
});

test('failures and timeouts are cached, unavailable and rejections are not', async () => {
  const calls: string[] = [];
  const results: Record<string, RenderResult> = {
    f: { status: 'failure', message: 'no' },
    t: { status: 'timeout', budget: 1 },
    u: { status: 'unavailable', reason: 'down' }
  };
  const cache = createCache(async (source) => {
    calls.push(source);
    if (source === 'x') throw new Error('bug');
    return results[source]!;
  });
  for (const source of ['f', 't', 'u', 'f', 't', 'u']) await cache.render(source);
  await assert.rejects(cache.render('x'));
  await assert.rejects(cache.render('x'));
  assert.deepEqual(calls, ['f', 't', 'u', 'u', 'x', 'x']);
});

test('the least recently used body is evicted first', async () => {
  const calls: string[] = [];
  const cache = createCache(async (source) => { calls.push(source); return ok(source); }, 2);
  await cache.render('a');
  await cache.render('b');
  await cache.render('a');
  await cache.render('c');
  await cache.render('a');
  await cache.render('b');
  assert.deepEqual(calls, ['a', 'b', 'c', 'b']);
});

test('clear forgets everything', async () => {
  const calls: string[] = [];
  const cache = createCache(async (source) => { calls.push(source); return ok(source); });
  await cache.render('a');
  cache.clear();
  await cache.render('a');
  assert.deepEqual(calls, ['a', 'a']);
});

test('onFresh hears each real render once, never a cache hit, and an unavailable render each time it is retried', async () => {
  const heard: string[] = [];
  const results: Record<string, RenderResult> = {
    ok: { status: 'success', output: '<svg/>', notes: ['line 1: a warning'] },
    t: { status: 'timeout', budget: 3000 },
    u: { status: 'unavailable', reason: 'down' }
  };
  const cache = createCache(async (source) => results[source]!, 96, (source, result) => heard.push(`${source}:${result.status}`));
  for (const source of ['ok', 'ok', 't', 't', 'u', 'u']) await cache.render(source);
  await Promise.all([cache.render('ok'), cache.render('ok')]);
  assert.deepEqual(heard, ['ok:success', 't:timeout', 'u:unavailable', 'u:unavailable']);
});
