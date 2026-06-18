import { RateLimitManager } from './RateLimitManager';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

/** Shape of the GitHub GraphQL viewer profile response. */
interface ViewerProfileResponse {
    viewer: {
        topRepositories: {
            nodes: Array<{
                primaryLanguage: { name: string } | null;
            }>;
        };
        contributionsCollection: {
            contributionCalendar: {
                weeks: Array<{
                    contributionDays: Array<{
                        date: string;
                        contributionCount: number;
                    }>;
                }>;
            };
        };
    };
}

export class GitHubClient {
    constructor(
        private readonly token: string,
        private readonly rateLimitManager: RateLimitManager
    ) {}

    async query<T>(gql: string, variables: Record<string, unknown> = {}): Promise<T> {
        await this.rateLimitManager.waitIfNeeded();

        const response = await fetch(GITHUB_GRAPHQL_URL, {
            method: 'POST',
            headers: {
                'Authorization': `bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: gql, variables }),
        });

        this.rateLimitManager.updateFromHeaders(
            Object.fromEntries(response.headers.entries())
        );

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }

        const json = await response.json() as { data: T; errors?: { message: string }[] };

        if (json.errors?.length) {
            throw new Error(json.errors.map(e => e.message).join(', '));
        }

        return json.data;
    }

    async restGet<T>(path: string): Promise<T> {
        await this.rateLimitManager.waitIfNeeded();

        const response = await fetch(`https://api.github.com${path}`, {
            headers: {
                'Authorization': `bearer ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        this.rateLimitManager.updateFromHeaders(
            Object.fromEntries(response.headers.entries())
        );

        if (!response.ok) {
            throw new Error(`GitHub REST error: ${response.status} ${response.statusText}`);
        }

        return response.json() as Promise<T>;
    }

    async restPost<T>(path: string, body: unknown): Promise<T> {
        await this.rateLimitManager.waitIfNeeded();

        const response = await fetch(`https://api.github.com${path}`, {
            method: 'POST',
            headers: {
                'Authorization': `bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        this.rateLimitManager.updateFromHeaders(
            Object.fromEntries(response.headers.entries())
        );

        if (!response.ok) {
            throw new Error(`GitHub REST error: ${response.status} ${response.statusText}`);
        }

        return response.json() as Promise<T>;
    }

    async fetchUserProfile(): Promise<{ topLanguages: string[]; streak: number }> {
        const gql = `
            query {
                viewer {
                    topRepositories(first: 20, orderBy: {field: STARGAZERS, direction: DESC}) {
                        nodes { primaryLanguage { name } }
                    }
                    contributionsCollection {
                        contributionCalendar {
                            weeks { contributionDays { date contributionCount } }
                        }
                    }
                }
            }
        `;
        const data = await this.query<ViewerProfileResponse>(gql);
        const langs = data.viewer.topRepositories.nodes
            .map(n => n?.primaryLanguage?.name)
            .filter((l): l is string => Boolean(l));

        const topLangs = [...new Set(langs)].slice(0, 8);

        // Calculate contribution streak by walking backwards from today
        let streak = 0;
        const days = data.viewer.contributionsCollection.contributionCalendar.weeks
            .flatMap(w => w.contributionDays)
            .reverse();

        for (const d of days) {
            if (d.contributionCount > 0) { streak++; }
            else if (streak > 0) { break; } // Streak broken — stop counting
        }

        return { topLanguages: topLangs, streak };
    }
}
