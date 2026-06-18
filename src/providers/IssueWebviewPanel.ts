import * as vscode from 'vscode';
import { Issue } from '../domain/types';

export class IssueWebviewPanel {
    private static instance: IssueWebviewPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private currentIssue?: Issue;

    private constructor(context: vscode.ExtensionContext) {
        this.panel = vscode.window.createWebviewPanel(
            'issueFinder.detail',
            'Issue Detail',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.onDidDispose(() => {
            IssueWebviewPanel.instance = undefined;
        });

        this.panel.webview.onDidReceiveMessage(msg => {
            this.handleMessage(msg);
        }, undefined, context.subscriptions);
    }

    static show(issue: Issue, context: vscode.ExtensionContext): void {
        if (!IssueWebviewPanel.instance) {
            IssueWebviewPanel.instance = new IssueWebviewPanel(context);
        }
        IssueWebviewPanel.instance.render(issue);
        IssueWebviewPanel.instance.panel.reveal(vscode.ViewColumn.Beside);
    }

    private render(issue: Issue): void {
        this.currentIssue = issue;
        this.panel.title = `#${issue.number} · ${issue.repo.name}`;
        this.panel.webview.html = this.buildHtml(issue);
    }

    private handleMessage(msg: { command: string; url?: string }): void {
        if (msg.command === 'openBrowser' && msg.url) {
            vscode.env.openExternal(vscode.Uri.parse(msg.url));
        }
        if (msg.command === 'jumpIn' && this.currentIssue) {
            vscode.commands.executeCommand('issueFinder.jumpIn', this.currentIssue);
        }
        if (msg.command === 'save' && this.currentIssue) {
            vscode.commands.executeCommand('issueFinder.saveIssue', this.currentIssue);
        }
    }

    private buildHtml(issue: Issue): string {
        const health = issue.repo.health;
        const mergeClass = !health 
            ? 'health-unknown' 
            : health.prMergeRate >= 70 
                ? 'health-good' 
                : health.prMergeRate >= 40 
                    ? 'health-warning' 
                    : 'health-critical';

        // SVG icons
        const iconBounty = `<svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path fill="currentColor" d="M8.5 4.5a.5.5 0 0 0-1 0v.5h-.5a1.5 1.5 0 0 0 0 3h1.5a.5.5 0 0 1 0 1H6.5a.5.5 0 0 0 0 1h1v.5a.5.5 0 0 0 1 0v-.5h.5a1.5 1.5 0 0 0 0-3H7.5a.5.5 0 0 1 0-1h1.5a.5.5 0 0 0 0-1H8v-.5z"/></svg>`;
        const iconStar = `<svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.695z"/></svg>`;
        const iconThumbsUp = `<svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M2 10.5a.5.5 0 0 1 .5-.5h.75a.5.5 0 0 1 .5.5v3.5a.5.5 0 0 1-.5.5h-.75a.5.5 0 0 1-.5-.5v-3.5zM3.25 9A1.75 1.75 0 0 0 1.5 10.75v3.5c0 .966.784 1.75 1.75 1.75h.75a1.75 1.75 0 0 0 1.75-1.75v-3.5A1.75 1.75 0 0 0 4 9h-.75zM7.051 1.455a1.85 1.85 0 0 1 2.87 2.083L9.12 6.5h3.63a1.75 1.75 0 0 1 1.664 2.288l-1.362 4.425A1.75 1.75 0 0 1 11.388 15H6.25a1.75 1.75 0 0 1-1.75-1.75V9.006c0-.385.127-.76.36-1.062L7.051 1.455zM9.122 2.29a.35.35 0 0 0-.543-.395L6.383 8.014A.25.25 0 0 0 6.58 8.42h6.17a.25.25 0 0 0 .238-.327l-1.362-4.425a.25.25 0 0 0-.238-.168H8.81a.75.75 0 0 1-.723-.943l.812-2.735zM5.5 9.006c-.03.039-.059.08-.088.122L5.4 9.141A.25.25 0 0 0 5.6 9.5h.65a.25.25 0 0 0 .25-.25v-.327A1.25 1.25 0 0 0 6.25 8h-.275a.25.25 0 0 0-.196.096L5.5 9.006z"/></svg>`;
        const iconComment = `<svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-3.5 3.5a.749.749 0 0 1-1.275-.326L4.022 12H2.75A1.75 1.75 0 0 1 1 10.25v-7.5zM2.75 2.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h1.72a.75.75 0 0 1 .715.518l.294 1.03 2.22-2.22a.75.75 0 0 1 .53-.22h4.52a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25H2.75z"/></svg>`;
        const iconWarning = `<svg class="icon icon-warning" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M8.22 1.754a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368L8.22 1.754zm-1.763-.707c.4-.75 1.488-.75 1.886 0l6.083 11.378c.396.74-.139 1.625-.943 1.625H1.917c-.804 0-1.339-.885-.943-1.625L7.057 1.047zM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-.25-2.75a.75.75 0 0 0-1.5 0v-3a.75.75 0 0 0 1.5 0v3z"/></svg>`;
        const iconCheck = `<svg class="icon icon-check" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>`;
        const iconGithub = `<svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.8 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8 3.86C8.68 3.86 9.36 3.95 10 4.13C11.51 3.09 12.18 3.31 12.18 3.31C12.62 4.41 12.34 5.23 12.26 5.43C12.77 5.99 13.08 6.7 13.08 7.58C13.08 10.65 11.21 11.33 9.43 11.53C9.72 11.78 9.98 12.26 9.98 13.01C9.98 14.08 9.97 14.94 9.97 15.21C9.97 15.42 10.12 15.67 10.53 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z"/></svg>`;
        const iconFork = `<svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5A2.25 2.25 0 0 0 12 6.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-3.5a.75.75 0 0 1-.75-.75v-.878zM12.5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm-4 8.25a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z"/></svg>`;
        const iconBookmark = `<svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M3 2.75C3 1.784 3.784 1 4.75 1h6.5c.966 0 1.75.784 1.75 1.75v11.5a.75.75 0 0 1-1.22.58L8 11.803 4.22 14.83a.75.75 0 0 1-1.22-.58V2.75zM4.75 2.5a.25.25 0 0 0-.25.25h6.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25h-6.5z"/></svg>`;

        const bountyBadge = issue.bounty
            ? `<span class="badge bounty">${iconBounty}${issue.bounty.amount} ${issue.bounty.currency} via ${issue.bounty.platform}</span>`
            : '';
        const labels = issue.labels.map(l => `<span class="badge label">${l}</span>`).join('');
        const assigneesHtml = issue.assignees.length > 0
            ? `<div class="meta-item assignees">
                 <svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M10.5 3a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM11 6a3.999 3.999 0 01-2.03 3.483C11.396 10.222 13 11.918 13 14H3c0-2.082 1.604-3.778 4.03-4.517A3.999 3.999 0 015 6h6zm-1-.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zm1 8.5H4c0-1.42 1.09-2.5 3.5-2.5h1c2.41 0 3.5 1.08 3.5 2.5z"/></svg>
                 Assigned to: ${issue.assignees.map(a => `<a onclick="post('openBrowser', 'https://github.com/${a}')">${a}</a>`).join(', ')}
               </div>`
            : '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Issue #${issue.number}</title>
<style>
  body {
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", system-ui, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground, #cccccc);
    background-color: var(--vscode-editor-background, #1e1e1e);
    padding: 24px;
    margin: 0;
    line-height: 1.5;
  }
  
  .container {
    max-width: 800px;
    margin: 0 auto;
  }

  /* Link Styling */
  a {
    color: var(--vscode-textLink-foreground, #3794ff);
    text-decoration: none;
    cursor: pointer;
  }
  
  a:hover {
    text-decoration: underline;
    color: var(--vscode-textLink-activeForeground, #3794ff);
  }

  /* Repo Header */
  .repo-header {
    margin-bottom: 8px;
  }
  
  .repo-link {
    font-weight: 500;
    font-size: 1.1em;
    display: inline-flex;
    align-items: center;
  }

  .breadcrumb-separator {
    color: var(--vscode-descriptionForeground, #858585);
    margin: 0 4px;
    opacity: 0.7;
  }

  /* Heading */
  .issue-header h1 {
    font-size: 1.6em;
    font-weight: 600;
    margin: 4px 0 16px 0;
    line-height: 1.35;
  }

  .issue-title-link {
    color: var(--vscode-editor-foreground, var(--vscode-foreground, #ffffff));
  }
  
  .issue-title-link:hover {
    text-decoration: none;
    color: var(--vscode-textLink-foreground, #3794ff);
  }

  .issue-number {
    color: var(--vscode-descriptionForeground, #858585);
    font-weight: 400;
    margin-right: 6px;
  }
  
  /* Divider */
  .header-divider {
    border-bottom: 1px solid var(--vscode-widget-border, #3c3c3c);
    margin: 16px 0;
    opacity: 0.8;
  }

  /* State Pill Badge */
  .state-badge.open {
    background-color: var(--vscode-testing-iconPassedColor, #2ea44f);
    color: #ffffff;
    font-weight: 600;
    border-radius: 12px;
    padding: 3px 10px;
    display: inline-flex;
    align-items: center;
    font-size: 0.85em;
    margin-right: 8px;
    border: 1px solid rgba(255,255,255,0.1);
  }

  .state-badge.open .icon {
    width: 10px;
    height: 10px;
    margin-right: 4px;
    margin-top: 1px;
  }
  
  /* Meta rows */
  .meta-row {
    font-size: 0.9em;
    color: var(--vscode-descriptionForeground, #858585);
    margin: 16px 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }

  .meta-item {
    display: inline-flex;
    align-items: center;
  }

  .meta-link {
    color: var(--vscode-descriptionForeground, #858585);
  }
  
  .meta-link:hover {
    color: var(--vscode-textLink-foreground, #3794ff);
  }
  
  /* Icons styling */
  .icon {
    width: 13px;
    height: 13px;
    vertical-align: text-bottom;
    fill: currentColor;
    display: inline-block;
    flex-shrink: 0;
    margin-right: 4px;
  }

  .meta-row .icon {
    vertical-align: middle;
    margin-top: -2px;
  }

  .badge .icon {
    vertical-align: middle;
    margin-top: -2px;
  }

  button .icon {
    width: 14px;
    height: 14px;
    margin-right: 6px;
    vertical-align: middle;
    margin-top: -2px;
  }

  .icon-warning {
    color: var(--vscode-editorWarning-foreground, #cca700);
  }

  .icon-check {
    color: var(--vscode-testing-iconPassedColor, var(--vscode-gitDecoration-addedResourceForeground, #2ea44f));
  }
  
  /* Badges */
  .badge-container {
    margin: 16px 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 12px;
    font-size: 0.82em;
    font-weight: 500;
    background-color: var(--vscode-badge-background, #2d2d30);
    color: var(--vscode-badge-foreground, #f1f1f1);
    border: 1px solid var(--vscode-widget-border, transparent);
  }

  .badge.bounty {
    background-color: var(--vscode-statusBar-noFolderBackground, #1f8244);
    color: var(--vscode-statusBar-foreground, #ffffff);
    border-color: transparent;
  }

  .badge.label {
    background-color: var(--vscode-textBlockQuote-background, rgba(128, 128, 128, 0.1));
    color: var(--vscode-textLink-foreground, #3794ff);
    border: 1px solid var(--vscode-textBlockQuote-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.2)));
  }
  
  /* Repo Health Card */
  .health {
    background-color: var(--vscode-welcomePage-tileBackground, var(--vscode-editorWidget-background, #252526));
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, #3c3c3c));
    border-radius: 4px;
    padding: 16px;
    margin: 20px 0;
  }

  .health-title {
    font-weight: 600;
    font-size: 1.05em;
    margin-bottom: 12px;
    color: var(--vscode-foreground);
    display: block;
  }

  .health-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, rgba(128, 128, 128, 0.1)));
  }

  .health-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .health-row:first-of-type {
    padding-top: 0;
  }

  .health-val-link {
    color: inherit;
    font-weight: 600;
  }
  
  .health-val-link:hover {
    color: var(--vscode-textLink-foreground);
  }

  /* Dynamic Health Value Colors (using VS Code native theme variables) */
  .health-val {
    font-weight: 600;
  }
  .health-good {
    color: var(--vscode-testing-iconPassedColor, var(--vscode-gitDecoration-addedResourceForeground, #2ea44f));
  }
  .health-warning {
    color: var(--vscode-testing-iconQueuedColor, var(--vscode-gitDecoration-modifiedResourceForeground, #cca700));
  }
  .health-critical {
    color: var(--vscode-testing-iconFailedColor, var(--vscode-gitDecoration-deletedResourceForeground, #f14c4c));
  }
  .health-unknown {
    color: var(--vscode-descriptionForeground, #858585);
  }
  
  /* Description content block */
  .description-container {
    margin: 24px 0;
  }

  .description-header {
    font-weight: 600;
    font-size: 1.1em;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    color: var(--vscode-foreground);
  }

  .body {
    white-space: pre-wrap;
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family, monospace));
    font-size: 1.05em;
    line-height: 1.5;
    max-height: 400px;
    overflow-y: auto;
    padding: 16px;
    background-color: var(--vscode-textPreformat-background, var(--vscode-editor-lineHighlightBackground, #2a2a2a));
    border: 1px solid var(--vscode-input-border, var(--vscode-widget-border, #3c3c3c));
    border-radius: 4px;
    color: var(--vscode-editor-foreground, var(--vscode-foreground, #cccccc));
  }

  /* Support markdown-like formatting in description */
  .body code {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.92em;
    background-color: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.15));
    padding: 2px 4px;
    border-radius: 3px;
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.1));
    color: var(--vscode-textPreformat-foreground, inherit);
  }

  .body pre {
    background-color: var(--vscode-textCodeBlock-background, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
    padding: 12px;
    border-radius: 4px;
    overflow-x: auto;
    margin: 12px 0;
  }

  .body pre code {
    background: none;
    border: none;
    padding: 0;
    border-radius: 0;
    font-size: 0.95em;
  }
  
  /* Actions/Buttons Container */
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 24px;
    flex-wrap: wrap;
  }
  
  /* Buttons Styling (VS Code standard buttons) */
  button {
    padding: 6px 14px;
    border: 1px solid var(--vscode-button-border, transparent);
    border-radius: var(--vscode-button-border-radius, 2px);
    cursor: pointer;
    font-size: var(--vscode-font-size, 13px);
    font-family: var(--vscode-font-family, sans-serif);
    font-weight: 500;
    outline: none;
    transition: background-color 0.1s ease;
  }

  button:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: 1px;
  }
  
  .btn-primary {
    background-color: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
  }

  .btn-primary:hover {
    background-color: var(--vscode-button-hoverBackground, #1177bb);
  }
  
  .btn-secondary {
    background-color: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #ffffff);
    border: 1px solid var(--vscode-button-secondaryBorder, transparent);
  }

  .btn-secondary:hover {
    background-color: var(--vscode-button-secondaryHoverBackground, #45494e);
  }
</style>
</head>
<body>
<div class="container">
  <!-- Repository Breadcrumb & Info -->
  <div class="repo-header">
    <div class="meta-row" style="margin: 0 0 4px 0;">
      <a class="repo-link" onclick="post('openBrowser','${issue.repo.url}')">
        <svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.8 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8 3.86C8.68 3.86 9.36 3.95 10 4.13C11.51 3.09 12.18 3.31 12.18 3.31C12.62 4.41 12.34 5.23 12.26 5.43C12.77 5.99 13.08 6.7 13.08 7.58C13.08 10.65 11.21 11.33 9.43 11.53C9.72 11.78 9.98 12.26 9.98 13.01C9.98 14.08 9.97 14.94 9.97 15.21C9.97 15.42 10.12 15.67 10.53 15.59C13.71 14.53 16 11.53 16 8C16 3.58 12.42 0 8 0Z"/></svg>
        ${issue.repo.owner}
      </a>
      <span class="breadcrumb-separator">/</span>
      <a class="repo-link" onclick="post('openBrowser','${issue.repo.url}')" style="font-weight: 600;">
        ${issue.repo.name}
      </a>
      <span class="meta-separator">·</span>
      <a class="meta-link" onclick="post('openBrowser','${issue.repo.url}/stargazers')">
        ${iconStar}${issue.repo.stars} stars
      </a>
      <span class="meta-separator">·</span>
      <span style="color: var(--vscode-descriptionForeground);">${issue.repo.language}</span>
    </div>
  </div>

  <!-- Issue Title with short Issue Number link -->
  <div class="issue-header">
    <h1>
      <a class="issue-title-link" onclick="post('openBrowser','${issue.url}')">
        <span class="issue-number">#${issue.number}</span>
        ${issue.title}
      </a>
    </h1>
  </div>

  <!-- Badges / Labels & State Indicator -->
  <div class="badge-container">
    <span class="state-badge open">
      <svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><circle fill="currentColor" cx="8" cy="8" r="3.5"/></svg>
      Open
    </span>
    ${bountyBadge}${labels}
  </div>

  <!-- Reactions, Comments and Date & Assignees -->
  <div class="meta-row">
    <div class="meta-item">
      ${iconThumbsUp} <span>${issue.reactionCount} reactions</span>
    </div>
    <div class="meta-separator">·</div>
    <a class="meta-item meta-link" onclick="post('openBrowser','${issue.url}#discussion_bucket')">
      ${iconComment} <span>${issue.commentCount} comments</span>
    </a>
    <div class="meta-separator">·</div>
    <div class="meta-item">
      <svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M14 2H2v12h12V2zM2 1a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V2a1 1 0 00-1-1H2zm3 3v2h2V4H5zm0 3v2h2V7H5zm0 3v2h2v-2H5zm4-6v2h2V4H9zm0 3v2h2V7H9zm0 3v2h2v-2H9z"/></svg>
      <span>opened ${new Date(issue.createdAt).toLocaleDateString()}</span>
    </div>
    ${assigneesHtml ? `<span class="meta-separator">·</span>${assigneesHtml}` : ''}
  </div>

  <div class="header-divider"></div>

  <!-- Repo Health Card -->
  ${health ? `
  <div class="health">
    <strong class="health-title">Repo Health Details</strong>
    <div class="health-row">
      <span>Avg Close Time</span>
      <a class="health-val-link" onclick="post('openBrowser','${issue.repo.url}/issues?q=is%3Aissue+is%3Aclosed')">
        <span class="health-val">${health.avgCloseTimeDays}d</span>
      </a>
    </div>
    <div class="health-row">
      <span>PR Merge Rate</span>
      <a class="health-val-link" onclick="post('openBrowser','${issue.repo.url}/pulls')">
        <span class="health-val ${mergeClass}">${health.prMergeRate}%</span>
      </a>
    </div>
    <div class="health-row">
      <span>Requires CLA</span>
      <a class="health-val-link" onclick="post('openBrowser','${issue.repo.url}/blob/HEAD/CONTRIBUTING.md')">
        <span class="health-val">${health.hasCLA ? `${iconWarning} Yes` : `${iconCheck} No`}</span>
      </a>
    </div>
  </div>` : ''}

  <!-- Description Section -->
  <div class="description-container">
    <div class="description-header">
      <svg class="icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M4 1.5H3V2H1.5v12.5H3v.5h1v-.5h8v.5h1v-.5h1.5V2H13v-.5h-1V2H4v-.5zm9 1.5v11H3V3h10zm-3 2H5v1h5V5zm-5 3h5v1H5V8zm5 3H5v1h5v-1z"/></svg>
      Description
    </div>
    <div class="body">${issue.bodyText || 'No description provided.'}</div>
  </div>

  <!-- Actions -->
  <div class="actions">
    <button class="btn-primary" onclick="post('openBrowser','${issue.url}')">${iconGithub}Open on GitHub</button>
    <button class="btn-primary" onclick="post('jumpIn','${issue.url}')">${iconFork}Jump In</button>
    <button class="btn-secondary" onclick="post('save','${issue.url}')">${iconBookmark}Save to Watchlist</button>
  </div>
</div>

<script>
  const vscode = acquireVsCodeApi();
  function post(command, url) { vscode.postMessage({ command, url }); }
  
  // Force reset scroll position on every load to fix re-use scroll restoration bug
  window.scrollTo(0, 0);
</script>
</body>
</html>`;
    }
}
