import * as vscode from 'vscode';

const NPM_REGISTRY = 'https://registry.npmjs.org';
const IMPORT_PATTERN = /(?:import|require)\s*[\({'"]*\s*['"]([^'"@][^'"]*)['"]/;

export class ImportHoverProvider implements vscode.HoverProvider {
    private readonly cache = new Map<string, vscode.MarkdownString | null>();

    async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
        const lineText = document.lineAt(position.line).text;
        const match = IMPORT_PATTERN.exec(lineText);
        if (!match) { return undefined; }

        const packageName = match[1].split('/')[0];
        const content = await this.buildHoverContent(packageName);
        if (!content) { return undefined; }

        return new vscode.Hover(content);
    }

    private async buildHoverContent(packageName: string): Promise<vscode.MarkdownString | null> {
        if (this.cache.has(packageName)) {
            return this.cache.get(packageName) ?? null;
        }

        try {
            const res = await fetch(`${NPM_REGISTRY}/${packageName}/latest`);
            if (!res.ok) { this.cache.set(packageName, null); return null; }

            const data = await res.json() as {
                description?: string;
                homepage?: string;
                repository?: { url?: string };
                version?: string;
            };

            const md = new vscode.MarkdownString(
                `**${packageName}** \`v${data.version ?? '?'}\`\n\n` +
                `${data.description ?? ''}\n\n` +
                `[View on npm](https://npmjs.com/package/${packageName})`
            );
            md.isTrusted = true;

            this.cache.set(packageName, md);
            return md;
        } catch {
            this.cache.set(packageName, null);
            return null;
        }
    }
}
