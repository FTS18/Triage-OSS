import { BountyInfo } from '../domain/types';

export interface IBountyFetcher {
    fetchBounties(): Promise<Map<string, BountyInfo>>;
}

interface AlgoraIssue {
    github_url: string;
    total_prize_amount: number;
    currency: string;
    url: string;
}

export class AlgoraFetcher implements IBountyFetcher {
    async fetchBounties(): Promise<Map<string, BountyInfo>> {
        const map = new Map<string, BountyInfo>();
        try {
            const res = await fetch('https://console.algora.io/api/bounties?state=open&limit=100');
            if (!res.ok) { return map; }
            const data = await res.json() as { data: AlgoraIssue[] };
            for (const item of data.data ?? []) {
                if (!item.github_url) { continue; }
                map.set(item.github_url, {
                    amount: item.total_prize_amount,
                    currency: item.currency ?? 'USD',
                    platform: 'Algora',
                    url: item.url,
                });
            }
        } catch {
            // Network errors are non-fatal; bounties are additive information
        }
        return map;
    }
}

interface PolarIssue {
    issue: { html_url: string };
    amount: number;
    currency: string;
    url: string;
}

export class PolarFetcher implements IBountyFetcher {
    async fetchBounties(): Promise<Map<string, BountyInfo>> {
        const map = new Map<string, BountyInfo>();
        try {
            const res = await fetch('https://api.polar.sh/v1/rewards?state=open&limit=100');
            if (!res.ok) { return map; }
            const data = await res.json() as { items: PolarIssue[] };
            for (const item of data.items ?? []) {
                const url = item.issue?.html_url;
                if (!url) { continue; }
                map.set(url, {
                    amount: item.amount / 100,
                    currency: (item.currency ?? 'USD').toUpperCase(),
                    platform: 'Polar',
                    url: item.url,
                });
            }
        } catch {
            // Safe to ignore
        }
        return map;
    }
}

export class BountyAggregator {
    constructor(private readonly fetchers: IBountyFetcher[]) {}

    async fetchAll(): Promise<Map<string, BountyInfo>> {
        const results = await Promise.allSettled(this.fetchers.map(f => f.fetchBounties()));
        const merged = new Map<string, BountyInfo>();
        for (const result of results) {
            if (result.status === 'fulfilled') {
                result.value.forEach((v, k) => merged.set(k, v));
            }
        }
        return merged;
    }
}
