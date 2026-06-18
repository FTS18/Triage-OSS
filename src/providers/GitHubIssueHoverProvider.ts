import * as vscode from 'vscode';
import { GitHubClient } from '../api/GitHubClient';
import { CacheManager } from '../cache/CacheManager';

/** Regex to detect GitHub issue/PR URLs anywhere in a line of code or text. */
const GITHUB_ISSUE_RE = /https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/(issues|pull)\/(\d+)/;

interface IssueSummary {
    title: string;
    state: string;
    labels: string[];
    commentCount: number;
    author: string;
    createdAt: string;
}

/**
 * Provides hover cards for GitHub issue/PR URLs found anywhere in the editor.
 *
 * When the user hovers over a URL like:
 *   https://github.com/vercel/next.js/issues/1234
 *
 * A rich markdown card appears showing the issue title, state, labels, and
 * a quick link to open it in the Triage-OSS issue panel.
 *
 * Results are cached for 5 min to avoid hammering the API on repeated hovers.
 */
export class GitHubIssueHoverProvider implements vscode.HoverProvider {
    private readonly CACHE_SEC = 300; // 5 minutes

    constructor(
        private readonly client: GitHubClient,
        private readonly cache: CacheManager
    ) {}

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.Hover | undefined> {
        const line = document.lineAt(position).text;
        const match = GITHUB_ISSUE_RE.exec(line);
        if (!match) { return undefined; }

        const [fullMatch, owner, name, type, numberStr] = match;
        const number = parseInt(numberStr, 10);

        // Check that cursor is actually over the URL span
        const urlStart = line.indexOf(fullMatch);
        const urlEnd   = urlStart + fullMatch.length;
        if (position.character < urlStart || position.character > urlEnd) {
            return undefined;
        }

        const cacheKey = `hover:${owner}/${name}/${type}/${number}`;
        const cached = this.cache.get<IssueSummary>(cacheKey);
        const summary = cached ?? await this.fetchSummary(owner, name, type, number);

        if (!summary) { return undefined; }

        if (!cached) {
            this.cache.set(cacheKey, summary, this.CACHE_SEC);
        }

        const stateEmoji = summary.state === 'OPEN' ? '🟢' : summary.state === 'MERGED' ? '🟣' : '🔴';
        const labelStr = summary.labels.length > 0
            ? `\`${summary.labels.slice(0, 4).join('` `')}\``
            : '_none_';

        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**Triage-OSS — ${type === 'pull' ? 'Pull Request' : 'Issue'} Preview**\n\n`);
        md.appendMarkdown(`### ${stateEmoji} [#${number} ${summary.title}](${fullMatch})\n\n`);
        md.appendMarkdown(`> **State:** ${summary.state}  \n`);
        md.appendMarkdown(`> **Opened by:** @${summary.author}  \n`);
        md.appendMarkdown(`> **Comments:** ${summary.commentCount}  \n`);
        md.appendMarkdown(`> **Labels:** ${labelStr}  \n\n`);
        md.appendMarkdown(
            `[$(link-external) Open in GitHub](${fullMatch})  ·  ` +
            `[$(search) Find Similar Issues](command:issueFinder.findSimilarFromUrl?${encodeURIComponent(JSON.stringify({ owner, name, number, url: fullMatch }))})`
        );
        md.isTrusted = true;

        const range = new vscode.Range(
            new vscode.Position(position.line, urlStart),
            new vscode.Position(position.line, urlEnd)
        );

        return new vscode.Hover(md, range);
    }

    private async fetchSummary(
        owner: string,
        name: string,
        type: string,
        number: number
    ): Promise<IssueSummary | null> {
        const isIssue = type === 'issues';
        const field = isIssue ? 'issue' : 'pullRequest';
        const gql = `
            query($owner: String!, $name: String!, $number: Int!) {
                repository(owner: $owner, name: $name) {
                    node: ${field}(number: $number) {
                        title state
                        author { login }
                        comments { totalCount }
                        labels(first: 6) { nodes { name } }
                    }
                }
            }
        `;

        try {
            const data = await this.client.query<{
                repository: {
                    node: {
                        title: string;
                        state: string;
                        author: { login: string };
                        comments: { totalCount: number };
                        labels: { nodes: { name: string }[] };
                    } | null;
                };
            }>(gql, { owner, name, number });

            const node = data?.repository?.node;
            if (!node) { return null; }

            return {
                title:        node.title,
                state:        node.state,
                labels:       node.labels.nodes.map(l => l.name),
                commentCount: node.comments.totalCount,
                author:       node.author?.login ?? 'unknown',
                createdAt:    '',
            };
        } catch {
            return null;
        }
    }
}
