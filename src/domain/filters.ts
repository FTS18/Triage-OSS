import { Issue } from './types';

export interface IIssueFilter {
    apply(issues: Issue[]): Issue[];
}

export class NeglectFilter implements IIssueFilter {
    constructor(
        private readonly minReactions: number = 3,
        private readonly minAgeDays: number = 30
    ) {}

    apply(issues: Issue[]): Issue[] {
        const cutoff = Date.now() - this.minAgeDays * 86_400_000;
        return issues.filter(i =>
            i.commentCount === 0 &&
            i.reactionCount >= this.minReactions &&
            new Date(i.createdAt).getTime() < cutoff
        );
    }
}

export class BountyFilter implements IIssueFilter {
    apply(issues: Issue[]): Issue[] {
        return issues.filter(i => i.bounty !== undefined);
    }
}

export class ZeroCommentFilter implements IIssueFilter {
    apply(issues: Issue[]): Issue[] {
        return issues.filter(i => i.commentCount === 0);
    }
}

export class AbandonedFilter implements IIssueFilter {
    constructor(private readonly staleAfterDays: number = 14) {}

    apply(issues: Issue[]): Issue[] {
        const cutoff = Date.now() - this.staleAfterDays * 86_400_000;
        return issues.filter(i =>
            i.assignees.length > 0 &&
            new Date(i.updatedAt).getTime() < cutoff
        );
    }
}

export class LanguageFilter implements IIssueFilter {
    constructor(private readonly language: string) {}

    apply(issues: Issue[]): Issue[] {
        return issues.filter(
            i => i.repo.language?.toLowerCase() === this.language.toLowerCase()
        );
    }
}

export class CompositeFilter implements IIssueFilter {
    constructor(private readonly filters: IIssueFilter[]) {}

    apply(issues: Issue[]): Issue[] {
        return this.filters.reduce((acc, f) => f.apply(acc), issues);
    }
}
