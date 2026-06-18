import { GitHubClient } from '../api/GitHubClient';
import { CacheManager } from '../cache/CacheManager';
import { Issue, Repo, RepoHealth } from '../domain/types';
import { ActiveFilter } from '../services/FilterStateManager';
import { IntelligenceService } from '../services/IntelligenceService';
import { UserProfile } from '../services/ProfileManager';

/**
 * Centralised query-tuning constants.
 *
 * - `pageSize`           — issues fetched per feed page (GitHub GraphQL max: 100, practical: 25)
 * - `challengePageSize`  — issues fetched for the Daily Challenge pool
 * - `healthSampleSize`   — closed issues/PRs sampled per repo health check
 * - `orgBatchSize`       — orgs batched into a single GraphQL query (keep ≤ 5 for query length)
 * - `challengeOrgCount`  — how many orgs to randomly pick each challenge refresh
 * - `healthFetchLimit`   — how many issues in the feed to run a health check on (perf guard)
 * - `challengeCacheSec`  — how long the Daily Challenge result is cached (default: 15 min)
 */
const DEFAULTS = {
    pageSize: 25,
    challengePageSize: 30,
    healthSampleSize: 50,
    orgBatchSize: 5,
    challengeOrgCount: 6,
    healthFetchLimit: 10,
    challengeCacheSec: 900,
} as const;

const ISSUE_FIELDS = `
    id databaseId number title url bodyText
    createdAt updatedAt
    reactions(content: THUMBS_UP) { totalCount }
    comments { totalCount }
    labels(first: 10) { nodes { name } }
    assignees(first: 5) { nodes { login } }
    timelineItems(first: 10, itemTypes: [CROSS_REFERENCED_EVENT]) {
        nodes {
            ... on CrossReferencedEvent {
                source {
                    ... on PullRequest { state url }
                }
            }
        }
    }
    repository {
        name owner { login }
        stargazerCount primaryLanguage { name }
        url
    }
`;

interface RawIssueNode {
    id: string;
    databaseId: number;
    number: number;
    title: string;
    url: string;
    bodyText: string;
    createdAt: string;
    updatedAt: string;
    reactions: { totalCount: number };
    comments: { totalCount: number };
    labels: { nodes: { name: string }[] };
    assignees: { nodes: { login: string }[] };
    timelineItems: {
        nodes: {
            source?: { state: string; url: string }
        }[]
    };
    repository: {
        name: string;
        owner: { login: string };
        stargazerCount: number;
        primaryLanguage: { name: string } | null;
        url: string;
    };
}

export interface SearchResponse {
    issues: Issue[];
    endCursor: string | null;
    hasNextPage: boolean;
}

/** Sort qualifier map for GitHub issue search. */
const SORT_MAP: Record<string, string> = {
    'created':   'sort:created-desc',
    'updated':   'sort:updated-desc',
    'reactions': 'sort:reactions-+1-desc',
    'comments':  'sort:comments-desc',
};

/** Issue type → GitHub label groups. */
const ISSUE_TYPE_LABELS: Record<string, string> = {
    'bug':         'label:bug',
    'feature':     'label:enhancement',
    'docs':        'label:documentation',
    'test':        'label:test',
    'performance': 'label:performance',
    'security':    'label:security',
};


export class IssueRepository {
    constructor(
        private readonly client: GitHubClient,
        private readonly cache: CacheManager,
        private readonly cacheSeconds: number,
        private readonly intelligence: IntelligenceService
    ) {}


    async searchIssues(filter: ActiveFilter, profile?: UserProfile | null, after?: string | null): Promise<SearchResponse> {
        const q = this.buildSearchQuery(filter);
        const cacheKey = `issues:${q}:${after ?? 'start'}`;
        const cached = this.cache.get<SearchResponse>(cacheKey);
        if (cached) { return cached; }

        const gql = `
            query($q: String!, $after: String) {
                search(query: $q, type: ISSUE, first: ${DEFAULTS.pageSize}, after: $after) {
                    issueCount
                    pageInfo { endCursor hasNextPage }
                    nodes { ... on Issue { ${ISSUE_FIELDS} } }
                }
            }
        `;

        const data = await this.client.query<{
            search: {
                pageInfo: { endCursor: string | null; hasNextPage: boolean };
                nodes: RawIssueNode[];
            }
        }>(gql, { q, after });

        const issues = data.search.nodes
            .filter(n => n.id)
            .map(n => this.mapIssue(n, profile));

        const response: SearchResponse = {
            issues,
            endCursor: data.search.pageInfo.endCursor,
            hasNextPage: data.search.pageInfo.hasNextPage,
        };

        this.cache.set(cacheKey, response, this.cacheSeconds);
        return response;
    }


    async searchByOrgs(orgs: string[], filter: ActiveFilter, profile?: UserProfile | null): Promise<SearchResponse> {
        const orgBatches = this.chunk(orgs, DEFAULTS.orgBatchSize);
        const allIssues: Issue[] = [];
        const errors: string[] = [];

        for (const batch of orgBatches) {
            const q = this.buildOrgQuery(batch, filter);
            const cacheKey = `org-issues:${q}`;
            const cached = this.cache.get<Issue[]>(cacheKey);

            if (cached) {
                allIssues.push(...cached);
                continue;
            }

            const gql = `
                query($q: String!) {
                    search(query: $q, type: ISSUE, first: ${DEFAULTS.pageSize}) {
                        nodes { ... on Issue { ${ISSUE_FIELDS} } }
                    }
                }
            `;
            try {
                const data = await this.client.query<{ search: { nodes: RawIssueNode[] } }>(gql, { q });
                const issues = data.search.nodes.filter(n => n.id).map(n => this.mapIssue(n, profile));
                this.cache.set(cacheKey, issues, this.cacheSeconds);
                allIssues.push(...issues);
            } catch (err) {
                const msg = (err as Error).message ?? String(err);
                errors.push(`[batch: ${batch.join(',')}] ${msg}`);
                console.warn('Triage-OSS: org batch failed:', msg);
            }
        }

        // If every batch failed, throw so the caller can show an error and fall back
        if (allIssues.length === 0 && errors.length > 0) {
            throw new Error(`All org batches failed. First error: ${errors[0]}`);
        }

        return { issues: allIssues, endCursor: null, hasNextPage: false };
    }


    async searchChallengeOrgs(challengeOrgs: string[], profile?: UserProfile | null): Promise<SearchResponse> {
        const shuffled = [...challengeOrgs].sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, DEFAULTS.challengeOrgCount);
        const orgPart = picked.map(o => `org:${o}`).join(' ');
        const q = `${orgPart} label:"good first issue" is:open is:issue`;
        const cacheKey = `challenge:${picked.join(',')}`;
        const cached = this.cache.get<Issue[]>(cacheKey);

        if (cached) {
            return { issues: cached, endCursor: null, hasNextPage: false };
        }

        const gql = `
            query($q: String!) {
                search(query: $q, type: ISSUE, first: ${DEFAULTS.challengePageSize}) {
                    nodes { ... on Issue { ${ISSUE_FIELDS} } }
                }
            }
        `;
        const data = await this.client.query<{ search: { nodes: RawIssueNode[] } }>(gql, { q });
        const issues = data.search.nodes.filter(n => n.id).map(n => this.mapIssue(n, profile));

        this.cache.set(cacheKey, issues, DEFAULTS.challengeCacheSec);
        return { issues, endCursor: null, hasNextPage: false };
    }

    /** @deprecated Use searchChallengeOrgs(orgs) instead. */
    async searchBigTechForChallenge(profile?: UserProfile | null): Promise<SearchResponse> {
        const { DEFAULT_CHALLENGE_ORGS } = await import('../services/FilterStateManager');
        return this.searchChallengeOrgs(DEFAULT_CHALLENGE_ORGS, profile);
    }

    /**
     * Searches for issues similar to the given issue using title keywords.
     * Results are scoped to the same repo.
     */
    async searchSimilarIssues(issue: Issue): Promise<Issue[]> {
        const stopWords = new Set([
            'the','a','an','is','in','on','at','to','of','and','or',
            'not','fix','bug','issue','with','for','when','does','fails',
            'cannot','should','error','problem','handle','support','make',
        ]);
        const terms = issue.title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopWords.has(w))
            .slice(0, 4);

        if (terms.length === 0) { return []; }

        const q = `repo:${issue.repo.owner}/${issue.repo.name} is:issue ${terms.join(' ')}`;
        const gql = `
            query($q: String!) {
                search(query: $q, type: ISSUE, first: 10) {
                    nodes { ... on Issue { ${ISSUE_FIELDS} } }
                }
            }
        `;
        try {
            const data = await this.client.query<{ search: { nodes: RawIssueNode[] } }>(gql, { q });
            return data.search.nodes
                .filter(n => n.id && n.url !== issue.url)
                .map(n => this.mapIssue(n, null));
        } catch {
            return [];
        }
    }

    /** Returns the number of issues to fetch health for — used in extension.ts. */
    static get healthFetchLimit(): number {
        return DEFAULTS.healthFetchLimit;
    }

    async getRepoHealth(owner: string, name: string): Promise<RepoHealth> {
        const cacheKey = `health:${owner}/${name}`;
        const cached = this.cache.get<RepoHealth>(cacheKey);
        if (cached) { return cached; }

        const gql = `
            query($owner: String!, $name: String!) {
                repository(owner: $owner, name: $name) {
                    issues(states: CLOSED, last: ${DEFAULTS.healthSampleSize}, orderBy: {field: UPDATED_AT, direction: DESC}) {
                        nodes { createdAt closedAt }
                    }
                    pullRequests(states: [MERGED, CLOSED], last: ${DEFAULTS.healthSampleSize}) {
                        nodes { state }
                    }
                    object(expression: "HEAD:CONTRIBUTING.md") { ... on Blob { text } }
                }
            }
        `;

        const data = await this.client.query<{
            repository: {
                issues: { nodes: { createdAt: string; closedAt: string | null }[] };
                pullRequests: { nodes: { state: string }[] };
                object: { text: string } | null;
            };
        }>(gql, { owner, name });

        const health = this.computeHealth(data.repository);
        this.cache.set(cacheKey, health, this.cacheSeconds * 6);
        return health;
    }

    // ─── Query Builders ───────────────────────────────────────────────────────

    private buildSearchQuery(filter: ActiveFilter): string {
        const parts: string[] = ['is:open', 'is:issue'];

        // Label mode
        if (filter.labelMode === 'help-wanted') {
            parts.push('label:"help wanted"');
        } else {
            // If 'both' or 'good-first-issue', default to good first issue to avoid invalid OR syntax
            parts.push('label:"good first issue"');
        }

        // Languages
        if (filter.languages?.length > 0) {
            parts.push(filter.languages.map(l => `language:${l}`).join(' '));
        }

        // Stars
        if (filter.minStars > 0) { parts.push(`stars:>=${filter.minStars}`); }

        // Free-text keyword
        if (filter.keyword?.trim()) { parts.push(filter.keyword.trim()); }

        // Topics
        filter.topics?.forEach(t => { if (t.trim()) { parts.push(`topic:${t.trim()}`); } });

        // Issue type → label group
        if (filter.issueType && filter.issueType !== 'all' && ISSUE_TYPE_LABELS[filter.issueType]) {
            parts.push(ISSUE_TYPE_LABELS[filter.issueType]);
        }

        // Exclude keywords
        filter.excludeKeywords?.forEach(kw => { if (kw.trim()) { parts.push(`-${kw.trim()}`); } });

        // Repo size (KB)
        if (filter.maxRepoSizeKb > 0) { parts.push(`size:<=${filter.maxRepoSizeKb}`); }

        // License
        if (filter.license && filter.license !== 'any') { parts.push(`license:${filter.license}`); }

        // Activity (repo pushed within N days)
        if (filter.minActivityDays > 0) {
            const d = new Date();
            d.setDate(d.getDate() - filter.minActivityDays);
            parts.push(`pushed:>=${d.toISOString().split('T')[0]}`);
        }

        // No assignee (strict GitHub qualifier)
        if (filter.noAssigneeStrict) { parts.push('no:assignee'); }

        // Special modes
        if (filter.hacktoberfestMode) { parts.push('label:hacktoberfest'); }
        if (filter.quickWinMode) { parts.push('label:"good first issue"'); }

        // Orgs
        if (filter.orgs.length > 0) {
            parts.push(filter.orgs.map(o => `org:${o}`).join(' '));
        }

        // Sort qualifier
        if (filter.sortBy && filter.sortBy !== 'best-match' && SORT_MAP[filter.sortBy]) {
            parts.push(SORT_MAP[filter.sortBy]);
        }

        return parts.join(' ');
    }

    private buildOrgQuery(orgs: string[], filter: ActiveFilter): string {
        const orgPart = orgs.map(o => `org:${o}`).join(' ');
        const label = filter.labelMode === 'help-wanted'
            ? 'label:"help wanted"'
            : 'label:"good first issue"';

        const parts = [`${orgPart} ${label} is:open is:issue`];

        if (filter.languages?.length > 0) {
            parts.push(filter.languages.map(l => `language:${l}`).join(' '));
        }
        if (filter.keyword?.trim()) { parts.push(filter.keyword.trim()); }
        filter.topics?.forEach(t => { if (t.trim()) { parts.push(`topic:${t.trim()}`); } });
        if (filter.issueType && filter.issueType !== 'all' && ISSUE_TYPE_LABELS[filter.issueType]) {
            parts.push(ISSUE_TYPE_LABELS[filter.issueType]);
        }
        filter.excludeKeywords?.forEach(kw => { if (kw.trim()) { parts.push(`-${kw.trim()}`); } });
        if (filter.noAssigneeStrict) { parts.push('no:assignee'); }
        if (filter.sortBy && filter.sortBy !== 'best-match' && SORT_MAP[filter.sortBy]) {
            parts.push(SORT_MAP[filter.sortBy]);
        }

        return parts.join(' ');
    }

    // ─── Health ───────────────────────────────────────────────────────────────

    private computeHealth(repo: {
        issues: { nodes: { createdAt: string; closedAt: string | null }[] };
        pullRequests: { nodes: { state: string }[] };
        object: { text: string } | null;
    }): RepoHealth {
        const closedIssues = repo.issues.nodes.filter(i => i.closedAt);
        const avgClose = closedIssues.length
            ? closedIssues.reduce((sum, i) =>
                sum + (new Date(i.closedAt!).getTime() - new Date(i.createdAt).getTime()), 0
            ) / closedIssues.length / 86_400_000
            : 0;
        const prs = repo.pullRequests.nodes;
        const mergeRate = prs.length ? prs.filter(p => p.state === 'MERGED').length / prs.length : 0;
        const claText = repo.object?.text ?? '';
        return {
            avgCloseTimeDays: Math.round(avgClose),
            prMergeRate: Math.round(mergeRate * 100),
            hasCLA: /contributor license agreement|CLA/i.test(claText),
            avgFirstResponseDays: 0,
        };
    }

    // ─── Mapping ──────────────────────────────────────────────────────────────

    private mapIssue(raw: RawIssueNode, profile?: UserProfile | null): Issue {
        const r = raw.repository;
        const repo: Repo = {
            owner: r.owner.login,
            name: r.name,
            stars: r.stargazerCount,
            language: r.primaryLanguage?.name ?? 'Unknown',
            url: r.url,
        };

        const prs = raw.timelineItems?.nodes
            .filter(n => n.source && n.source.url)
            .map(n => n.source!) ?? [];

        const baseIssue: Issue = {
            id: raw.id,
            number: raw.number ?? raw.databaseId,
            title: raw.title,
            url: raw.url,
            bodyText: raw.bodyText,
            reactionCount: raw.reactions.totalCount,
            commentCount: raw.comments.totalCount,
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt,
            labels: raw.labels.nodes.map(l => l.name),
            assignees: raw.assignees.nodes.map(a => a.login),
            repo,
        };

        const intelligence = this.intelligence.calculateScore(baseIssue, profile);
        intelligence.competition.prCount = prs.length;

        return { ...baseIssue, intelligence };
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    private chunk<T>(arr: T[], size: number): T[][] {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) { out.push(arr.slice(i, i + size)); }
        return out;
    }
}
