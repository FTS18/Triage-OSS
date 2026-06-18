import * as vscode from 'vscode';
import { Issue } from '../domain/types';

// ─── Individual TreeItems ─────────────────────────────────────────────────────

/**
 * One issue row in the tree.
 * Supports two display modes:
 *   - full (default): shows all intel fields + health in the description
 *   - compact: shows only win probability and a short title
 */
export class IssueTreeItem extends vscode.TreeItem {
    constructor(
        public readonly issue: Issue,
        contextVal: 'issue' | 'watchlistIssue' = 'issue',
        compact = false
    ) {
        const intel = issue.intelligence;
        const isBest  = intel?.isBestMatch  ?? false;
        const isQuick = intel?.isQuickWin   ?? false;
        const diff    = intel?.difficulty   ?? 'Unknown';
        const win     = intel?.winProbability ?? 0;
        const prCount = intel?.competition.prCount ?? 0;

        let prefix = '';
        if (isBest)  { prefix += '[FOR YOU] '; }
        if (isQuick) { prefix += '[QUICK WIN] '; }

        const label = compact
            ? `${prefix}#${issue.number} ${issue.title.slice(0, 45)}${issue.title.length > 45 ? '…' : ''}`
            : `${prefix}#${issue.number} ${issue.title}`;

        super(label, vscode.TreeItemCollapsibleState.None);

        // ── Icon: coloured circle based on difficulty ────────────────────────
        const difficultyIcon = IssueTreeItem.difficultyIcon(diff as string);
        this.iconPath = issue.bounty
            ? new vscode.ThemeIcon('dollar', new vscode.ThemeColor('charts.yellow'))
            : difficultyIcon;

        // ── Description (right-side text) ────────────────────────────────────
        if (compact) {
            this.description = `${win}% win`;
        } else {
            const health = issue.repo.health;
            let healthStr = '';
            if (health) {
                const icon = health.prMergeRate > 80 ? 'Good' : health.prMergeRate > 50 ? 'Okay' : 'Poor';
                healthStr = ` • [${icon}] ${health.prMergeRate}% Merge`;
            }
            this.description = `[${diff}] • ${win}% Win • ${prCount} PRs${healthStr}`;
        }

        // ── Tooltip ──────────────────────────────────────────────────────────
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**[#${issue.number}](${issue.url}) ${issue.title}**\n\n`);
        md.appendMarkdown(`> **Repo:** [${issue.repo.owner}/${issue.repo.name}](${issue.repo.url})  \n`);
        md.appendMarkdown(`> **Stars:** ${issue.repo.stars.toLocaleString()}  \n`);
        md.appendMarkdown(`> **Language:** ${issue.repo.language}  \n\n`);
        md.appendMarkdown(`| Difficulty | Win % | Competing PRs |\n|---|---|---|\n`);
        md.appendMarkdown(`| ${diff} | ${win}% | ${prCount} |\n\n`);
        if (issue.labels.length > 0) {
            md.appendMarkdown(`**Labels:** \`${issue.labels.join('` `')}\`\n\n`);
        }
        if (issue.repo.health) {
            const h = issue.repo.health;
            md.appendMarkdown(`**Repo Health:**  \n`);
            md.appendMarkdown(`- PR Merge Rate: ${h.prMergeRate}%  \n`);
            md.appendMarkdown(`- Avg Close Time: ${h.avgCloseTimeDays}d  \n`);
            if (h.hasCLA) { md.appendMarkdown(`- CLA/DCO Required\n`); }
        }
        md.isTrusted = true;
        this.tooltip = md;

        this.contextValue = contextVal;
        this.command = {
            command: 'issueFinder.openIssue',
            title: 'Open Issue',
            arguments: [issue],
        };
    }

    private static difficultyIcon(difficulty: string): vscode.ThemeIcon {
        switch (difficulty) {
            case 'Easy':   return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'));
            case 'Medium': return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.yellow'));
            case 'Hard':   return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.red'));
            default:       return new vscode.ThemeIcon('circle-outline');
        }
    }
}

class PlaceholderItem extends vscode.TreeItem {
    constructor(message: string, icon = 'info') {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon(icon);
    }
}

class LoadMoreItem extends vscode.TreeItem {
    constructor(commandId: string, provider: IssueListProvider) {
        super('Load More Issues…', vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('refresh');
        this.command = { command: commandId, title: 'Load More', arguments: [provider] };
    }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export class IssueListProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly _onChange = new vscode.EventEmitter<undefined>();
    readonly onDidChangeTreeData = this._onChange.event;

    private issues: Issue[] = [];
    private endCursor: string | null = null;
    private hasNextPage  = false;
    private placeholder  = 'No issues found';
    private compact      = false;
    private readonly contextVal: 'issue' | 'watchlistIssue';

    constructor(contextVal: 'issue' | 'watchlistIssue' = 'issue') {
        this.contextVal = contextVal;
    }

    setPlaceholder(msg: string): void {
        this.placeholder = msg;
    }

    /** Toggles compact/full display mode and triggers a refresh. */
    toggleCompact(): void {
        this.compact = !this.compact;
        this._onChange.fire(undefined);
    }

    isCompact(): boolean { return this.compact; }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    getChildren(): vscode.TreeItem[] {
        if (this.issues.length === 0) {
            return [new PlaceholderItem(this.placeholder)];
        }
        const items: vscode.TreeItem[] = this.issues.map(
            i => new IssueTreeItem(i, this.contextVal, this.compact)
        );
        if (this.hasNextPage) {
            items.push(new LoadMoreItem('issueFinder.loadMore', this));
        }
        return items;
    }

    updateResponse(response: { issues: Issue[]; endCursor: string | null; hasNextPage: boolean }): void {
        this.issues = response.issues;
        this.endCursor  = response.endCursor;
        this.hasNextPage = response.hasNextPage;
        this._onChange.fire(undefined);
    }

    appendResponse(response: { issues: Issue[]; endCursor: string | null; hasNextPage: boolean }): void {
        this.issues.push(...response.issues);
        this.endCursor  = response.endCursor;
        this.hasNextPage = response.hasNextPage;
        this._onChange.fire(undefined);
    }

    getCursor(): string | null { return this.endCursor; }

    getAllIssues(): Issue[] { return this.issues; }

    refresh(): void { this._onChange.fire(undefined); }
}
