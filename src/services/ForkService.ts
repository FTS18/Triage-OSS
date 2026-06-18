import { GitHubClient } from '../api/GitHubClient';

export class ForkService {
    constructor(private readonly client: GitHubClient) {}

    async fork(owner: string, repo: string): Promise<string> {
        const data = await this.client.restPost<{ clone_url: string }>(
            `/repos/${owner}/${repo}/forks`,
            {}
        );
        return data.clone_url;
    }
}
