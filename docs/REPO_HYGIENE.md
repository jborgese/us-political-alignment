# Repo Hygiene

**Audience:** maintainers and AI agents working in this repo.

**Purpose:** one place that records which safeguards this repo has in place, so nobody has to rediscover them. Standards for code live in `.claude/rules/security.md`; this file tracks the repo and its settings.

Check an item when it is true for this repo, and note where it lives. Agents do not change repository or organization settings. When a change touches an area with an unchecked item, say so in the summary.

## Reproducible Setup

- [x] The runtime and package manager versions are pinned in the repo, and `AGENTS.md` → Setup says where
- [ ] The lockfile is committed, and CI installs with the frozen-lockfile command `npm ci`
- [x] A new contributor can go from clone to passing tests with the commands in `AGENTS.md` → Setup

## Secrets

- [x] `.gitignore` covers `.env` and `.env.*`, and keeps `.env.example`. Any env file committed on purpose holds public defaults only
- [x] `.env.example` lists every variable the code reads, with placeholders
- [ ] Deployed secrets live in <!-- TEMPLATE: the secret manager or platform settings page -->
- [ ] Someone knows how to rotate each credential <!-- TEMPLATE: owner or runbook link -->

If a secret is ever committed, rotate it first and then remove it. Removing it from history does not make it safe again.

## Dependencies

- [x] `.github/dependabot.yml` (or another update tool) covers every package ecosystem in the repo, plus GitHub Actions
- [ ] New releases wait before they are installed: the update tool's cooldown, and the package manager's release-age setting <!-- TEMPLATE: the setting and value, e.g. `min-release-age=3` in `.npmrc` -->
- [ ] Dependency install scripts run only for an approved list <!-- TEMPLATE: where the list lives, e.g. `allowScripts` in `package.json` -->
- [x] `.github/workflows/security.yml` scans dependencies for known vulnerabilities on the same schedule as its secret scan

## CI

- [ ] Pull requests run the checks listed in `AGENTS.md` → Git Workflow
- [ ] `.github/workflows/security.yml` scans for committed secrets on pull requests, on pushes to the default branch, and weekly
- [x] Third-party actions are pinned to full commit SHAs
- [x] Workflows declare `permissions:` and default to read-only

## Repository Settings

These are set in GitHub's repository or organization settings, not in the codebase.

- [ ] The default branch requires a pull request and passing checks, and blocks force pushes (private repositories need a paid plan for this)
- [ ] Dependabot alerts and security updates are on
- [ ] Secret scanning and push protection are on (free for public repositories; private repositories need GitHub Secret Protection)
- [ ] The default workflow token permission is read-only
- [ ] Public repositories: `SECURITY.md` says how to report a vulnerability, and private vulnerability reporting is on

## Running Services

<!-- TEMPLATE: delete this section if the repo deploys nothing. -->

- [ ] Logs from deployed code go to <!-- TEMPLATE: where, and how long they are kept -->
- [ ] Unhandled errors reach <!-- TEMPLATE: the error tracker or alert channel, and who watches it -->
- [ ] Production runs with debug modes off, and with its own credentials, separate from development
