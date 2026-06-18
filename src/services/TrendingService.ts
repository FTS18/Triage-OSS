import { GitHubClient } from '../api/GitHubClient';
import { TrendingRepo } from '../domain/types';
import { GSOC_ORGS } from './FilterStateManager';

interface GitHubRestRepo {
    full_name: string;
    owner: { login: string };
    name: string;
    description: string | null;
    stargazers_count: number;
    language: string | null;
    html_url: string;
    open_issues_count: number;
}

interface RestSearchResponse {
    items: GitHubRestRepo[];
}

interface HotIssueNode {
    number: number;
    title: string;
    url: string;
    createdAt: string;
    comments: { totalCount: number };
    reactions: { totalCount: number };
    repository: { nameWithOwner: string; url: string };
}

/**
 * TrendingService discovers trending repositories (via GitHub REST search) and
 * hot issues (via GraphQL reaction+comment sorting). No scraping, no third-party
 * services — all data comes from the GitHub API the user already has a token for.
 */
export class TrendingService {
    constructor(private readonly client: GitHubClient) {}

    /**
     * Returns trending repos: repositories that are highly-starred AND
     * had a commit pushed in the last 7 days.
     * Uses GET /search/repositories — no auth required but benefits from token.
     */
    async fetchTrendingRepos(language?: string, since: 'daily' | 'weekly' | 'monthly' = 'weekly'): Promise<TrendingRepo[]> {
        const daysBack = since === 'daily' ? 1 : since === 'weekly' ? 7 : 30;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysBack);
        const dateStr = cutoff.toISOString().split('T')[0];

        const langPart = language ? `+language:${encodeURIComponent(language)}` : '';
        const url = `/search/repositories?q=stars:>100+pushed:>=${dateStr}${langPart}&sort=stars&order=desc&per_page=20`;

        try {
            const data = await this.client.restGet<RestSearchResponse>(url);
            return (data.items ?? []).map(r => ({
                owner: r.owner.login,
                name: r.name,
                description: r.description ?? '',
                stars: r.stargazers_count,
                language: r.language ?? 'Unknown',
                url: r.html_url,
                openIssuesCount: r.open_issues_count,
            }));
        } catch {
            return [];
        }
    }

    /**
     * Returns "hot" open issues — issues with the most activity (reactions + comments)
     * created in the last 24 hours. Uses GitHub GraphQL search.
     */
    async fetchHotIssues(): Promise<{ number: number; title: string; url: string; repo: string; activityScore: number }[]> {
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - 48);
        const dateStr = cutoff.toISOString().split('T')[0];

        const gql = `
            query($q: String!) {
                search(query: $q, type: ISSUE, first: 20) {
                    nodes {
                        ... on Issue {
                            number title url createdAt
                            comments { totalCount }
                            reactions(content: THUMBS_UP) { totalCount }
                            repository { nameWithOwner }
                        }
                    }
                }
            }
        `;

        try {
            const data = await this.client.query<{ search: { nodes: HotIssueNode[] } }>(
                gql,
                { q: `is:issue is:open created:>=${dateStr} comments:>2 sort:reactions-+1-desc` }
            );

            return data.search.nodes
                .filter(n => n.number !== undefined)
                .map(n => ({
                    number: n.number,
                    title: n.title,
                    url: n.url,
                    repo: n.repository?.nameWithOwner ?? '',
                    activityScore: n.comments.totalCount + n.reactions.totalCount * 2,
                }))
                .sort((a, b) => b.activityScore - a.activityScore);
        } catch {
            return [];
        }
    }

    /**
     * Returns good-first-issues from known GSoC-participating organizations.
     * Lets contributors find issues in orgs that mentor newcomers every summer.
     */
    async fetchGSoCIssues(orgs?: string[]): Promise<{ title: string; url: string; repo: string; org: string }[]> {
        const targetOrgs = (orgs && orgs.length > 0) ? orgs : GSOC_ORGS.slice(0, 8);
        const orgPart = targetOrgs.map(o => `org:${o}`).join(' ');
        const q = `${orgPart} label:"good first issue" is:open is:issue`;

        const gql = `
            query($q: String!) {
                search(query: $q, type: ISSUE, first: 20) {
                    nodes {
                        ... on Issue {
                            title url
                            repository { nameWithOwner owner { login } }
                        }
                    }
                }
            }
        `;
        try {
            const data = await this.client.query<{
                search: {
                    nodes: {
                        title: string;
                        url: string;
                        repository: { nameWithOwner: string; owner: { login: string } };
                    }[]
                }
            }>(gql, { q });

            return data.search.nodes
                .filter(n => n.title)
                .map(n => ({
                    title: n.title,
                    url: n.url,
                    repo: n.repository?.nameWithOwner ?? '',
                    org: n.repository?.owner?.login ?? '',
                }));
        } catch {
            return [];
        }
    }

    /** Returns the list of GSoC org names for display. */
    getGSoCOrgList(): typeof GSOC_ORGS {
        return GSOC_ORGS;
    }
}
