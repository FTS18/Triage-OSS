import { Issue, Difficulty, IssueIntelligence, IntelligenceConfig } from '../domain/types';
import { UserProfile } from './ProfileManager';

export class IntelligenceService {
    constructor(private readonly config: IntelligenceConfig) {}

    calculateScore(issue: Issue, profile: UserProfile | null = null): IssueIntelligence {
        return {
            difficulty: this.scoreDifficulty(issue),
            winProbability: this.scoreWinProbability(issue),
            competition: this.analyzeCompetition(issue),
            isBestMatch: this.calculateSkillMatch(issue, profile),
            isQuickWin: this.checkQuickWin(issue),
        };
    }

    private scoreDifficulty(issue: Issue): Difficulty {
        const labels = issue.labels.map(l => l.toLowerCase());
        // Explicit "easy" labels always win — maintainer knows best
        if (labels.some(l => l.includes('good first issue') || l.includes('beginner') || l.includes('easy'))) {
            return 'Easy';
        }
        const bodyLength = issue.bodyText.length;
        const starCount = issue.repo.stars;

        // High star repos = complex codebases = harder to navigate
        // Long issue bodies usually mean more context / reproduction steps needed
        if (starCount > this.config.hardStarThreshold || bodyLength > this.config.hardBodyLength) {
            return 'Hard';
        }
        if (starCount > this.config.mediumStarThreshold || bodyLength > this.config.mediumBodyLength) {
            return 'Medium';
        }
        return 'Easy';
    }

    private scoreWinProbability(issue: Issue): number {
        const health = issue.repo.health;

        // No health data yet — return a neutral baseline instead of inflating
        if (!health) { return 50; }

        // Base: assume 50/50 chance before any signal
        let score = 50;

        // Maintainer responsiveness — fast close = active maintainers = PRs get reviewed
        if (health.avgCloseTimeDays < 7) { score += 20; }    // Very responsive repo
        else if (health.avgCloseTimeDays > 30) { score -= 10; } // Slow to close = slow to merge

        // PR merge rate: each percentage point above 50% adds 0.4 to score
        // e.g. 75% merge rate → +10 pts; 25% merge rate → -10 pts
        score += (health.prMergeRate - 50) * 0.4;

        // Issue age signals
        const ageInDays = (Date.now() - new Date(issue.createdAt).getTime()) / 86_400_000;
        if (ageInDays < 7) { score += 10; }   // Fresh issue — high chance it's still wanted
        if (ageInDays > 180) { score -= 15; } // 6+ months old — risk of being stale or resolved

        // Clamp to [5, 99] — never show 0% or 100% (too absolute)
        return Math.min(Math.max(Math.round(score), 5), 99);
    }

    private analyzeCompetition(issue: Issue): { assigned: boolean; prCount: number; activeCommenters: number } {
        const body = issue.bodyText.toLowerCase();
        const assigned = issue.assignees.length > 0 || body.includes('assigned');
        return { assigned, prCount: 0, activeCommenters: issue.commentCount };
    }

    private calculateSkillMatch(issue: Issue, profile: UserProfile | null): boolean {
        if (!profile) { return false; }
        const userLangs = profile.topLanguages.map(l => l.toLowerCase());
        const issueLang = issue.repo.language.toLowerCase();
        return userLangs.includes(issueLang);
    }

    private checkQuickWin(issue: Issue): boolean {
        const bodyLen = issue.bodyText.length;
        const labels = issue.labels.map(l => l.toLowerCase());
        const isGoodFirst = labels.some(l => l.includes('good first issue'));
        return isGoodFirst && bodyLen < this.config.quickWinMaxBodyLength;
    }
}
