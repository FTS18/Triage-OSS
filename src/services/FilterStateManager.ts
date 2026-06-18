import * as vscode from 'vscode';

export type LabelMode = 'help-wanted' | 'good-first-issue' | 'both';
export type FilterType = 'all' | 'bounty' | 'neglected' | 'abandoned' | 'zero-comment' | 'review-needed';
export type IssueType = 'all' | 'bug' | 'feature' | 'docs' | 'test' | 'performance' | 'security';
export type SortBy = 'best-match' | 'created' | 'updated' | 'reactions' | 'comments';

export interface ActiveFilter {
    // ── Existing ────────────────────────────────────────────────────────────
    languages: string[];
    labelMode: LabelMode;
    minStars: number;
    maxAgeDays: number;
    orgs: string[];
    globalSearch: boolean;
    hacktoberfestMode: boolean;
    quickWinMode: boolean;
    filterType: FilterType;
    // ── New Search Filters ──────────────────────────────────────────────────
    /** Free-text appended directly to the GitHub search query. */
    keyword: string;
    /** GitHub topic tags — each becomes a `topic:<tag>` qualifier. */
    topics: string[];
    /** Narrows results by issue category (maps to label groups). */
    issueType: IssueType;
    /** Words/phrases to exclude — each becomes `-<word>` in the query. */
    excludeKeywords: string[];
    /** Maximum repo size in KB; 0 = no limit. Smaller repos = easier to navigate. */
    maxRepoSizeKb: number;
    /** SPDX license identifier or 'any'. */
    license: string;
    /** Only show issues from repos with a commit in the last N days; 0 = no limit. */
    minActivityDays: number;
    /** Uses GitHub `no:assignee` qualifier for truly unassigned issues. */
    noAssigneeStrict: boolean;
    /** Controls the `sort:` qualifier in the GitHub search query. */
    sortBy: SortBy;
}

/**
 * Default list of well-known open-source orgs used as the fallback for the
 * Daily Challenge pool. This list is exposed as the `issueFinder.challengeOrgs`
 * setting default — users can fully override it.
 */
export const DEFAULT_CHALLENGE_ORGS: string[] = [
    'microsoft', 'google', 'facebook', 'apple', 'meta', 'amazon', 'aws', 'awslabs',
    'netflix', 'uber', 'airbnb', 'twitter', 'linkedin', 'ibm', 'intel', 'nvidia',
    'salesforce', 'adobe',
    'nodejs', 'golang', 'rust-lang', 'denoland', 'bun-sh', 'expressjs', 'fastify',
    'nestproject', 'apache', 'mozilla', 'torvalds', 'electron', 'github',
    'vuejs', 'angular', 'vercel', 'sveltejs', 'vitejs', 'webpack', 'babel',
    'eslint', 'prettier', 'rollup',
    'prisma', 'supabase', 'docker', 'kubernetes', 'hashicorp', 'elastic',
    'cloudflare', 'grafana', 'prometheus', 'tailscale', 'postmanlabs', 'redis', 'mongodb',
    'tensorflow', 'pytorch', 'openai', 'huggingface',
];

/** Known GSoC-participating organizations (a curated subset). */
export const GSOC_ORGS: string[] = [
    'google', 'mozilla', 'apache', 'python', 'postgresql', 'drupal',
    'joomla', 'kde', 'gnome', 'ceph', 'freebsd', 'git', 'gnu',
    'grpc', 'haiku-inc', 'jenkins', 'kubernetes', 'libreoffice',
    'llvm', 'openstack', 'ruby', 'scala', 'sympy', 'tensorflow',
    'videolan', 'wxwidgets', 'xorg', 'zulip', 'openmrs', 'rstudio',
    'fossgis', 'oppia', 'mlpack',
];

export class FilterStateManager {
    private filterType: FilterType = 'all';

    constructor(private readonly config: vscode.WorkspaceConfiguration) {}

    getActiveFilter(): ActiveFilter {
        const orgs: string[] = this.config.get('filterOrgs') ?? [];
        const globalSearch: boolean = this.config.get('globalSearch') ?? false;

        // Backward compatibility: single-language → array
        const legacyLanguage = this.config.get<string>('filterLanguage');
        const languages = this.config.get<string[]>('filterLanguages')
            ?? (legacyLanguage ? [legacyLanguage] : ['TypeScript']);

        return {
            // Existing
            languages,
            labelMode: this.config.get('filterLabelMode') ?? 'both',
            minStars: this.config.get('filterMinStars') ?? 100,
            maxAgeDays: this.config.get('filterMaxAgeDays') ?? 365,
            orgs: globalSearch ? [] : orgs,
            globalSearch,
            hacktoberfestMode: this.config.get('hacktoberfestMode') ?? false,
            quickWinMode: this.config.get('quickWinMode') ?? false,
            filterType: this.filterType,
            // New
            keyword: this.config.get<string>('filterKeyword') ?? '',
            topics: this.config.get<string[]>('filterTopics') ?? [],
            issueType: this.config.get<IssueType>('filterIssueType') ?? 'all',
            excludeKeywords: this.config.get<string[]>('filterExcludeKeywords') ?? [],
            maxRepoSizeKb: this.config.get<number>('filterMaxRepoSizeKb') ?? 0,
            license: this.config.get<string>('filterLicense') ?? 'any',
            minActivityDays: this.config.get<number>('filterMinActivityDays') ?? 0,
            noAssigneeStrict: this.config.get<boolean>('filterNoAssigneeStrict') ?? false,
            sortBy: this.config.get<SortBy>('filterSortBy') ?? 'best-match',
        };
    }

    setFilterType(type: FilterType): void {
        this.filterType = type;
    }

    buildLabelQuery(labelMode: LabelMode): string {
        if (labelMode === 'help-wanted') { return 'label:"help wanted"'; }
        if (labelMode === 'good-first-issue') { return 'label:"good first issue"'; }
        return 'label:"help wanted" label:"good first issue"';
    }
}
