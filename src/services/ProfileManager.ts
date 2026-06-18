import * as vscode from 'vscode';
import { GitHubClient } from '../api/GitHubClient';

export interface UserProfile {
    topLanguages: string[];
    streak: number;
    lastSynced: number;
}

export class ProfileManager {
    private profile: UserProfile | null = null;

    constructor(
        private readonly client: GitHubClient,
        private readonly state: vscode.Memento
    ) {
        this.profile = this.state.get<UserProfile>('userProfile') ?? null;
    }

    async syncProfile(): Promise<UserProfile> {
        const data = await this.client.fetchUserProfile();
        this.profile = {
            ...data,
            lastSynced: Date.now()
        };
        await this.state.update('userProfile', this.profile);
        return this.profile;
    }

    getProfile(): UserProfile | null {
        return this.profile;
    }

    isBestMatch(issueLanguage: string): boolean {
        if (!this.profile) { return false; }
        return this.profile.topLanguages.some(
            l => l.toLowerCase() === issueLanguage.toLowerCase()
        );
    }
}
