import * as vscode from 'vscode';
import { TrendingService } from '../services/TrendingService';
import { TrendingRepo } from '../domain/types';
import { GSOC_ORGS } from '../services/FilterStateManager';

// ─── Node Types ───────────────────────────────────────────────────────────────

type TrendingNode =
    | { kind: 'section';    id: SectionId; label: string }
    | { kind: 'repo';       repo: TrendingRepo }
    | { kind: 'hotIssue';   title: string; url: string; repo: string; score: number }
    | { kind: 'gsocOrg';    org: string };

type SectionId = 'hot' | 'trending' | 'gsoc';

// ─── TreeItem builders ────────────────────────────────────────────────────────

function sectionItem(id: SectionId, label: string): vscode.TreeItem {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
    const icons: Record<SectionId, [string, string]> = {
        hot:     ['flame', 'charts.red'],
        trending:['graph-line', 'charts.blue'],
        gsoc:    ['mortar-board', 'charts.yellow'],
    };
    const [icon, color] = icons[id];
    item.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
    return item;
}

function repoItem(repo: TrendingRepo): vscode.TreeItem {
    const item = new vscode.TreeItem(
        `${repo.owner}/${repo.name}`,
        vscode.TreeItemCollapsibleState.None
    );
    item.description = `Stars: ${repo.stars.toLocaleString()} • ${repo.language} • ${repo.openIssuesCount} issues`;
    item.iconPath = new vscode.ThemeIcon('repo');
    const md = new vscode.MarkdownString(
        `**[${repo.owner}/${repo.name}](${repo.url})**\n\n` +
        `${repo.description || '_No description_'}\n\n` +
        `- Stars: ${repo.stars.toLocaleString()}\n` +
        `- Language: ${repo.language}\n` +
        `- Open Issues: ${repo.openIssuesCount}\n\n` +
        `[Browse Issues](${repo.url}/issues?q=is:open+label:"good+first+issue")`
    );
    md.isTrusted = true;
    item.tooltip = md;
    item.command = { command: 'vscode.open', title: 'Open on GitHub', arguments: [vscode.Uri.parse(repo.url)] };
    return item;
}

function hotIssueItem(data: { title: string; url: string; repo: string; score: number }): vscode.TreeItem {
    const item = new vscode.TreeItem(data.title.slice(0, 65), vscode.TreeItemCollapsibleState.None);
    item.description = `${data.repo} • Hot: ${data.score}`;
    item.iconPath = new vscode.ThemeIcon('flame', new vscode.ThemeColor('charts.orange'));
    item.tooltip = `${data.title}\n${data.repo}\nActivity score: ${data.score}`;
    item.command = { command: 'vscode.open', title: 'Open Issue', arguments: [vscode.Uri.parse(data.url)] };
    return item;
}

function gsocOrgItem(org: string): vscode.TreeItem {
    const item = new vscode.TreeItem(org, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('organization');
    item.description = 'GSoC org';
    item.command = {
        command: 'vscode.open',
        title: 'Browse Issues',
        arguments: [vscode.Uri.parse(`https://github.com/search?q=org:${org}+is:issue+is:open+label:"good+first+issue"`)],
    };
    return item;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export class TrendingTreeProvider implements vscode.TreeDataProvider<TrendingNode> {
    private readonly _onChange = new vscode.EventEmitter<TrendingNode | undefined>();
    readonly onDidChangeTreeData = this._onChange.event;

    private trendingRepos: TrendingRepo[] = [];
    private hotIssues: { title: string; url: string; repo: string; score: number }[] = [];
    private loading = false;
    private lastFetched: number | null = null;

    /** TTL: only re-fetch if >30 min have passed */
    private readonly TTL_MS = 30 * 60 * 1000;

    constructor(private readonly svc: TrendingService) {}

    async refresh(force = false): Promise<void> {
        if (!force && this.lastFetched && Date.now() - this.lastFetched < this.TTL_MS) {
            return; // still fresh
        }

        this.loading = true;
        this._onChange.fire(undefined);

        try {
            const [repos, hot] = await Promise.all([
                this.svc.fetchTrendingRepos(undefined, 'weekly'),
                this.svc.fetchHotIssues(),
            ]);
            this.trendingRepos = repos;
            this.hotIssues = hot.map(h => ({
                title: h.title,
                url: h.url,
                repo: h.repo,
                score: h.activityScore
            }));
            this.lastFetched = Date.now();
        } catch {
            // Non-fatal: just show stale/empty data
        } finally {
            this.loading = false;
            this._onChange.fire(undefined);
        }
    }

    getTreeItem(element: TrendingNode): vscode.TreeItem {
        if (element.kind === 'section')   { return sectionItem(element.id, element.label); }
        if (element.kind === 'repo')      { return repoItem(element.repo); }
        if (element.kind === 'hotIssue') { return hotIssueItem(element); }
        if (element.kind === 'gsocOrg')  { return gsocOrgItem(element.org); }
        return new vscode.TreeItem('…');
    }

    getChildren(element?: TrendingNode): TrendingNode[] {
        // Root
        if (!element) {
            const sections: TrendingNode[] = [
                { kind: 'section', id: 'hot',      label: this.loading ? 'Hot Issues (loading…)' : `Hot Issues (48h)` },
                { kind: 'section', id: 'trending', label: this.loading ? 'Trending (loading…)' : 'Trending This Week' },
                { kind: 'section', id: 'gsoc',     label: 'GSoC Organizations' },
            ];
            return sections;
        }

        if (element.kind === 'section') {
            switch (element.id) {
                case 'hot':
                    return this.hotIssues.map(h => ({ kind: 'hotIssue' as const, ...h }));
                case 'trending':
                    return this.trendingRepos.map(r => ({ kind: 'repo' as const, repo: r }));
                case 'gsoc':
                    return GSOC_ORGS.map(org => ({ kind: 'gsocOrg' as const, org }));
            }
        }

        return [];
    }
}
