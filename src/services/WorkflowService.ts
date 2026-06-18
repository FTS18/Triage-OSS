import * as vscode from 'vscode';
import { Issue } from '../domain/types';
import { GitHubClient } from '../api/GitHubClient';

/**
 * WorkflowService provides developer-productivity helpers that work entirely
 * from issue data — no AI, no external rate-limited APIs.
 */
export class WorkflowService {
    constructor(private readonly client: GitHubClient) {}

    // ─── Branch Name ─────────────────────────────────────────────────────────

    /** Returns a conventional branch name: `type/issue-NUMBER-short-slug` */
    suggestBranchName(issue: Issue): string {
        const type = this.detectConventionalType(issue);
        const slug = issue.title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .split(/\s+/)
            .slice(0, 5)
            .join('-')
            .replace(/-{2,}/g, '-');
        return `${type}/issue-${issue.number}-${slug}`;
    }

    // ─── Commit Message ──────────────────────────────────────────────────────

    /** Returns a Conventional Commits–style commit message. */
    generateCommitMessage(issue: Issue): string {
        const type = this.detectConventionalType(issue);
        const scope = issue.repo.name;
        const title = issue.title.replace(/[^a-zA-Z0-9\s():,.-]/g, '').trim().slice(0, 70);
        return `${type}(${scope}): ${title}\n\nFixes #${issue.number}\n\nRef: ${issue.url}`;
    }

    // ─── PR Checklist ────────────────────────────────────────────────────────

    /** Generates a ready-to-paste PR description with a checklist. */
    generatePRChecklist(issue: Issue): string {
        const labels = issue.labels.map(l => l.toLowerCase());
        const type = this.detectConventionalType(issue);
        const f = (t: string) => `- [${type === t ? 'x' : ' '}]`;

        const lines: string[] = [
            `## Pull Request`,
            ``,
            `**Closes:** #${issue.number} — ${issue.title}`,
            `**Repo:** [${issue.repo.owner}/${issue.repo.name}](${issue.repo.url})`,
            ``,
            `---`,
            ``,
            `## Type of Change`,
            `${f('fix')} Bug fix`,
            `${f('feat')} New feature`,
            `${f('docs')} Documentation`,
            `${f('test')} Tests`,
            `${f('perf')} Performance`,
            `${f('refactor')} Refactor`,
            `- [ ] Breaking change`,
            ``,
            `---`,
            ``,
            `## Checklist`,
            `- [ ] I have read \`CONTRIBUTING.md\``,
            `- [ ] My code follows the project's style guidelines`,
            `- [ ] I have self-reviewed my changes`,
            `- [ ] I have added tests that prove my fix/feature works`,
            `- [ ] All existing tests pass`,
            `- [ ] I have updated documentation where applicable`,
        ];

        if (labels.some(l => l.includes('bug') || l.includes('regression'))) {
            lines.push(`- [ ] I added a regression test to prevent this bug from recurring`);
        }
        if (labels.some(l => l.includes('breaking') || l.includes('api change'))) {
            lines.push(`- [ ] I documented the breaking change in \`CHANGELOG.md\``);
            lines.push(`- [ ] I updated the migration guide`);
        }
        if (issue.repo.health?.hasCLA) {
            lines.push(`- [ ] I have signed the Contributor License Agreement (CLA)`);
        }

        lines.push(
            ``,
            `---`,
            ``,
            `## Description`,
            `<!-- Describe what you changed and why -->`,
            ``,
            `## Testing`,
            `<!-- How did you test this? Include commands to run -->`,
            `\`\`\`bash`,
            `# e.g. npm test`,
            `\`\`\``,
        );

        return lines.join('\n');
    }

    // ─── Diff Size Estimator ─────────────────────────────────────────────────

    /** Heuristic estimate of PR scope from issue metadata — no API call needed. */
    estimateDiffSize(issue: Issue): { label: string; files: string; detail: string } {
        const labels = issue.labels.map(l => l.toLowerCase());
        const bodyLen = issue.bodyText.length;
        const fileRefs = (
            issue.bodyText.match(/[a-zA-Z0-9_/\\.-]+\.(ts|js|py|go|rs|java|rb|cs|cpp|vue|svelte)/g) ?? []
        ).length;

        let score = 0;
        if (bodyLen > 400)  score += 1;
        if (bodyLen > 1200) score += 1;
        if (bodyLen > 3000) score += 2;
        if (fileRefs >= 3)  score += 1;
        if (fileRefs >= 7)  score += 2;
        if (labels.some(l => l.includes('breaking') || l.includes('refactor') || l.includes('api'))) { score += 3; }
        if (labels.some(l => l.includes('documentation') || l.includes('typo'))) { score = 0; }
        if (labels.some(l => l.includes('good first issue'))) { score = Math.min(score, 1); }

        if (score === 0) { return { label: 'Tiny', files: '1–2 files', detail: 'Quick fix or docs tweak' }; }
        if (score <= 2)  { return { label: 'Small', files: '2–5 files', detail: 'Focused, self-contained' }; }
        if (score <= 4)  { return { label: 'Medium', files: '5–10 files', detail: 'Moderate change, plan before coding' }; }
        return               { label: 'Large', files: '10+ files', detail: 'Significant refactor — discuss approach first' };
    }

    // ─── Similar Issues Finder ───────────────────────────────────────────────

    /**
     * Returns a GitHub search URL for issues similar to this one.
     * Caller can open it in the browser via vscode.env.openExternal.
     */
    similarIssuesUrl(issue: Issue): string {
        const stopWords = new Set([
            'the', 'a', 'an', 'is', 'in', 'on', 'at', 'to', 'of', 'and', 'or',
            'not', 'fix', 'bug', 'issue', 'with', 'for', 'when', 'does', 'cant',
            'cannot', 'should', 'doesnt', 'failed', 'error', 'problem',
        ]);
        const terms = issue.title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopWords.has(w))
            .slice(0, 4);
        const q = encodeURIComponent(
            `repo:${issue.repo.owner}/${issue.repo.name} is:issue ${terms.join(' ')}`
        );
        return `https://github.com/search?q=${q}&type=issues`;
    }

    // ─── CONTRIBUTING.md Fetch ───────────────────────────────────────────────

    /** Fetches CONTRIBUTING.md (or .rst / docs/ variant) from the repo. */
    async fetchContributingMd(owner: string, name: string): Promise<string | null> {
        const gql = `
            query($owner: String!, $name: String!) {
                repository(owner: $owner, name: $name) {
                    a: object(expression: "HEAD:CONTRIBUTING.md") { ... on Blob { text } }
                    b: object(expression: "HEAD:contributing.md") { ... on Blob { text } }
                    c: object(expression: "HEAD:docs/CONTRIBUTING.md") { ... on Blob { text } }
                    d: object(expression: "HEAD:.github/CONTRIBUTING.md") { ... on Blob { text } }
                }
            }
        `;
        try {
            const data = await this.client.query<{
                repository: {
                    a: { text: string } | null;
                    b: { text: string } | null;
                    c: { text: string } | null;
                    d: { text: string } | null;
                };
            }>(gql, { owner, name });
            return (
                data.repository.a?.text ??
                data.repository.b?.text ??
                data.repository.c?.text ??
                data.repository.d?.text ??
                null
            );
        } catch {
            return null;
        }
    }

    // ─── Issue-to-Branch Linker ──────────────────────────────────────────────

    /**
     * Tries to detect an issue number from the current Git branch name.
     * Handles patterns like: fix/issue-1234-*, feature/1234-*, 1234-fix-*.
     */
    extractIssueNumberFromBranch(branchName: string): number | null {
        const patterns = [
            /issue-(\d+)/i,
            /\/(\d+)-/,
            /^(\d+)-/,
            /#(\d+)/,
        ];
        for (const p of patterns) {
            const m = branchName.match(p);
            if (m) { return parseInt(m[1], 10); }
        }
        return null;
    }

    // ─── Internal Helpers ────────────────────────────────────────────────────

    /** Maps issue labels/title to a Conventional Commits type prefix. */
    private detectConventionalType(issue: Issue): string {
        const l = issue.labels.map(x => x.toLowerCase());
        const t = issue.title.toLowerCase();
        if (l.some(x => x.includes('documentation') || x.includes('docs') || x.includes('typo'))) { return 'docs'; }
        if (l.some(x => x.includes('test'))) { return 'test'; }
        if (l.some(x => x.includes('perf') || x.includes('performance'))) { return 'perf'; }
        if (l.some(x => x.includes('refactor'))) { return 'refactor'; }
        if (l.some(x => x.includes('security') || x.includes('vuln'))) { return 'fix'; }
        if (l.some(x => x.includes('bug') || x.includes('fix') || x.includes('regression'))) { return 'fix'; }
        if (l.some(x => x.includes('feature') || x.includes('enhancement') || x.includes('feat'))) { return 'feat'; }
        if (t.match(/^(fix|bug|broken|crash|error)\b/)) { return 'fix'; }
        if (t.match(/^(feat|add|implement|support|new)\b/)) { return 'feat'; }
        return 'fix';
    }
}
