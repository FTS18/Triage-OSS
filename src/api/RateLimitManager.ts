/**
 * Manages GitHub API rate limit state, parsed from response headers.
 *
 * `rateLimitBuffer` — the minimum remaining credits before we pause and wait
 * for the reset window. Injected from VS Code config so users can tune it
 * (e.g. raise to 50 if sharing a PAT across workspaces).
 *
 * The initial `remaining = 5000` assumption means we fire requests freely
 * until the first real response corrects the value — safe because 5000 is
 * the actual default GitHub GraphQL budget per hour.
 */
export class RateLimitManager {
    private remaining = 5000;
    private resetAt = 0;

    constructor(private readonly buffer: number = 10) {}

    updateFromHeaders(headers: Record<string, string>): void {
        const remaining = headers['x-ratelimit-remaining'];
        const reset = headers['x-ratelimit-reset'];
        if (remaining !== undefined) { this.remaining = parseInt(remaining, 10); }
        if (reset !== undefined) { this.resetAt = parseInt(reset, 10) * 1000; }
    }

    async waitIfNeeded(): Promise<void> {
        if (this.remaining > this.buffer) { return; }
        // Wait until the reset window expires, plus 1s safety margin
        const waitMs = Math.max(0, this.resetAt - Date.now()) + 1000;
        await new Promise(resolve => setTimeout(resolve, waitMs));
    }
}
