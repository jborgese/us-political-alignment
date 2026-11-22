# GitHub Operations

## Branch workflow

<!-- TEMPLATE: set the base branch and what each long-lived branch deploys to, then replace `<base-branch>` below. Example: "`develop` → staging; `main` → production." -->

<!-- TEMPLATE: confirm or replace the branch naming convention. Suggested default (below): ticket work uses the bare ticket key (e.g. `ABC-123`); non-ticket work uses `chore/short-description`. -->

- Branch from and target PRs to `<base-branch>` unless the user specifies otherwise.
- **Ticket work:** name the branch with the bare ticket key only. No `feature/`, `fix/`, or slug suffix.
- **Non-ticket work** (chores, spikes, docs without a ticket): use `chore/short-description`, or ask the user for the preferred name.
- When starting ticket implementation, update the local base branch, then create the branch:
  ```bash
  git fetch origin <base-branch>
  git checkout <base-branch>
  git merge --ff-only origin/<base-branch>
  git checkout -b <TICKET-KEY>
  ```
- Keep commits and PRs focused; write descriptive commit messages; no WIP commits in final PRs.
- Do not commit, push, open PRs, or post to GitHub unless the user explicitly asked for that action in the current message.

## Folding changes into an earlier commit

When the user asks to squash/fixup a change (or set of changes) into a previous commit:

```bash
git add <paths>
git commit --fixup=<target-sha>
git rebase --autosquash <base-branch>
```

## Git plan circuit breaker

If a git plan needs more than ~3 easy-to-explain steps, stop, ask, and explain what you are trying to accomplish.

## Hosted GitHub state

- Use `gh` by default for pull requests, issues, comments, reviews, workflow runs, status checks, and other GitHub-hosted repository metadata.
- Do not rely only on local git branch names, remotes, or `origin/*` refs when the user is asking about GitHub-hosted state.
- Use GitHub MCP when the user explicitly asks for MCP, when it is already configured and gives a better structured workflow, or when `gh` cannot answer the request cleanly.
- Before calling a GitHub MCP tool, inspect its schema/descriptor and follow any server-specific auth instructions.
- Fall back to local git inspection or web lookups only when GitHub-hosted tools cannot answer the question.
