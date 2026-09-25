import { afterEach, describe, expect, it } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';

// happy-dom 20.9.0 held each observer's dispatch callback only through a
// WeakRef to an inline closure, so a garbage collection between two
// mutations silently dropped every record after it (fixed upstream in
// 20.11.2, task #2264). The annotator's dialog-layer tests hit this as a
// GC-timing flake: whole-file runs collected the closure between "close"
// and "reopen", so the reopen never reflowed. Forcing a GC here turns that
// coin flip into a deterministic gate on the environment.
function forceGc(): void {
  v8.setFlagsFromString('--expose-gc');
  (vm.runInNewContext('gc') as () => void)();
}

// A macrotask boundary, not just microtasks: WeakRef.deref() keeps its target
// alive until the current task ends, and the annotator crosses that boundary
// through requestAnimationFrame. Records deliver on a microtask, so this also
// covers delivery.
function task(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('test environment: MutationObserver delivery survives garbage collection', () => {
  let observer: MutationObserver | null = null;
  afterEach(() => {
    observer?.disconnect();
    observer = null;
    document.body.innerHTML = '';
  });

  it('delivers a mutation made after a GC to an observer that already reported once', async () => {
    const batches: number[] = [];
    observer = new MutationObserver((records) => batches.push(records.length));
    observer.observe(document.body, { childList: true, subtree: true });

    document.body.insertAdjacentHTML('beforeend', '<div class="a"></div>');
    await task();
    expect(batches).toEqual([1]);

    forceGc();

    document.body.insertAdjacentHTML('beforeend', '<div class="b"></div>');
    await task();
    expect(batches).toEqual([1, 1]);
  });
});
