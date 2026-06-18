import * as vscode from 'vscode';

const IMPORT_PATTERN = /(?:import|require)\s*[\({'"]*\s*['"]([^'"@][^'"]*)['"]/g;
const NPM_REGISTRY = 'https://registry.npmjs.org';

export class IssueLensProvider implements vscode.CodeLensProvider {
    private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    private readonly repoCache = new Map<string, string | null>();

    async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        const lenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const packageNames = this.extractPackages(text, document);

        await Promise.allSettled(
            packageNames.map(async ({ name, range }) => {
                const repo = await this.resolveRepo(name);
                if (!repo) { return; }

                const lens = new vscode.CodeLens(range, {
                    title: `🐛 View open issues for ${name}`,
                    command: 'issueFinder.searchError',
                    arguments: [name, repo],
                });
                lenses.push(lens);
            })
        );

        return lenses;
    }

    private extractPackages(text: string, document: vscode.TextDocument): { name: string; range: vscode.Range }[] {
        const results: { name: string; range: vscode.Range }[] = [];
        const seen = new Set<string>();
        let match: RegExpExecArray | null;

        IMPORT_PATTERN.lastIndex = 0;
        while ((match = IMPORT_PATTERN.exec(text)) !== null) {
            const pkg = match[1].split('/')[0];
            if (seen.has(pkg)) { continue; }
            seen.add(pkg);

            const pos = document.positionAt(match.index);
            results.push({ name: pkg, range: new vscode.Range(pos, pos) });
        }

        return results;
    }

    private async resolveRepo(packageName: string): Promise<string | null> {
        if (this.repoCache.has(packageName)) {
            return this.repoCache.get(packageName) ?? null;
        }

        try {
            const res = await fetch(`${NPM_REGISTRY}/${packageName}/latest`);
            if (!res.ok) { this.repoCache.set(packageName, null); return null; }

            const data = await res.json() as { repository?: { url?: string } };
            const url = data.repository?.url ?? null;
            const githubUrl = url?.replace(/^git\+/, '').replace(/\.git$/, '') ?? null;

            this.repoCache.set(packageName, githubUrl);
            return githubUrl;
        } catch {
            this.repoCache.set(packageName, null);
            return null;
        }
    }

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}
