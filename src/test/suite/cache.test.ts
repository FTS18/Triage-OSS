import * as assert from 'assert';
import { CacheManager } from '../../cache/CacheManager';

class MockStore {
    private readonly data = new Map<string, unknown>();
    get<T>(key: string): T | undefined { return this.data.get(key) as T; }
    update(key: string, value: unknown): Thenable<void> { this.data.set(key, value); return Promise.resolve(); }
    keys(): readonly string[] { return [...this.data.keys()]; }
}

suite('CacheManager', () => {
    test('returns undefined for a missing key', () => {
        const cache = new CacheManager(new MockStore() as never);
        assert.strictEqual(cache.get('missing'), undefined);
    });

    test('returns data within TTL', () => {
        const cache = new CacheManager(new MockStore() as never);
        cache.set('key', { value: 42 }, 60);
        const result = cache.get<{ value: number }>('key');
        assert.strictEqual(result?.value, 42);
    });

    test('returns undefined after invalidation', () => {
        const cache = new CacheManager(new MockStore() as never);
        cache.set('key', 'hello', 60);
        cache.invalidate('key');
        assert.strictEqual(cache.get('key'), undefined);
    });
});
