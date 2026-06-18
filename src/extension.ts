import * as vscode from 'vscode';
import { GitHubClient } from './api/GitHubClient';
import { RateLimitManager } from './api/RateLimitManager';
import { BountyAggregator, AlgoraFetcher, PolarFetcher } from './api/BountyClient';
import { CacheManager } from './cache/CacheManager';
import { IssueRepository } from './repositories/IssueRepository';
import { IssueListProvider } from './providers/IssueTreeProvider';
import { ActivityTreeProvider } from './providers/ActivityTreeProvider';
import { TrendingTreeProvider } from './providers/TrendingTreeProvider';
import { GitHubIssueHoverProvider } from './providers/GitHubIssueHoverProvider';
import { IssueWebviewPanel } from './providers/IssueWebviewPanel';
import { SettingsWebviewProvider } from './providers/SettingsWebviewProvider';
import { SettingsWebviewPanel } from './providers/SettingsWebviewPanel';
import { IssueLensProvider } from './providers/IssueLensProvider';
import { ImportHoverProvider } from './providers/ImportHoverProvider';
import { TerminalLinkProvider } from './providers/TerminalLinkProvider';
import { StatusBarController } from './controllers/StatusBarController';
import { ForkService } from './services/ForkService';
import { CloneService } from './services/CloneService';
import { FilterStateManager, FilterType, DEFAULT_CHALLENGE_ORGS } from './services/FilterStateManager';
import { WorkflowService } from './services/WorkflowService';
import { ContributorAnalytics } from './services/ContributorAnalytics';
import { TrendingService } from './services/TrendingService';
import { ProfileManager } from './services/ProfileManager';

import { IntelligenceService } from './services/IntelligenceService';
import { CompositeFilter, NeglectFilter, BountyFilter, ZeroCommentFilter, AbandonedFilter } from './domain/filters';
import { Issue } from './domain/types';

/** Languages shown in the first-run picker, ordered by popularity. */
const POPULAR_LANGUAGES = [
    'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'C#',
    'C++', 'PHP', 'Ruby', 'Swift', 'Kotlin', 'Dart', 'Scala', 'Elixir',
];

/** On first activation, prompt the user to pick their primary language. */
async function maybeSetDefaultLanguage(context: vscode.ExtensionContext): Promise<void> {
    if (context.globalState.get<boolean>('defaultLanguageSet')) { return; }

    const picks = POPULAR_LANGUAGES.map(l => ({ label: l }));
    const selected = await vscode.window.showQuickPick(picks, {
        placeHolder: 'What language do you mainly code in? (used to filter issues)',
        title: 'Triage-OSS — Welcome! Pick your primary language',
        canPickMany: false,
    });

    if (selected) {
        await vscode.workspace.getConfiguration('issueFinder').update(
            'filterLanguages', [selected.label], vscode.ConfigurationTarget.Global
        );
    }

    await context.globalState.update('defaultLanguageSet', true);
}

export function activate(context: vscode.ExtensionContext): void {
    const config = vscode.workspace.getConfiguration('issueFinder');
    const token: string = config.get('githubToken') ?? '';

    if (!token) {
        vscode.window.showWarningMessage(
            'Triage-OSS: Set a GitHub token in Settings to get started.',
            'Open Settings'
        ).then(action => {
            if (action) { vscode.commands.executeCommand('issueFinder.openSettingsPanel'); }
        });
    }

    // ─── Core Services ───────────────────────────────────────────────────────

    const rateLimitBuffer: number = config.get('rateLimitBuffer') ?? 10;
    const rateLimiter    = new RateLimitManager(rateLimitBuffer);
    const githubClient   = new GitHubClient(token, rateLimiter);
    const cache          = new CacheManager(context.workspaceState);
    const cacheSeconds: number = config.get('cacheSeconds') ?? 300;

    const intelConfig = {
        hardStarThreshold:    config.get<number>('intelligence.hardStarThreshold')    ?? 50000,
        mediumStarThreshold:  config.get<number>('intelligence.mediumStarThreshold')  ?? 5000,
        hardBodyLength:       config.get<number>('intelligence.hardBodyLength')        ?? 2000,
        mediumBodyLength:     config.get<number>('intelligence.mediumBodyLength')      ?? 500,
        quickWinMaxBodyLength:config.get<number>('intelligence.quickWinMaxBodyLength') ?? 800,
    };
    const intelligence    = new IntelligenceService(intelConfig);
    const issueRepo       = new IssueRepository(githubClient, cache, cacheSeconds, intelligence);
    const bountyAggregator = new BountyAggregator([new AlgoraFetcher(), new PolarFetcher()]);

    const forkService     = new ForkService(githubClient);
    const cloneService    = new CloneService();
    const filterManager   = new FilterStateManager(config);
    const profileManager  = new ProfileManager(githubClient, context.globalState);

    // ─── New Services ────────────────────────────────────────────────────────

    const workflowService = new WorkflowService(githubClient);
    const analytics       = new ContributorAnalytics(githubClient);
    const trendingService = new TrendingService(githubClient);

    // ─── Tree Providers ──────────────────────────────────────────────────────

    const feedProvider      = new IssueListProvider('issue');
    const watchlistProvider = new IssueListProvider('watchlistIssue');
    const challengeProvider = new IssueListProvider('issue');
    const statusBar         = new StatusBarController();
    const lensProvider      = new IssueLensProvider();

    const activityProvider  = new ActivityTreeProvider(
        analytics,
        () => vscode.workspace.getConfiguration('issueFinder').get<string>('githubUsername') ?? ''
    );
    const trendingProvider = new TrendingTreeProvider(trendingService);

    watchlistProvider.setPlaceholder('No saved issues. Click the bookmark icon on any issue to save it.');
    challengeProvider.setPlaceholder('Loading daily challenge from open-source orgs...');

    vscode.window.registerTreeDataProvider('issueFinder.feed',           feedProvider);
    vscode.window.registerTreeDataProvider('issueFinder.watchlist',       watchlistProvider);
    vscode.window.registerTreeDataProvider('issueFinder.dailyChallenge',  challengeProvider);
    vscode.window.registerTreeDataProvider('issueFinder.myActivity',      activityProvider);
    vscode.window.registerTreeDataProvider('issueFinder.trending',        trendingProvider);
    vscode.window.registerWebviewViewProvider(SettingsWebviewProvider.viewType, new SettingsWebviewProvider(context));

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            [{ language: 'typescript' }, { language: 'javascript' }, { language: 'typescriptreact' }, { language: 'javascriptreact' }],
            lensProvider
        ),
        // Existing hover for npm imports
        vscode.languages.registerHoverProvider(
            [{ language: 'typescript' }, { language: 'javascript' }, { language: 'typescriptreact' }, { language: 'javascriptreact' }],
            new ImportHoverProvider()
        ),
        // NEW: Hover over any GitHub issue/PR URL in any file
        vscode.languages.registerHoverProvider(
            { scheme: '*', language: '*' },
            new GitHubIssueHoverProvider(githubClient, cache)
        ),
        vscode.window.registerTerminalLinkProvider(new TerminalLinkProvider()),
        statusBar,
    );

    let allIssues: Issue[] = [];

    const restoreWatchlist = () => {
        const savedUrls: string[] = context.globalState.get('watchlist', []);
        const savedIssues = allIssues.filter(i => savedUrls.includes(i.url));
        watchlistProvider.updateResponse({ issues: savedIssues, endCursor: null, hasNextPage: false });
    };

    // ─── Feed Refresh ────────────────────────────────────────────────────────

    const refreshFeed = async (isLoadMore = false) => {
        statusBar.setLoading();
        const activeFilter = filterManager.getActiveFilter();
        const profile = profileManager.getProfile();

        try {
            let response: { issues: Issue[]; endCursor: string | null; hasNextPage: boolean };

            if (activeFilter.orgs.length > 0) {
                try {
                    response = await issueRepo.searchByOrgs(activeFilter.orgs, activeFilter, profile);
                } catch (orgErr) {
                    vscode.window.showErrorMessage(`Triage-OSS: Org search failed (${(orgErr as Error).message}).`);
                    response = { issues: [], endCursor: null, hasNextPage: false };
                }
            } else {
                response = await issueRepo.searchIssues(activeFilter, profile);
            }

            let raw = response.issues;

            const bountyMap = await bountyAggregator.fetchAll();
            raw = raw.map(i => ({ ...i, bounty: bountyMap.get(i.url) }));

            const healthResults = await Promise.allSettled(
                raw.slice(0, IssueRepository.healthFetchLimit).map(i =>
                    issueRepo.getRepoHealth(i.repo.owner, i.repo.name).then(h => ({ id: i.id, health: h }))
                )
            );
            healthResults.forEach(r => {
                if (r.status === 'fulfilled') {
                    const found = raw.find(i => i.id === r.value.id);
                    if (found) { found.repo.health = r.value.health; }
                }
            });

            allIssues = isLoadMore ? [...allIssues, ...raw] : raw;
            const filtered = applyActiveFilterType(allIssues, activeFilter.filterType);

            if (isLoadMore) {
                feedProvider.appendResponse({ ...response, issues: filtered });
            } else {
                feedProvider.updateResponse({ ...response, issues: filtered });
            }
            statusBar.updateWithIssues(allIssues);
            restoreWatchlist();

        } catch (err) {
            vscode.window.showErrorMessage(`Triage-OSS: ${(err as Error).message}`);
            feedProvider.updateResponse({ issues: [], endCursor: null, hasNextPage: false });
            statusBar.updateWithIssues([]);
        }
    };

    const refreshChallenge = async () => {
        try {
            const profile = profileManager.getProfile();
            const challengeOrgs: string[] = config.get('challengeOrgs') ?? DEFAULT_CHALLENGE_ORGS;
            const response = await issueRepo.searchChallengeOrgs(challengeOrgs, profile);
            const picked = pickRandom(response.issues, 5);
            challengeProvider.updateResponse({ ...response, issues: picked });
        } catch {
            challengeProvider.setPlaceholder('Could not load challenge. Check your token.');
            challengeProvider.refresh();
        }
    };

    // ─── Helper: resolve issue from tree item or raw issue ───────────────────

    const resolveIssue = (arg: Issue | { issue: Issue }): Issue =>
        'issue' in arg ? arg.issue : arg;

    // ─── Register Commands ───────────────────────────────────────────────────

    context.subscriptions.push(

        // ── Existing ──────────────────────────────────────────────────────────

        vscode.commands.registerCommand('issueFinder.refresh', () => {
            void refreshFeed(false);
            void refreshChallenge();
        }),

        vscode.commands.registerCommand('issueFinder.openSettingsPanel', () => {
            SettingsWebviewPanel.show(context);
        }),

        vscode.commands.registerCommand('issueFinder.loadMore', async (provider: IssueListProvider) => {
            if (provider !== feedProvider) { return; }
            const cursor = provider.getCursor();
            if (!cursor) { return; }

            statusBar.setLoading();
            const activeFilter = filterManager.getActiveFilter();
            const profile = profileManager.getProfile();

            try {
                const response = await issueRepo.searchIssues(activeFilter, profile, cursor);
                const bountyMap = await bountyAggregator.fetchAll();
                const issuesWithBounties = response.issues.map(i => ({ ...i, bounty: bountyMap.get(i.url) }));
                allIssues.push(...issuesWithBounties);
                const filtered = applyActiveFilterType(issuesWithBounties, activeFilter.filterType);
                provider.appendResponse({ ...response, issues: filtered });
            } catch (err) {
                vscode.window.showErrorMessage(`Load more failed: ${(err as Error).message}`);
            } finally {
                statusBar.updateWithIssues(allIssues);
            }
        }),

        vscode.commands.registerCommand('issueFinder.openIssue', (issue: Issue) => {
            IssueWebviewPanel.show(issue, context);
        }),

        vscode.commands.registerCommand('issueFinder.configureFilters', async () => {
            const filterTypePick = await vscode.window.showQuickPick([
                { label: 'All Issues',                             id: 'all' as FilterType },
                { label: 'Bounty Only',                            id: 'bounty' as FilterType },
                { label: 'Neglected (reactions but no replies)',    id: 'neglected' as FilterType },
                { label: 'Zero Comments',                          id: 'zero-comment' as FilterType },
                { label: 'Abandoned (assigned but stale)',          id: 'abandoned' as FilterType },
            ], { placeHolder: 'Filter type — then configure language/orgs in Settings' });

            if (!filterTypePick) { return; }
            filterManager.setFilterType(filterTypePick.id);

            const next = await vscode.window.showQuickPick([
                { label: 'Apply Filter Now',                                id: 'apply' },
                { label: 'Open Settings (language / orgs / stars)',         id: 'settings' },
            ], { placeHolder: 'What next?' });

            if (next?.id === 'settings') {
                vscode.commands.executeCommand('issueFinder.openSettingsPanel');
                return;
            }
            void refreshFeed();
        }),

        vscode.commands.registerCommand('issueFinder.saveIssue', (issue: Issue) => {
            if (!issue) { return; }
            const saved: string[] = context.globalState.get('watchlist', []);
            if (!saved.includes(issue.url)) {
                saved.push(issue.url);
                context.globalState.update('watchlist', saved);
                vscode.window.showInformationMessage(`Saved: ${issue.title}`);
            }
            watchlistProvider.updateResponse({
                issues: allIssues.filter(i => saved.includes(i.url)),
                endCursor: null, hasNextPage: false,
            });
        }),

        vscode.commands.registerCommand('issueFinder.removeFromWatchlist', (item: { issue: Issue }) => {
            const url = item?.issue?.url;
            if (!url) { return; }
            const saved: string[] = context.globalState.get('watchlist', []);
            const updated = saved.filter(u => u !== url);
            context.globalState.update('watchlist', updated);
            watchlistProvider.updateResponse({
                issues: allIssues.filter(i => updated.includes(i.url)),
                endCursor: null, hasNextPage: false,
            });
        }),

        vscode.commands.registerCommand('issueFinder.jumpIn', async (issueOrItem: Issue | { issue: Issue }) => {
            const issue = resolveIssue(issueOrItem);
            try {
                const cloneUrl = await forkService.fork(issue.repo.owner, issue.repo.name);
                const targetDir = await cloneService.clone(cloneUrl, issue.repo.name, issue.repo.owner, issue.number);
                vscode.window.showInformationMessage(`Forked & cloning into ${targetDir}`);
            } catch (err) {
                vscode.window.showErrorMessage(`Fork failed: ${(err as Error).message}`);
            }
        }),

        vscode.commands.registerCommand('issueFinder.roulette', () => {
            void refreshChallenge();
        }),

        vscode.commands.registerCommand('issueFinder.searchError', (errorText: string) => {
            const query = encodeURIComponent(errorText.slice(0, 100));
            vscode.env.openExternal(vscode.Uri.parse(`https://github.com/search?q=${query}&type=issues`));
        }),

        vscode.commands.registerCommand('issueFinder.openInCodespaces', (issueOrItem: Issue | { issue: Issue }) => {
            const issue = resolveIssue(issueOrItem);
            vscode.env.openExternal(vscode.Uri.parse(`https://github.dev/${issue.repo.owner}/${issue.repo.name}`));
        }),

        vscode.commands.registerCommand('issueFinder.openInGitpod', (issueOrItem: Issue | { issue: Issue }) => {
            const issue = resolveIssue(issueOrItem);
            vscode.env.openExternal(vscode.Uri.parse(`https://gitpod.io/#https://github.com/${issue.repo.owner}/${issue.repo.name}`));
        }),



        // ── NEW: Workflow Tools ───────────────────────────────────────────────

        vscode.commands.registerCommand('issueFinder.suggestBranch', async (issueOrItem: Issue | { issue: Issue }) => {
            const issue = resolveIssue(issueOrItem);
            const branch = workflowService.suggestBranchName(issue);
            await vscode.env.clipboard.writeText(branch);

            const action = await vscode.window.showInformationMessage(
                `Branch name copied: \`${branch}\``,
                'Set as Current Branch', 'Dismiss'
            );
            if (action === 'Set as Current Branch') {
                // Try to create the branch via VS Code's git extension
                const gitExt = vscode.extensions.getExtension('vscode.git')?.exports;
                const git = gitExt?.getAPI(1);
                const repo = git?.repositories?.[0];
                if (repo) {
                    try {
                        await repo.createBranch(branch, true);
                        vscode.window.showInformationMessage(`Switched to branch: ${branch}`);
                    } catch (e) {
                        vscode.window.showErrorMessage(`Could not create branch: ${(e as Error).message}`);
                    }
                }
            }
        }),

        vscode.commands.registerCommand('issueFinder.copyCommitMessage', async (issueOrItem: Issue | { issue: Issue }) => {
            const issue = resolveIssue(issueOrItem);
            const msg = workflowService.generateCommitMessage(issue);
            await vscode.env.clipboard.writeText(msg);
            vscode.window.showInformationMessage(`Commit message copied to clipboard.`);
        }),

        vscode.commands.registerCommand('issueFinder.viewContributing', async (issueOrItem: Issue | { issue: Issue }) => {
            const issue = resolveIssue(issueOrItem);
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Fetching CONTRIBUTING.md from ${issue.repo.owner}/${issue.repo.name}…`,
                cancellable: false,
            }, async () => {
                const content = await workflowService.fetchContributingMd(issue.repo.owner, issue.repo.name);
                if (!content) {
                    vscode.window.showWarningMessage(
                        `No CONTRIBUTING.md found in ${issue.repo.owner}/${issue.repo.name}.`,
                        'View on GitHub'
                    ).then(a => {
                        if (a) {
                            vscode.env.openExternal(vscode.Uri.parse(`${issue.repo.url}/blob/HEAD/CONTRIBUTING.md`));
                        }
                    });
                    return;
                }
                const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
                await vscode.window.showTextDocument(doc, { preview: true });
            });
        }),

        vscode.commands.registerCommand('issueFinder.generatePRChecklist', async (issueOrItem: Issue | { issue: Issue }) => {
            const issue = resolveIssue(issueOrItem);
            const checklist = workflowService.generatePRChecklist(issue);
            await vscode.env.clipboard.writeText(checklist);

            const action = await vscode.window.showInformationMessage(
                'PR checklist copied to clipboard. Open in editor?',
                'Yes', 'No'
            );
            if (action === 'Yes') {
                const doc = await vscode.workspace.openTextDocument({ content: checklist, language: 'markdown' });
                await vscode.window.showTextDocument(doc);
            }
        }),

        vscode.commands.registerCommand('issueFinder.estimateDiff', async (issueOrItem: Issue | { issue: Issue }) => {
            const issue = resolveIssue(issueOrItem);
            const est = workflowService.estimateDiffSize(issue);
            vscode.window.showInformationMessage(
                `Estimated diff size: ${est.label} (${est.files}) — ${est.detail}`
            );
        }),

        vscode.commands.registerCommand('issueFinder.findSimilarIssues', async (issueOrItem: Issue | { issue: Issue }) => {
            const issue = resolveIssue(issueOrItem);

            // Show quick pick: search in GitHub browser OR show inline results
            const action = await vscode.window.showQuickPick([
                { label: '$(link-external) Open Similar Issues in GitHub', id: 'browser' },
                { label: '$(search) Fetch Similar Issues Inline', id: 'inline' },
            ], { placeHolder: `Find issues similar to: ${issue.title.slice(0, 50)}` });

            if (action?.id === 'browser') {
                vscode.env.openExternal(vscode.Uri.parse(workflowService.similarIssuesUrl(issue)));
            } else if (action?.id === 'inline') {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Finding similar issues…',
                    cancellable: false,
                }, async () => {
                    const similar = await issueRepo.searchSimilarIssues(issue);
                    if (similar.length === 0) {
                        vscode.window.showInformationMessage('No similar issues found in this repo.');
                        return;
                    }
                    const picks = similar.map(s => ({
                        label: `#${s.number} ${s.title}`,
                        detail: s.url,
                        issue: s,
                    }));
                    const picked = await vscode.window.showQuickPick(picks, { placeHolder: 'Select an issue to open' });
                    if (picked) {
                        IssueWebviewPanel.show(picked.issue, context);
                    }
                });
            }
        }),

        vscode.commands.registerCommand('issueFinder.checkPRStatus', async (issueOrItem: Issue | { issue: Issue }) => {
            const issue = resolveIssue(issueOrItem);
            const prCount = issue.intelligence?.competition.prCount ?? 0;
            if (prCount === 0) {
                vscode.window.showInformationMessage(
                    `✅ No linked PRs found for #${issue.number}. It's clear to work on!`
                );
            } else {
                const action = await vscode.window.showWarningMessage(
                    `⚠️ ${prCount} PR(s) already linked to #${issue.number}. Someone may already be working on this.`,
                    'View on GitHub', 'Proceed Anyway'
                );
                if (action === 'View on GitHub') {
                    vscode.env.openExternal(vscode.Uri.parse(issue.url));
                }
            }
        }),

        vscode.commands.registerCommand('issueFinder.linkBranchToIssue', async () => {
            const gitExt = vscode.extensions.getExtension('vscode.git')?.exports;
            const git = gitExt?.getAPI(1);
            const repo = git?.repositories?.[0];
            const branch = repo?.state?.HEAD?.name ?? '';

            if (!branch) {
                vscode.window.showWarningMessage('Could not detect current Git branch.');
                return;
            }

            const issueNumber = workflowService.extractIssueNumberFromBranch(branch);
            if (!issueNumber) {
                vscode.window.showInformationMessage(
                    `Branch "${branch}" doesn't contain an issue number (expected: fix/issue-1234-*).`
                );
                return;
            }

            const linked = allIssues.find(i => i.number === issueNumber);
            if (linked) {
                IssueWebviewPanel.show(linked, context);
            } else {
                vscode.window.showInformationMessage(
                    `Issue #${issueNumber} linked to branch "${branch}" — opening on GitHub.`,
                    'Open on GitHub'
                ).then(a => {
                    if (a) {
                        // Try to find the repo from the git remote
                        const remote = repo?.state?.remotes?.[0]?.fetchUrl ?? '';
                        const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
                        if (match) {
                            vscode.env.openExternal(vscode.Uri.parse(
                                `https://github.com/${match[1]}/${match[2]}/issues/${issueNumber}`
                            ));
                        }
                    }
                });
            }
        }),

        // ── NEW: Export Watchlist ─────────────────────────────────────────────

        vscode.commands.registerCommand('issueFinder.exportWatchlist', async () => {
            const savedUrls: string[] = context.globalState.get('watchlist', []);
            const savedIssues = allIssues.filter(i => savedUrls.includes(i.url));

            if (savedIssues.length === 0) {
                vscode.window.showInformationMessage('Watchlist is empty. Save some issues first.');
                return;
            }

            const fmt = await vscode.window.showQuickPick(
                [{ label: 'Markdown', id: 'md' }, { label: 'CSV', id: 'csv' }],
                { placeHolder: 'Export format' }
            );
            if (!fmt) { return; }

            let content: string;
            if (fmt.id === 'md') {
                const rows = savedIssues.map(i =>
                    `- [#${i.number} ${i.title}](${i.url}) — \`${i.repo.owner}/${i.repo.name}\` ` +
                    `[${i.intelligence?.difficulty ?? '?'}] ${i.intelligence?.winProbability ?? 0}% win`
                ).join('\n');
                content = `# Triage-OSS Watchlist\n\n_Exported: ${new Date().toLocaleDateString()}_\n\n${rows}\n`;
            } else {
                const header = 'Number,Title,URL,Repo,Difficulty,WinRate,Stars,Language\n';
                const rows = savedIssues.map(i =>
                    `${i.number},"${i.title.replace(/"/g, '""')}",${i.url},` +
                    `${i.repo.owner}/${i.repo.name},` +
                    `${i.intelligence?.difficulty ?? ''},${i.intelligence?.winProbability ?? ''},` +
                    `${i.repo.stars},${i.repo.language}`
                ).join('\n');
                content = header + rows;
            }

            const doc = await vscode.workspace.openTextDocument({
                content,
                language: fmt.id === 'md' ? 'markdown' : 'plaintext',
            });
            await vscode.window.showTextDocument(doc);
        }),

        // ── NEW: Activity (My PRs / Commented Issues) ─────────────────────────

        vscode.commands.registerCommand('issueFinder.refreshActivity', () => {
            void activityProvider.refresh();
        }),

        // ── NEW: Trending ─────────────────────────────────────────────────────

        vscode.commands.registerCommand('issueFinder.refreshTrending', () => {
            void trendingProvider.refresh(true);
        }),

        // ── NEW: Compact/Expanded Toggle ──────────────────────────────────────

        vscode.commands.registerCommand('issueFinder.toggleCompactView', () => {
            feedProvider.toggleCompact();
            const label = feedProvider.isCompact() ? 'compact' : 'full';
            vscode.window.showInformationMessage(`Issue Feed switched to ${label} view.`);
        }),

    );

    // ─── Startup Sequence ────────────────────────────────────────────────────

    void (async () => {
        await maybeSetDefaultLanguage(context);

        try {
            if (token) { await profileManager.syncProfile(); }
        } catch (err) {
            console.error('Profile sync failed', err);
        }

        void refreshFeed();
        void refreshChallenge();

        // Lazy-load activity and trending so they don't block startup
        setTimeout(() => { void activityProvider.refresh(); }, 3000);
        setTimeout(() => { void trendingProvider.refresh(); }, 5000);
    })();
}

export function deactivate(): void {}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyActiveFilterType(issues: Issue[], filterType: string): Issue[] {
    switch (filterType) {
        case 'bounty':       return new BountyFilter().apply(issues);
        case 'neglected':    return new NeglectFilter().apply(issues);
        case 'zero-comment': return new ZeroCommentFilter().apply(issues);
        case 'abandoned':    return new AbandonedFilter().apply(issues);
        default:             return issues;
    }
}

function pickRandom<T>(arr: T[], n: number): T[] {
    return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}
