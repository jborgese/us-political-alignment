# GitHub Copilot Instructions

This file is the entry point for GitHub Copilot agents working in this repo. It stays thin; use it alongside:

- `AGENTS.md` for repo workflow, commands, boundaries, summary expectations, and routing
- `docs/CODING_STANDARDS.md` for canonical coding patterns
- `.claude/rules/*.md` for area standards; keep any Copilot-specific instruction mirrors under `.github/instructions/` in sync with the matching rule

## Primary References

- `AGENTS.md`
- `docs/CODING_STANDARDS.md`
- `.claude/rules/functional-programming.md`
- `.claude/rules/security.md`
- `.claude/rules/typescript-standards.md`
- `.claude/rules/testing.md`
- `.claude/rules/design-review.md`
- `.claude/rules/svelte.md`
- `docs/specs/README.md`

<!-- TEMPLATE: repo-specific references — area rules, `.github/instructions/*.instructions.md` mirrors, `.github/agents/*.agent.md`. -->

## Repo Snapshot

<!-- TEMPLATE: 3–5 bullets Copilot needs most — workspace tooling, each app and where it lives, shared packages to check before writing helpers, and the modern reference folders to copy from. Example shape: "- `packages/shared/` is the first place to check for reusable helpers." -->

## Working Guidance

- Prefer small, in-place completions that follow the surrounding file's existing pattern.
- Minimize the surface area of changes; only generate what directly supports the requested task.
- Reuse shared workspace packages and utilities before inventing new local abstractions.
- Do not add new dependencies without maintainer approval.
- Use `gh` by default for PRs, issues, checks, and other GitHub-hosted state.
- Name branches per `.claude/rules/github-operations.md`.
- When a rule file exists for the current area, follow it instead of duplicating its standards here.

## Quick Pointers

<!-- TEMPLATE: one short subsection per surface (backend, each frontend app) with the conventions Copilot most often misses. Example shape: "### Backend\n- Keep handlers thin and move business logic out of framework plumbing." -->

For questions, refer to `AGENTS.md` or ask a maintainer.
