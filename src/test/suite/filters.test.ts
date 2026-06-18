import * as assert from 'assert';
import { Issue } from '../../domain/types';
import {
    NeglectFilter, BountyFilter, ZeroCommentFilter,
    AbandonedFilter, LanguageFilter, CompositeFilter,
} from '../../domain/filters';

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
    id: '1', number: 1, title: 'Test', url: 'https://github.com/a/b/issues/1',
    bodyText: '', reactionCount: 0, commentCount: 0,
    createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    updatedAt: new Date().toISOString(),
    labels: [], assignees: [],
    repo: { owner: 'a', name: 'b', stars: 100, language: 'TypeScript', url: 'https://github.com/a/b' },
    ...overrides,
});

suite('Domain Filters', () => {
    suite('NeglectFilter', () => {
        test('keeps old issues with reactions and no comments', () => {
            const issue = makeIssue({ reactionCount: 5 });
            assert.strictEqual(new NeglectFilter().apply([issue]).length, 1);
        });

        test('excludes issues with comments', () => {
            const issue = makeIssue({ reactionCount: 5, commentCount: 1 });
            assert.strictEqual(new NeglectFilter().apply([issue]).length, 0);
        });
    });

    suite('BountyFilter', () => {
        test('keeps issues with bounty', () => {
            const issue = makeIssue({ bounty: { amount: 100, currency: 'USD', platform: 'Algora', url: '' } });
            assert.strictEqual(new BountyFilter().apply([issue]).length, 1);
        });

        test('excludes issues without bounty', () => {
            assert.strictEqual(new BountyFilter().apply([makeIssue()]).length, 0);
        });
    });

    suite('ZeroCommentFilter', () => {
        test('keeps zero-comment issues', () => {
            assert.strictEqual(new ZeroCommentFilter().apply([makeIssue()]).length, 1);
        });

        test('excludes commented issues', () => {
            const issue = makeIssue({ commentCount: 3 });
            assert.strictEqual(new ZeroCommentFilter().apply([issue]).length, 0);
        });
    });

    suite('AbandonedFilter', () => {
        test('keeps assigned stale issues', () => {
            const staleDate = new Date(Date.now() - 20 * 86_400_000).toISOString();
            const issue = makeIssue({ assignees: ['user1'], updatedAt: staleDate });
            assert.strictEqual(new AbandonedFilter().apply([issue]).length, 1);
        });

        test('excludes unassigned issues', () => {
            assert.strictEqual(new AbandonedFilter().apply([makeIssue()]).length, 0);
        });
    });

    suite('LanguageFilter', () => {
        test('matches language case-insensitively', () => {
            const issue = makeIssue({ repo: { ...makeIssue().repo, language: 'TypeScript' } });
            assert.strictEqual(new LanguageFilter('typescript').apply([issue]).length, 1);
        });
    });

    suite('CompositeFilter', () => {
        test('applies multiple filters in sequence', () => {
            const issues = [
                makeIssue({ reactionCount: 5, commentCount: 0 }),
                makeIssue({ reactionCount: 5, commentCount: 1 }),
            ];
            const result = new CompositeFilter([new ZeroCommentFilter(), new NeglectFilter()]).apply(issues);
            assert.strictEqual(result.length, 1);
        });
    });
});
