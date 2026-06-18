import { GitHubClient } from '../api/GitHubClient';
import { ContributorStats, CommentedIssue, MyPR } from '../domain/types';

interface RawPRNode {
    number: number;
    title: string;
    url: string;
    state: 'OPEN' | 'MERGED' | 'CLOSED';
    createdAt: string;
    repository: { nameWithOwner: string };
}

interface RawCommentedNode {
    number: number;
    title: string;
    url: string;
    repository: { nameWithOwner: string };
}

/**
 * ContributorAnalytics fetches data about the authenticated user's open-source
 * activity using the GitHub GraphQL search API. No AI, no extra services.
 */
export class ContributorAnalytics {
    constructor(private readonly client: GitHubClient) {}

    /**
     * Fetches the user's PR history and computes aggregate stats.
     * Uses `is:pr author:<username>` search — returns up to 50 most recent PRs.
     */
    async fetchStats(username: string): Promise<ContributorStats> {
        const gql = `
            query($q: String!) {
                search(query: $q, type: ISSUE, first: 50) {
                    nodes {
                        ... on PullRequest {
                            number title url state createdAt
                            repository { nameWithOwner }
                        }
                    }
                }
            }
        `;

        const data = await this.client.query<{ search: { nodes: RawPRNode[] } }>(
            gql, { q: `is:pr author:${username} sort:created-desc` }
        );

        const prs: MyPR[] = data.search.nodes
            .filter(n => n.number !== undefined)
            .map(n => ({
                number: n.number,
                title: n.title,
                url: n.url,
                state: n.state,
                repoNameWithOwner: n.repository?.nameWithOwner ?? '',
                createdAt: n.createdAt,
            }));

        const merged = prs.filter(p => p.state === 'MERGED').length;
        const open   = prs.filter(p => p.state === 'OPEN').length;
        const closed = prs.filter(p => p.state === 'CLOSED').length;
        const repos  = [...new Set(prs.map(p => p.repoNameWithOwner))];

        return {
            totalPRs: prs.length,
            mergedPRs: merged,
            openPRs: open,
            closedPRs: closed,
            winRate: prs.length > 0 ? Math.round((merged / prs.length) * 100) : 0,
            contributedRepos: repos,
            recentPRs: prs.slice(0, 20),
            commentedIssueCount: 0, // filled by fetchCommentedIssues
        };
    }

    /**
     * Returns open issues that the user has commented on.
     * Uses `is:issue commenter:<username> is:open` search.
     */
    async fetchCommentedIssues(username: string): Promise<CommentedIssue[]> {
        const gql = `
            query($q: String!) {
                search(query: $q, type: ISSUE, first: 25) {
                    nodes {
                        ... on Issue {
                            number title url
                            repository { nameWithOwner }
                        }
                    }
                }
            }
        `;
        try {
            const data = await this.client.query<{ search: { nodes: RawCommentedNode[] } }>(
                gql, { q: `is:issue commenter:${username} is:open sort:updated-desc` }
            );

            return data.search.nodes
                .filter(n => n.number !== undefined)
                .map(n => ({
                    number: n.number,
                    title: n.title,
                    url: n.url,
                    repoNameWithOwner: n.repository?.nameWithOwner ?? '',
                }));
        } catch {
            return [];
        }
    }
}
