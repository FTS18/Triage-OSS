import * as vscode from 'vscode';

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

export class CacheManager {
    private readonly memory = new Map<string, CacheEntry<unknown>>();

    constructor(private readonly store: vscode.Memento) {}

    get<T>(key: string): T | undefined {
        const mem = this.memory.get(key) as CacheEntry<T> | undefined;
        if (mem && mem.expiresAt > Date.now()) { return mem.data; }

        const persisted = this.store.get<CacheEntry<T>>(key);
        if (persisted && persisted.expiresAt > Date.now()) { return persisted.data; }

        return undefined;
    }

    set<T>(key: string, data: T, ttlSeconds: number): void {
        const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttlSeconds * 1000 };
        this.memory.set(key, entry);
        this.store.update(key, entry);
    }

    invalidate(key: string): void {
        this.memory.delete(key);
        this.store.update(key, undefined);
    }
}
