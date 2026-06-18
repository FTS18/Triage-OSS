import * as vscode from 'vscode';

export class SettingsWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'issueFinder.settings';
    private _view?: vscode.WebviewView;

    constructor(private readonly _context: vscode.ExtensionContext) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._context.extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'openSettingsPanel': {
                    void vscode.commands.executeCommand('issueFinder.openSettingsPanel');
                    break;
                }
            }
        });

        // Refresh HTML when window becomes visible or active to show updated configurations
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
            }
        });

        // Listen for config changes to automatically refresh the summary HTML
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('issueFinder') && this._view) {
                this._view.webview.html = this._getHtmlForWebview(this._view.webview);
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const config = vscode.workspace.getConfiguration('issueFinder');
        
        const githubToken = config.get<string>('githubToken') ?? '';
        const filterLanguages = config.get<string[]>('filterLanguages') ?? ['TypeScript'];
        const filterMinStars = config.get<number>('filterMinStars') ?? 100;
        const filterOrgs = config.get<string[]>('filterOrgs') ?? [];
        const globalSearch = config.get<boolean>('globalSearch') ?? false;
        const filterLabelMode = config.get<string>('filterLabelMode') ?? 'both';

        const hasToken = githubToken.trim().length > 0;
        const tokenLabel = hasToken ? '••••••••' : 'Not configured';
        const tokenClass = hasToken ? 'configured' : 'not-configured';

        const labelModeLabel = filterLabelMode === 'both' 
            ? 'Help Wanted & Good First' 
            : filterLabelMode === 'good-first-issue' 
                ? 'Good First Issue' 
                : 'Help Wanted';

        const scopeLabel = globalSearch 
            ? 'Global GitHub Search' 
            : `${filterOrgs.length} selected organizations`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Profile & Settings</title>
<style>
    body {
        font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", sans-serif);
        font-size: var(--vscode-font-size, 13px);
        color: var(--vscode-foreground, #cccccc);
        background-color: var(--vscode-sideBar-background, var(--vscode-editor-background, #1e1e1e));
        padding: 16px;
        margin: 0;
        line-height: 1.4;
    }

    h3 {
        font-size: 1.1em;
        font-weight: 600;
        margin-top: 0;
        margin-bottom: 16px;
        color: var(--vscode-foreground, #ffffff);
        border-bottom: 1px solid var(--vscode-widget-border, #3c3c3c);
        padding-bottom: 6px;
    }

    .summary-card {
        background-color: var(--vscode-welcomePage-tileBackground, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--vscode-widget-border, #3c3c3c);
        border-radius: 4px;
        padding: 12px;
        margin-bottom: 16px;
    }

    .summary-item {
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
        font-size: 0.95em;
    }

    .summary-item:last-child {
        margin-bottom: 0;
    }

    .summary-label {
        color: var(--vscode-descriptionForeground, #858585);
        font-weight: 500;
    }

    .summary-val {
        color: var(--vscode-foreground);
        font-weight: 600;
        text-align: right;
        max-width: 60%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .summary-val.not-configured {
        color: var(--vscode-testing-iconFailedColor, #f14c4c);
    }

    .summary-val.configured {
        color: var(--vscode-testing-iconPassedColor, #2ea44f);
    }

    /* Primary Button */
    button {
        box-sizing: border-box;
        width: 100%;
        padding: 8px 14px;
        font-size: var(--vscode-font-size, 13px);
        font-family: inherit;
        font-weight: 500;
        border: 1px solid var(--vscode-button-border, transparent);
        border-radius: var(--vscode-button-border-radius, 2px);
        cursor: pointer;
        outline: none;
        transition: background-color 0.1s ease;
        background-color: var(--vscode-button-background, #0e639c);
        color: var(--vscode-button-foreground, #ffffff);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
    }

    button:hover {
        background-color: var(--vscode-button-hoverBackground, #1177bb);
    }

    button:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 1px;
    }

    .icon {
        width: 14px;
        height: 14px;
        fill: currentColor;
    }
</style>
</head>
<body>
    <h3>Active Profile</h3>
    <div class="summary-card">
        <div class="summary-item">
            <span class="summary-label">GitHub PAT</span>
            <span class="summary-val ${tokenClass}">${tokenLabel}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Languages</span>
            <span class="summary-val" title="${filterLanguages.join(', ')}">${filterLanguages.join(', ') || 'Any'}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Min Stars</span>
            <span class="summary-val">≥ ${filterMinStars}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Labels</span>
            <span class="summary-val" title="${labelModeLabel}">${labelModeLabel}</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Scope</span>
            <span class="summary-val" title="${scopeLabel}">${scopeLabel}</span>
        </div>
    </div>

    <button id="openSettingsBtn">
        <svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.3.7-2.4.5v1.2l2.4.5.3.7-1.3 2 .9.9 2-1.3.7.3.5 2.4h1.2l.5-2.4.7-.3 2 1.3.9-.9-1.3-2 .3-.7 2.4-.5V8.6l-2.4-.5-.3-.7 1.3-2-.9-.8-2 1.3-.7-.3zM8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>
        Configure Settings
    </button>

    <script>
        const vscode = acquireVsCodeApi();
        document.getElementById('openSettingsBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'openSettingsPanel' });
        });
    </script>
</body>
</html>`;
    }
}
