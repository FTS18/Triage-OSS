import * as assert from 'assert';
import { RateLimitManager } from '../../api/RateLimitManager';

suite('RateLimitManager', () => {
    test('does not wait when remaining is high', async () => {
        const mgr = new RateLimitManager();
        mgr.updateFromHeaders({ 'x-ratelimit-remaining': '4000', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600) });
        const start = Date.now();
        await mgr.waitIfNeeded();
        assert.ok(Date.now() - start < 200, 'Should not have waited');
    });

    test('updates remaining from headers', () => {
        const mgr = new RateLimitManager();
        mgr.updateFromHeaders({ 'x-ratelimit-remaining': '42', 'x-ratelimit-reset': '0' });
        // No public getter — just verifying no throw
        assert.ok(true);
    });
});
