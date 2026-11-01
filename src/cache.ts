import type { RenderResult } from '@reonarudo/graphviz-renderer';

export interface CachedRender {
  render(source: string): Promise<RenderResult>;
  clear(): void;
}

/**
 * Remember recent results by fence body, as graphviz-diagram-preview's `createRenderer` does
 * (96 entries, least recently used evicted first). Obsidian runs a code block processor again
 * whenever a section is re-rendered (scrolling, switching views, an edit elsewhere in the note),
 * so without this every pass would lay the graph out again. Identical bodies rendered at the same
 * time share one render. Failures and timeouts are cached: a graph too dense to lay out is not
 * retried until its source changes. `unavailable` is not, so a restarted renderer gets another
 * chance. `onFresh` hears every real render, never a cache hit, so notes are logged once.
 */
export function createCache(
  render: (source: string) => Promise<RenderResult>,
  max = 96,
  onFresh: (source: string, result: RenderResult) => void = () => {}
): CachedRender {
  const entries = new Map<string, Promise<RenderResult>>();
  return {
    render(source) {
      const hit = entries.get(source);
      if (hit) {
        // Most recently used goes last; the first key is evicted first.
        entries.delete(source);
        entries.set(source, hit);
        return hit;
      }
      const pending = render(source);
      entries.set(source, pending);
      if (entries.size > max) entries.delete(entries.keys().next().value!);
      pending.then((result) => {
        onFresh(source, result);
        if (result.status === 'unavailable' && entries.get(source) === pending) entries.delete(source);
      }, () => {
        if (entries.get(source) === pending) entries.delete(source);
      });
      return pending;
    },
    clear() {
      entries.clear();
    }
  };
}
