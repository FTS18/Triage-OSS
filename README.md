# Triage-OSS

Find, evaluate, and act on open source contributions without leaving VS Code.

## Features

- **Issue Feed** — search GitHub issues filtered by language, org, label, stars, and age
- **My Activity** — track your PR win rate, total merged PRs, open PRs, and issues you've engaged with across GitHub
- **Trending** — discover hot issues buzzing with activity and explore organizations participating in Google Summer of Code
- **Watchlist** — save issues to revisit later; persisted across sessions
- **Daily Challenge** — fresh `good first issue` picks from major open-source orgs refreshed each launch
- **Bounty Aggregator** — issues with Algora or Polar cash bounties are highlighted
- **CodeLens & Hover Cards** — hover any import in your code to see npm package metadata and open issue counts
- **Terminal Links** — click `Error:` strings in the terminal to search GitHub Issues
- **Repo Health** — avg close time, PR merge rate, and CLA requirement shown per repo
- **Workflow Tools** — one-click fork & clone, and automated branch name suggestions (e.g. `fix/issue-123-title`)
- **Settings Dashboard** — an intuitive visual UI to customize all your filters without editing JSON

## Setup

1. Install the extension
2. Open Settings (`Ctrl+,`) and search **Triage-OSS**
3. Set `issueFinder.githubToken` to a [Personal Access Token](https://github.com/settings/tokens) with `public_repo` scope
4. Optionally configure language, orgs, star filters, and label mode

## Settings Reference

Open the **Triage-OSS Settings** from the command palette or sidebar to easily configure:
- **GitHub Token**: A Personal Access Token (PAT) is required.
- **Filters**: Choose languages, required topics, keywords, and specific issue types (Bugs, Features, Docs).
- **Organization Restrictions**: Filter your feed to specific orgs.
- **GitHub Username**: Required to unlock the *My Activity* dashboard tracking your PRs.

## Publishing to VS Code Marketplace

```bash
npm install -g @vscode/vsce
vsce package    # creates opensourceissuefinder-0.1.0.vsix — install locally via Extensions > Install from VSIX
vsce publish    # publishes to marketplace (requires publisher account at marketplace.visualstudio.com)
```

## License

MIT
