export interface Issue {
    id: string;
    number: number;
    title: string;
    url: string;
    bodyText: string;
    reactionCount: number;
    commentCount: number;
    createdAt: string;
    updatedAt: string;
    labels: string[];
    assignees: string[];
    repo: Repo;
    bounty?: BountyInfo;
    intelligence?: IssueIntelligence;
}

export interface IssueComment {
    id: string;
    bodyHTML: string;
    createdAt: string;
    author: {
        login: string;
        avatarUrl: string;
    };
}

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface IssueIntelligence {
    difficulty: Difficulty;
    winProbability: number;
    competition: {
        assigned: boolean;
        prCount: number;
        activeCommenters: number;
    };
    isBestMatch: boolean;
    isQuickWin: boolean;
}

export interface Repo {
    owner: string;
    name: string;
    stars: number;
    language: string;
    url: string;
    health?: RepoHealth;
}

export interface RepoHealth {
    avgCloseTimeDays: number;
    prMergeRate: number;
    hasCLA: boolean;
    avgFirstResponseDays: number;
}

export interface BountyInfo {
    amount: number;
    currency: string;
    platform: string;
    url: string;
}

export interface IssueFilter {
    language?: string;
    bountyOnly?: boolean;
    zeroComments?: boolean;
    abandonedOnly?: boolean;
    neglectedOnly?: boolean;
    query?: string;
}

export interface IntelligenceConfig {
    hardStarThreshold: number;
    mediumStarThreshold: number;
    hardBodyLength: number;
    mediumBodyLength: number;
    quickWinMaxBodyLength: number;
}

// ─── Contributor Analytics ────────────────────────────────────────────────────

export interface MyPR {
    number: number;
    title: string;
    url: string;
    state: 'OPEN' | 'MERGED' | 'CLOSED';
    repoNameWithOwner: string;
    createdAt: string;
}

export interface ContributorStats {
    totalPRs: number;
    mergedPRs: number;
    openPRs: number;
    closedPRs: number;
    winRate: number;        // % of submitted PRs that were merged
    contributedRepos: string[];
    recentPRs: MyPR[];
    commentedIssueCount: number;
}

export interface CommentedIssue {
    number: number;
    title: string;
    url: string;
    repoNameWithOwner: string;
}

// ─── Trending ─────────────────────────────────────────────────────────────────

export interface TrendingRepo {
    owner: string;
    name: string;
    description: string;
    stars: number;
    language: string;
    url: string;
    openIssuesCount: number;
}
