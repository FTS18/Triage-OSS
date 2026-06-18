import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class CloneService {
    async clone(cloneUrl: string, repoName: string, originalOwner: string, issueNumber?: number): Promise<string> {
        const targetDir = path.join(os.tmpdir(), 'osif-workspaces', repoName);
        
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Jump In: Setting up ${repoName}...`,
            cancellable: false
        }, async (progress) => {
            try {
                // 1. Clone the fork
                progress.report({ message: 'Cloning repository...' });
                await execAsync(`git clone "${cloneUrl}" "${targetDir}"`);

                // 2. Set upstream
                progress.report({ message: 'Configuring remotes...' });
                const originalUrl = `https://github.com/${originalOwner}/${repoName}.git`;
                await execAsync(`git remote add upstream "${originalUrl}"`, { cwd: targetDir });

                // 3. Enable DCO (signOff)
                progress.report({ message: 'Applying DCO settings...' });
                await execAsync(`git config --local format.signOff true`, { cwd: targetDir });

                // 4. Checkout branch
                if (issueNumber) {
                    progress.report({ message: 'Creating branch...' });
                    await execAsync(`git checkout -b fix/issue-${issueNumber}`, { cwd: targetDir });
                }

                // Finally open the folder in a new window
                progress.report({ message: 'Opening workspace...' });
                vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetDir), true);

                return targetDir;
            } catch (err) {
                throw new Error(`Git operation failed: ${(err as Error).message}`);
            }
        });
    }
}
