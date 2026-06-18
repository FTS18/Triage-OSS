import * as vscode from 'vscode';

interface ErrorLink extends vscode.TerminalLink {
    errorText: string;
}

export class TerminalLinkProvider implements vscode.TerminalLinkProvider<ErrorLink> {
    private readonly ERROR_PATTERN = /(?:Error|Exception|ENOENT|ECONNREFUSED|TypeError|ReferenceError)[\w\s:.]*/g;

    provideTerminalLinks(context: vscode.TerminalLinkContext): ErrorLink[] {
        const links: ErrorLink[] = [];
        let match: RegExpExecArray | null;

        this.ERROR_PATTERN.lastIndex = 0;
        while ((match = this.ERROR_PATTERN.exec(context.line)) !== null) {
            links.push({
                startIndex: match.index,
                length: match[0].length,
                tooltip: 'Search GitHub Issues for this error',
                errorText: match[0].trim(),
            });
        }

        return links;
    }

    handleTerminalLink(link: ErrorLink): void {
        vscode.commands.executeCommand('issueFinder.searchError', link.errorText);
    }
}
