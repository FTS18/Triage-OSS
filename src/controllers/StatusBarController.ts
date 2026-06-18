import * as vscode from 'vscode';
import { Issue } from '../domain/types';

export class StatusBarController {
    private readonly item: vscode.StatusBarItem;
    private ticker: NodeJS.Timeout | undefined;

    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
        this.item.command = 'issueFinder.refresh';
        this.item.tooltip = 'Click to refresh Open Source Issues';
        this.item.text = '$(bug) Triage-OSS';
        this.item.show();
    }

    updateWithIssues(allIssues: Issue[]): void {
        const bountyCount = allIssues.filter(i => i.bounty).length;
        const neglectedCount = allIssues.filter(i => i.commentCount === 0 && i.reactionCount >= 3).length;

        const messages = [
            `$(bug) OSIF: ${allIssues.length} issues`,
            bountyCount > 0 ? `$(dollar) ${bountyCount} bounties` : null,
            neglectedCount > 0 ? `$(warning) ${neglectedCount} neglected` : null,
        ].filter(Boolean) as string[];

        let idx = 0;
        if (this.ticker) { clearInterval(this.ticker); }

        this.item.text = messages[0];
        this.ticker = setInterval(() => {
            idx = (idx + 1) % messages.length;
            this.item.text = messages[idx];
        }, 5000);
    }

    setLoading(): void {
        this.item.text = '$(sync~spin) Loading issues…';
    }

    dispose(): void {
        if (this.ticker) { clearInterval(this.ticker); }
        this.item.dispose();
    }
}
