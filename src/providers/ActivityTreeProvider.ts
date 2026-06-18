import * as vscode from 'vscode';
import { ContributorAnalytics } from '../services/ContributorAnalytics';
import { ContributorStats, CommentedIssue, MyPR } from '../domain/types';

// ─── Node Types ───────────────────────────────────────────────────────────────

type ActivityNode =
    | { kind: 'root' }
    | { kind: 'stats';     stats: ContributorStats }
    | { kind: 'section';   id: SectionId; label: string; count: number }
    | { kind: 'pr';        pr: MyPR }
    | { kind: 'commented'; issue: CommentedIssue }
    | { kind: 'loading' }
    | { kind: 'error';     message: string }
    | { kind: 'repo';      name: string };

type SectionId = 'open' | 'merged' | 'closed' | 'commented' | 'repos';

// ─── TreeItem builders ────────────────────────────────────────────────────────

function statsItem(stats: ContributorStats): vscode.TreeItem {
    const item = new vscode.TreeItem('My Stats', vscode.TreeItemCollapsibleState.None);
    item.description = `${stats.mergedPRs} merged • ${stats.winRate}% win rate • ${stats.contributedRepos.length} repos`;
    item.iconPath = new vscode.ThemeIcon('graph', new vscode.ThemeColor('charts.blue'));
    item.tooltip = new vscode.MarkdownString(
        `**Contributor Stats**\n\n` +
        `| Metric | Value |\n|---|---|\n` +
        `| Total PRs | ${stats.totalPRs} |\n` +
        `| Merged | ${stats.mergedPRs} |\n` +
        `| Open | ${stats.openPRs} |\n` +
        `| Closed (not merged) | ${stats.closedPRs} |\n` +
        `| Win Rate | ${stats.winRate}% |\n` +
        `| Repos Contributed | ${stats.contributedRepos.length} |\n`
    );
    (item.tooltip as vscode.MarkdownString).isTrusted = true;
    return item;
}

function sectionItem(id: SectionId, label: string, count: number): vscode.TreeItem {
    const item = new vscode.TreeItem(`${label} (${count})`, vscode.TreeItemCollapsibleState.Collapsed);
    const icons: Record<SectionId, string> = {
        open:      'git-pull-request',
        merged:    'git-merge',
        closed:    'git-pull-request-closed',
        commented: 'comment-discussion',
        repos:     'repo',
    };
    item.iconPath = new vscode.ThemeIcon(icons[id]);
    return item;
}

function prItem(pr: MyPR): vscode.TreeItem {
    const stateIcon = pr.state === 'MERGED'
        ? new vscode.ThemeIcon('git-merge', new vscode.ThemeColor('charts.green'))
        : pr.state === 'OPEN'
            ? new vscode.ThemeIcon('git-pull-request', new vscode.ThemeColor('charts.blue'))
            : new vscode.ThemeIcon('git-pull-request-closed', new vscode.ThemeColor('charts.red'));

    const item = new vscode.TreeItem(`#${pr.number} ${pr.title.slice(0, 60)}`, vscode.TreeItemCollapsibleState.None);
    item.description = pr.repoNameWithOwner;
    item.iconPath = stateIcon;
    item.tooltip = `${pr.state} — ${pr.repoNameWithOwner}\n${pr.url}`;
    item.command = { command: 'vscode.open', title: 'Open PR', arguments: [vscode.Uri.parse(pr.url)] };
    return item;
}

function commentedIssueItem(issue: CommentedIssue): vscode.TreeItem {
    const item = new vscode.TreeItem(`#${issue.number} ${issue.title.slice(0, 55)}`, vscode.TreeItemCollapsibleState.None);
    item.description = issue.repoNameWithOwner;
    item.iconPath = new vscode.ThemeIcon('comment-discussion');
    item.command = { command: 'vscode.open', title: 'Open Issue', arguments: [vscode.Uri.parse(issue.url)] };
    return item;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export class ActivityTreeProvider implements vscode.TreeDataProvider<ActivityNode> {
    private readonly _onChange = new vscode.EventEmitter<ActivityNode | undefined>();
    readonly onDidChangeTreeData = this._onChange.event;

    private stats: ContributorStats | null = null;
    private commented: CommentedIssue[] = [];
    private loading = false;
    private error: string | null = null;

    constructor(
        private readonly analytics: ContributorAnalytics,
        private readonly getUsername: () => string
    ) {}

    // ─── Public API ──────────────────────────────────────────────────────────

    async refresh(): Promise<void> {
        const username = this.getUsername();
        if (!username) {
            this.error = 'Set your GitHub Username in Settings to enable My Activity.';
            this._onChange.fire(undefined);
            return;
        }

        this.loading = true;
        this.error   = null;
        this._onChange.fire(undefined);

        try {
            const [stats, commented] = await Promise.all([
                this.analytics.fetchStats(username),
                this.analytics.fetchCommentedIssues(username),
            ]);
            this.stats     = { ...stats, commentedIssueCount: commented.length };
            this.commented = commented;
        } catch (err) {
            this.error = (err as Error).message;
        } finally {
            this.loading = false;
            this._onChange.fire(undefined);
        }
    }

    // ─── TreeDataProvider ────────────────────────────────────────────────────

    getTreeItem(element: ActivityNode): vscode.TreeItem {
        if (element.kind === 'stats')     { return statsItem(element.stats); }
        if (element.kind === 'section')   { return sectionItem(element.id, element.label, element.count); }
        if (element.kind === 'pr')        { return prItem(element.pr); }
        if (element.kind === 'commented') { return commentedIssueItem(element.issue); }
        if (element.kind === 'loading') {
            const item = new vscode.TreeItem('Loading…', vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('sync~spin');
            return item;
        }
        if (element.kind === 'error') {
            const item = new vscode.TreeItem(element.message, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('error');
            return item;
        }
        if (element.kind === 'repo') {
            const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('repo');
            return item;
        }

        // root placeholder
        const item = new vscode.TreeItem('My Activity', vscode.TreeItemCollapsibleState.Expanded);
        return item;
    }

    getChildren(element?: ActivityNode): ActivityNode[] {
        if (this.loading) {
            if (!element) return [{ kind: 'loading' }];
            return [];
        }
        if (this.error) {
            if (!element) return [{ kind: 'error', message: this.error }];
            return [];
        }
        if (!this.stats) { return []; }

        // ── Root children ─────────────────────────────────────────────────────
        if (!element || element.kind === 'root') {
            const nodes: ActivityNode[] = [
                { kind: 'stats', stats: this.stats },
                { kind: 'section', id: 'open', label: 'Open PRs', count: this.stats.openPRs },
                { kind: 'section', id: 'merged', label: 'Merged PRs', count: this.stats.mergedPRs },
                { kind: 'section', id: 'closed', label: 'Closed (not merged)', count: this.stats.closedPRs },
                { kind: 'section', id: 'commented', label: 'Issues I\'ve Engaged', count: this.commented.length },
            ];
            if (this.stats.contributedRepos.length > 0) {
                nodes.push({ kind: 'section', id: 'repos', label: 'Repos Contributed', count: this.stats.contributedRepos.length });
            }
            return nodes;
        }

        // ── Section children ──────────────────────────────────────────────────
        if (element.kind === 'section') {
            switch (element.id) {
                case 'open':      return this.stats.recentPRs.filter(p => p.state === 'OPEN').map(pr => ({ kind: 'pr' as const, pr }));
                case 'merged':    return this.stats.recentPRs.filter(p => p.state === 'MERGED').map(pr => ({ kind: 'pr' as const, pr }));
                case 'closed':    return this.stats.recentPRs.filter(p => p.state === 'CLOSED').map(pr => ({ kind: 'pr' as const, pr }));
                case 'commented': return this.commented.map(issue => ({ kind: 'commented' as const, issue }));
                case 'repos': {
                    return this.stats.contributedRepos.slice(0, 20).map(repo => ({ kind: 'repo', name: repo }));
                }
            }
        }

        return [];
    }
}
