import * as vscode from 'vscode';
import { DEFAULT_CHALLENGE_ORGS } from '../services/FilterStateManager';

export class SettingsWebviewPanel {
    private static instance: SettingsWebviewPanel | undefined;
    private readonly panel: vscode.WebviewPanel;

    private constructor(private readonly _context: vscode.ExtensionContext) {
        this.panel = vscode.window.createWebviewPanel(
            'issueFinder.settingsPanel',
            'Contributor Profile & Settings',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this._context.extensionUri]
            }
        );

        this.panel.onDidDispose(() => {
            SettingsWebviewPanel.instance = undefined;
        });

        this.panel.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'saveSettings': {
                    const config = vscode.workspace.getConfiguration('issueFinder');
                    try {
                        await config.update('githubToken', data.settings.githubToken, vscode.ConfigurationTarget.Global);
                        await config.update('githubUsername', data.settings.githubUsername, vscode.ConfigurationTarget.Global);

                        await config.update('filterLanguages', data.settings.filterLanguages, vscode.ConfigurationTarget.Global);
                        await config.update('filterMinStars', Number(data.settings.filterMinStars), vscode.ConfigurationTarget.Global);
                        await config.update('filterOrgs', data.settings.filterOrgs, vscode.ConfigurationTarget.Global);
                        await config.update('globalSearch', data.settings.globalSearch, vscode.ConfigurationTarget.Global);
                        await config.update('filterLabelMode', data.settings.filterLabelMode, vscode.ConfigurationTarget.Global);

                        vscode.window.showInformationMessage('Triage-OSS: Settings saved successfully!');
                        // Trigger refresh of all feeds
                        await vscode.commands.executeCommand('issueFinder.refresh');
                        
                        this.panel.dispose();
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to save settings: ${(err as Error).message}`);
                    }
                    break;
                }
                case 'openBrowser': {
                    if (data.url) {
                        vscode.env.openExternal(vscode.Uri.parse(data.url));
                    }
                    break;
                }
                case 'cancel': {
                    this.panel.dispose();
                    break;
                }
            }
        }, undefined, _context.subscriptions);
    }

    public static show(context: vscode.ExtensionContext): void {
        if (!SettingsWebviewPanel.instance) {
            SettingsWebviewPanel.instance = new SettingsWebviewPanel(context);
        }
        SettingsWebviewPanel.instance.render();
        SettingsWebviewPanel.instance.panel.reveal(vscode.ViewColumn.Active);
    }

    private render(): void {
        this.panel.webview.html = this.buildHtml();
    }

    private buildHtml(): string {
        const config = vscode.workspace.getConfiguration('issueFinder');
        
        const githubToken = config.get<string>('githubToken') ?? '';
        const githubUsername = config.get<string>('githubUsername') ?? '';
        const filterLanguages = config.get<string[]>('filterLanguages') ?? ['TypeScript'];
        const filterMinStars = config.get<number>('filterMinStars') ?? 100;
        const filterOrgs = config.get<string[]>('filterOrgs') ?? [];
        const globalSearch = config.get<boolean>('globalSearch') ?? false;
        const filterLabelMode = config.get<string>('filterLabelMode') ?? 'both';

        // Pre-convert arrays to JSON so they can be parsed by Webview JS
        const languagesJson = JSON.stringify(filterLanguages);
        const orgsJson = JSON.stringify(filterOrgs);
        // Use the user-configurable challengeOrgs as the default org pool for the UI picker
        const defaultOrgsJson = JSON.stringify(config.get<string[]>('challengeOrgs') ?? DEFAULT_CHALLENGE_ORGS);

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Profile & Settings</title>
<style>
    :root {
        --font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", system-ui, sans-serif);
        --font-size: var(--vscode-font-size, 13px);
        --bg-color: var(--vscode-editor-background, #1e1e1e);
        --fg-color: var(--vscode-foreground, #cccccc);
        --input-bg: var(--vscode-input-background, #3c3c3c);
        --input-fg: var(--vscode-input-foreground, #cccccc);
        --input-border: var(--vscode-input-border, transparent);
        --focus-border: var(--vscode-focusBorder, #007fd4);
        --btn-bg: var(--vscode-button-background, #0e639c);
        --btn-fg: var(--vscode-button-foreground, #ffffff);
        --btn-hover: var(--vscode-button-hoverBackground, #1177bb);
        --btn-sec-bg: var(--vscode-button-secondaryBackground, #3a3d41);
        --btn-sec-fg: var(--vscode-button-secondaryForeground, #ffffff);
        --btn-sec-hover: var(--vscode-button-secondaryHoverBackground, #45494e);
        --border-color: var(--vscode-widget-border, #3c3c3c);
        --badge-bg: var(--vscode-badge-background, #2d2d30);
        --badge-fg: var(--vscode-badge-foreground, #f1f1f1);
        --link-fg: var(--vscode-textLink-foreground, #3794ff);
        --card-bg: var(--vscode-welcomePage-tileBackground, var(--vscode-editorWidget-background, rgba(37, 37, 38, 0.4)));
    }

    body {
        font-family: var(--font-family);
        font-size: var(--font-size);
        color: var(--fg-color);
        background-color: var(--bg-color);
        padding: 32px;
        margin: 0;
        line-height: 1.5;
    }

    .container {
        max-width: 1000px;
        margin: 0 auto;
    }

    .header {
        margin-bottom: 24px;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 12px;
    }

    .header h1 {
        font-size: 2em;
        font-weight: 500;
        margin: 0 0 6px 0;
        color: var(--vscode-editor-foreground, var(--vscode-foreground, #ffffff));
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .header p {
        margin: 0;
        font-size: 1.1em;
        color: var(--vscode-descriptionForeground, #858585);
    }

    /* Grid Layout */
    .grid {
        display: grid;
        grid-template-columns: 1fr 1.2fr;
        gap: 24px;
        margin-bottom: 32px;
    }

    @media (max-width: 768px) {
        .grid {
            grid-template-columns: 1fr;
        }
    }

    /* Cards */
    .card {
        background-color: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 20px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .card h2 {
        font-size: 1.25em;
        font-weight: 600;
        margin-top: 0;
        margin-bottom: 16px;
        color: var(--vscode-editor-foreground, var(--vscode-foreground, #ffffff));
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .card-actions {
        font-size: 0.8em;
        font-weight: normal;
        display: flex;
        gap: 12px;
    }

    /* Form Fields */
    .form-group {
        margin-bottom: 20px;
    }

    .form-group:last-child {
        margin-bottom: 0;
    }

    label {
        display: block;
        font-weight: 600;
        margin-bottom: 8px;
    }

    input[type="text"],
    input[type="password"],
    input[type="number"],
    select {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 12px;
        font-size: 1em;
        font-family: inherit;
        background-color: var(--input-bg);
        color: var(--input-fg);
        border: 1px solid var(--input-border);
        border-radius: 4px;
        outline: none;
        transition: border-color 0.15s ease;
    }

    input:focus, select:focus {
        border-color: var(--focus-border);
    }

    /* Checkbox list */
    .checkbox-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: 10px;
    }

    .checkbox-item {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        padding: 6px 10px;
        background-color: rgba(255,255,255,0.03);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        transition: background-color 0.1s ease, border-color 0.1s ease;
    }

    .checkbox-item:hover {
        background-color: rgba(255,255,255,0.06);
        border-color: var(--focus-border);
    }

    .checkbox-item input[type="checkbox"] {
        accent-color: var(--btn-bg);
        cursor: pointer;
        margin: 0;
        width: 14px;
        height: 14px;
    }

    .checkbox-item span {
        user-select: none;
    }

    /* Search Scope Toggle Mode */
    .scope-selector {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 20px;
    }

    .scope-option {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        cursor: pointer;
        background-color: rgba(255, 255, 255, 0.02);
        transition: background-color 0.15s, border-color 0.15s;
    }

    .scope-option:hover {
        background-color: rgba(255, 255, 255, 0.05);
        border-color: var(--focus-border);
    }

    .scope-option.selected {
        background-color: rgba(14, 99, 156, 0.1);
        border-color: var(--btn-bg);
    }

    .scope-option input[type="radio"] {
        accent-color: var(--btn-bg);
        margin-top: 3px;
        cursor: pointer;
    }

    .scope-option-desc {
        display: flex;
        flex-direction: column;
    }

    .scope-option-title {
        font-weight: 600;
        margin-bottom: 2px;
    }

    .scope-option-help {
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground, #858585);
    }

    /* Orgs Panel Section */
    .orgs-section {
        transition: opacity 0.25s ease, pointer-events 0.25s ease;
    }

    .orgs-section.disabled {
        opacity: 0.35;
        pointer-events: none;
    }

    /* Tag List for Custom Orgs */
    .tag-input-container {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
    }

    .tag-container {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .tag {
        display: inline-flex;
        align-items: center;
        background-color: var(--badge-bg);
        color: var(--badge-fg);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 3px 10px;
        font-size: 0.9em;
    }

    .tag-remove {
        margin-left: 8px;
        cursor: pointer;
        font-weight: bold;
        opacity: 0.7;
    }

    .tag-remove:hover {
        opacity: 1;
        color: var(--vscode-testing-iconFailedColor, #f14c4c);
    }

    /* Buttons */
    button {
        padding: 8px 16px;
        font-size: 1.05em;
        font-family: inherit;
        font-weight: 500;
        border: 1px solid var(--vscode-button-border, transparent);
        border-radius: 4px;
        cursor: pointer;
        outline: none;
        transition: background-color 0.15s ease;
    }

    button:focus-visible {
        outline: 2px solid var(--focus-border);
        outline-offset: 1px;
    }

    .btn-primary {
        background-color: var(--btn-bg);
        color: var(--btn-fg);
    }

    .btn-primary:hover {
        background-color: var(--btn-hover);
    }

    .btn-secondary {
        background-color: var(--btn-sec-bg);
        color: var(--btn-sec-fg);
        border: 1px solid var(--vscode-button-secondaryBorder, transparent);
    }

    .btn-secondary:hover {
        background-color: var(--btn-sec-hover);
    }

    .btn-small {
        padding: 4px 12px;
        font-size: 0.9em;
    }

    .actions-bar {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        border-top: 1px solid var(--border-color);
        padding-top: 20px;
    }

    /* Help text */
    .help-text {
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground, #858585);
        margin-top: 6px;
    }

    .link {
        color: var(--link-fg);
        text-decoration: none;
        cursor: pointer;
    }

    .link:hover {
        text-decoration: underline;
    }

    .icon {
        width: 14px;
        height: 14px;
        fill: currentColor;
        vertical-align: middle;
        display: inline-block;
    }
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>
            <svg class="icon" style="width: 24px; height: 24px;" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.3.7-2.4.5v1.2l2.4.5.3.7-1.3 2 .9.9 2-1.3.7.3.5 2.4h1.2l.5-2.4.7-.3 2 1.3.9-.9-1.3-2 .3-.7 2.4-.5V8.6l-2.4-.5-.3-.7 1.3-2-.9-.8-2 1.3-.7-.3zM8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>
            Contributor Profile & Settings
        </h1>
        <p>Customize your language stacks, target organizations, and search preferences for findable issues.</p>
    </div>

    <form id="settingsForm">
        <div class="grid">
            <!-- Left Column: Preferences -->
            <div class="card">
                <h2>General Preferences</h2>

                <!-- GitHub Token -->
                <div class="form-group">
                    <label for="githubToken">GitHub PAT</label>
                    <input type="password" id="githubToken" value="${githubToken}" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
                    <div class="help-text">
                        Token with <code>public_repo</code> scope. Generate at <a class="link" onclick="vscode.postMessage({ type: 'openBrowser', url: 'https://github.com/settings/tokens' })">GitHub</a>.
                    </div>
                </div>

                <!-- GitHub Username -->
                <div class="form-group">
                    <label for="githubUsername">GitHub Username</label>
                    <input type="text" id="githubUsername" value="${githubUsername}" placeholder="e.g. torvalds">
                    <div class="help-text">
                        Used to automatically configure Git remotes when forking repositories.
                    </div>
                </div>


                <!-- Preferred Labels -->
                <div class="form-group">
                    <label for="filterLabelMode">Preferred Labels</label>
                    <select id="filterLabelMode">
                        <option value="both" ${filterLabelMode === 'both' ? 'selected' : ''}>Both (Help Wanted & Good First Issue)</option>
                        <option value="good-first-issue" ${filterLabelMode === 'good-first-issue' ? 'selected' : ''}>Good First Issue Only</option>
                        <option value="help-wanted" ${filterLabelMode === 'help-wanted' ? 'selected' : ''}>Help Wanted Only</option>
                    </select>
                </div>

                <!-- Min Stars -->
                <div class="form-group">
                    <label for="filterMinStars">Minimum Repository Stars</label>
                    <input type="number" id="filterMinStars" value="${filterMinStars}" min="0">
                </div>

                <!-- Languages Tech Stack -->
                <div class="form-group">
                    <label style="display: flex; justify-content: space-between; align-items: center;">
                        <span>Tech Stack & Languages</span>
                        <span class="card-actions">
                            <a class="link" onclick="selectAllLanguages(true)">Select All</a>
                            <a class="link" onclick="selectAllLanguages(false)">Clear All</a>
                        </span>
                    </label>
                    <div class="checkbox-grid" id="languagesGrid">
                        <!-- Filled by JS -->
                    </div>
                </div>
            </div>

            <!-- Right Column: Organizations -->
            <div class="card">
                <h2>Search Scope</h2>

                <!-- Scope Toggle -->
                <div class="scope-selector">
                    <div class="scope-option ${globalSearch ? 'selected' : ''}" id="scopeGlobal" onclick="setScope(true)">
                        <input type="radio" name="scopeRadio" id="radioGlobal" ${globalSearch ? 'checked' : ''}>
                        <div class="scope-option-desc">
                            <span class="scope-option-title">Search Globally</span>
                            <span class="scope-option-help">Search across all open repositories on GitHub matching your stacks.</span>
                        </div>
                    </div>
                    <div class="scope-option ${!globalSearch ? 'selected' : ''}" id="scopeOrgs" onclick="setScope(false)">
                        <input type="radio" name="scopeRadio" id="radioOrgs" ${!globalSearch ? 'checked' : ''}>
                        <div class="scope-option-desc">
                            <span class="scope-option-title">Filter by Organizations</span>
                            <span class="scope-option-help">Limit the search to the selected default and custom organizations below.</span>
                        </div>
                    </div>
                </div>

                <!-- Organizations List (conditionally disabled) -->
                <div class="orgs-section ${globalSearch ? 'disabled' : ''}" id="orgsSection">
                    <div class="form-group">
                        <label style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <span>Default Organizations</span>
                            <span class="card-actions">
                                <a class="link" onclick="selectAllOrgs(true)">Select All</a>
                                <a class="link" onclick="selectAllOrgs(false)">Clear All</a>
                            </span>
                        </label>
                        <div class="checkbox-grid" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));" id="defaultOrgsGrid">
                            <!-- Filled by JS -->
                        </div>
                    </div>

                    <!-- Custom Orgs Tag Input -->
                    <div class="form-group" style="margin-top: 24px;">
                        <label for="orgInput">Custom Organizations</label>
                        <div class="tag-input-container">
                            <input type="text" id="orgInput" placeholder="e.g. facebook, supabase, bun-sh">
                            <button type="button" class="btn-secondary btn-small" id="addOrgBtn">Add</button>
                        </div>
                        <div class="tag-container" id="tagContainer"></div>
                        <div class="help-text">Feed will search within these orgs in addition to the selected defaults.</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="actions-bar">
            <button type="button" class="btn-secondary" onclick="vscode.postMessage({ type: 'cancel' })">Cancel</button>
            <button type="submit" class="btn-primary">Save & Apply Settings</button>
        </div>
    </form>
</div>

<script>
    const vscode = acquireVsCodeApi();
    
    // Loaded configs
    let activeLanguages = ${languagesJson};
    let activeOrgs = ${orgsJson};
    let isGlobalSearch = ${globalSearch};
    
    const defaultOrgs = ${defaultOrgsJson};
    const popularLanguages = [
        'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'C++', 'Java', 'C', 'C#', 'PHP', 
        'HTML', 'CSS', 'Ruby', 'Swift', 'Kotlin', 'Objective-C', 'Dart', 'Shell', 'PowerShell', 
        'SQL', 'Scala', 'Clojure', 'Elixir', 'Haskell', 'Lua', 'R', 'Julia', 'Zig', 'Solidity', 
        'F#', 'OCaml'
    ];

    // Render Tech Stack checkboxes
    function renderLanguages() {
        const grid = document.getElementById('languagesGrid');
        grid.innerHTML = '';
        popularLanguages.forEach(lang => {
            const label = document.createElement('label');
            label.className = 'checkbox-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = lang;
            checkbox.checked = activeLanguages.includes(lang);
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    if (!activeLanguages.includes(lang)) activeLanguages.push(lang);
                } else {
                    activeLanguages = activeLanguages.filter(l => l !== lang);
                }
            });

            const span = document.createElement('span');
            span.textContent = lang;

            label.appendChild(checkbox);
            label.appendChild(span);
            grid.appendChild(label);
        });
    }

    // Select/Deselect all languages
    window.selectAllLanguages = function(val) {
        activeLanguages = val ? [...popularLanguages] : [];
        renderLanguages();
    };

    // Render Default Orgs checkboxes
    function renderDefaultOrgs() {
        const grid = document.getElementById('defaultOrgsGrid');
        grid.innerHTML = '';
        defaultOrgs.forEach(org => {
            const label = document.createElement('label');
            label.className = 'checkbox-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = org;
            checkbox.checked = activeOrgs.includes(org);
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    if (!activeOrgs.includes(org)) activeOrgs.push(org);
                } else {
                    activeOrgs = activeOrgs.filter(o => o !== org);
                }
                renderTags();
            });

            const span = document.createElement('span');
            span.textContent = org;

            label.appendChild(checkbox);
            label.appendChild(span);
            grid.appendChild(label);
        });
    }

    // Select/Deselect all default orgs
    window.selectAllOrgs = function(val) {
        if (val) {
            // Add all defaults without duplication
            defaultOrgs.forEach(org => {
                if (!activeOrgs.includes(org)) activeOrgs.push(org);
            });
        } else {
            // Remove all defaults
            activeOrgs = activeOrgs.filter(org => !defaultOrgs.includes(org));
        }
        renderDefaultOrgs();
        renderTags();
    };

    // Render Custom Orgs (which are in activeOrgs but NOT in defaultOrgs)
    function renderTags() {
        const container = document.getElementById('tagContainer');
        container.innerHTML = '';
        const customOrgs = activeOrgs.filter(org => !defaultOrgs.includes(org));
        
        customOrgs.forEach(org => {
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.innerHTML = \`\${escapeHtml(org)}<span class="tag-remove" onclick="removeCustomOrg('\${org}')">&times;</span>\`;
            container.appendChild(tag);
        });
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    window.removeCustomOrg = function(orgName) {
        activeOrgs = activeOrgs.filter(org => org !== orgName);
        renderTags();
    };

    // Add Custom Org
    document.getElementById('addOrgBtn').addEventListener('click', () => {
        const input = document.getElementById('orgInput');
        const val = input.value.trim().toLowerCase();
        if (val) {
            if (defaultOrgs.includes(val)) {
                // It's a default org, check it instead of adding as custom
                if (!activeOrgs.includes(val)) {
                    activeOrgs.push(val);
                    renderDefaultOrgs();
                    renderTags();
                }
            } else if (!activeOrgs.includes(val)) {
                activeOrgs.push(val);
                renderTags();
            }
            input.value = '';
        }
    });

    document.getElementById('orgInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('addOrgBtn').click();
        }
    });

    // Set Scope (Global vs Filtered Orgs)
    window.setScope = function(global) {
        isGlobalSearch = global;
        
        const cardGlobal = document.getElementById('scopeGlobal');
        const cardOrgs = document.getElementById('scopeOrgs');
        const radioGlobal = document.getElementById('radioGlobal');
        const radioOrgs = document.getElementById('radioOrgs');
        const orgsSection = document.getElementById('orgsSection');

        if (global) {
            cardGlobal.classList.add('selected');
            cardOrgs.classList.remove('selected');
            radioGlobal.checked = true;
            radioOrgs.checked = false;
            orgsSection.classList.add('disabled');
        } else {
            cardGlobal.classList.remove('selected');
            cardOrgs.classList.add('selected');
            radioGlobal.checked = false;
            radioOrgs.checked = true;
            orgsSection.classList.remove('disabled');
        }
    };

    // Form Submit
    document.getElementById('settingsForm').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const githubToken = document.getElementById('githubToken').value.trim();
        const githubUsername = document.getElementById('githubUsername').value.trim();
        const filterLabelMode = document.getElementById('filterLabelMode').value;
        const filterMinStars = document.getElementById('filterMinStars').value;

        vscode.postMessage({
            type: 'saveSettings',
            settings: {
                githubToken,
                githubUsername,
                filterLanguages: activeLanguages,
                filterMinStars,
                filterOrgs: activeOrgs,
                globalSearch: isGlobalSearch,
                filterLabelMode
            }
        });
    });

    // Initial renders
    renderLanguages();
    renderDefaultOrgs();
    renderTags();
</script>
</body>
</html>`;
    }
}
