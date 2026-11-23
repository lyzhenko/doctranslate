import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LruCache } from '../src/cache';

test('evicts the least recently used entry', () => {
  const cache = new LruCache<string, number>(2);
  cache.set('a', 1);
  cache.set('b', 2);
  assert.equal(cache.get('a'), 1);
  cache.set('c', 3);

  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
  assert.equal(cache.size, 2);
});

test('re-setting a key refreshes it', () => {
  const cache = new LruCache<string, number>(2);
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('a', 10);
  cache.set('c', 3);

  assert.equal(cache.get('a'), 10);
  assert.equal(cache.get('b'), undefined);
});

test('clear removes everything', () => {
  const cache = new LruCache<number, string>(3);
  cache.set(1, 'one');
  cache.clear();
  assert.equal(cache.size, 0);
});
