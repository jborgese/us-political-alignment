# AGENTS.md — us-political-alignment

Research repo that places US House members, House caucuses, and foreign parties on shared issue scales. It holds a TypeScript command-line tool (`alignment-rater`) that has a language model compare blinded political evidence packets in pairs and scales the results per issue category, plus the evidence packets it rates. Node.js runs the source directly; npm, Zod, the Anthropic SDK, and Vitest are the tooling.

This file provides operational guidance for **all AI agents** (Cursor, Claude Code, Codex, Copilot, etc.). **Canonical coding patterns** live in [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md); area-specific rules live in `.claude/rules/*.md`. [`.github/copilot-instructions.md`](.github/copilot-instructions.md) is the Copilot entry point.

> **Where the results go**: a public site at uspolitics.frootsnoops.com. It shows results with charts and icons and uses words only where they are needed, so anything built for readers should be visual first.

> **Blinding is the core requirement**: the rater model must never see a name, party, record id, or source. `src/comparisons.ts` is the only place that builds what the model is sent, and `findSetProblems` in `src/ratingSet.ts` blocks a run when a record contains a revealing term.

---

## Setup

**Prerequisites:** Node.js 22.18 or newer (pinned in `.nvmrc` and in `engines` in `package.json`), npm 10 (pinned in `packageManager`). Run `npm ci`.

Rating calls the Anthropic API. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` and `RATER_MODEL`. Tests, `check`, and `report` need neither.

---

## Commands

### Testing

- All tests: `npm test`
- Specific test file: `npm test -- test/scoring.test.ts`

- If the repo uses Vitest, pass `--run` when invoking it directly to avoid watch mode.

### Development

- Type check: `npm run typecheck`
- There is no build step, linter, or formatter in the repo. Node runs the `.ts` files as they are.

### Deployment

<!-- TEMPLATE: how to deploy (command, required working directory), prerequisites (e.g. Docker running), and any process for reserving a shared environment before deploying. Delete if agents never deploy from this repo. -->

### Scaffolding / Local Execution

- `npm run check -- <category-id>`: validates the category, its packets, and the key. No network.
- `npm run rate -- <category-id>`: sends every unrated pair to the Anthropic API. It needs `.env` and costs money, so ask the user before running it.
- `npm run report -- <category-id>`: writes the report and the blinded spot check from saved comparisons. No network.
- `npm run site -- <category-id>`: writes the public page to `dist/index.html` from saved comparisons. No network.

---

## Project Structure

**Key areas:**

- `categories/`: one file per issue category, holding the question put to the rater, the slots every record fills, and the anchor records
- `events/`: one file per issue category, holding the shared wording of each program change, listed by legislature
- `key.json`: maps each blinded id to a name and a legislature, and lists the terms no record may contain
- `packets/<category-id>/`: one evidence packet per subject, named by blinded id
- `runs/<category-id>/`: saved comparisons, the report, and the spot check
- `site/`: the stylesheet and browser script of the public page, inlined by `src/site.ts`
- `src/`: the tool; `scoring.ts` is the reference for pure logic and `rater.ts` is the only file that touches the SDK
- `test/`: Vitest tests, one file per `src/` module

**Domain vocabulary:**

- **Subject**: a House member, a party, or a House caucus being placed on the scale.
- **Packet**: the evidence about one subject in one category. A packet and an anchor are both "records" once the rater sees them.
- **Anchor**: a written, fictional record with a known position. Anchors are listed from the high end of the scale to the low end, and they fix the 100 and 0 points.
- **Tier**: the weight class of one item of evidence: official act, then influence, then statement.
- **Slot**: one section of a record, such as the health coverage it keeps in place. Every record fills each slot or marks it empty.
- **Event**: one program change in a legislature, worded once in `events/`. A record supplies only its stance on it.
- **Matchup**: one ordered pair of records. Every pair is rated in both orders.
- **Key**: `key.json`. It unblinds ids, so its contents never go to the rater or into the spot check.

**Navigation hints:**

- New issue category? Add `categories/<id>.json`, `events/<id>.json`, and `packets/<id>/`. No code changes.
- New check on what a record may contain? `src/ratingSet.ts`. The rules for writing evidence are in `README.md`.
- Anything that changes what the rater is sent? `src/comparisons.ts`, and nowhere else.
- Anything a reader of the site sees? `src/site.ts` builds the page's data and markup; `site/` styles it and handles selection.

---

## Code Style

Follow [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md) for cross-cutting patterns (functional style, TypeScript, writing for human reviewers, testing, canonical file index). Use area rules for depth:

| Surface | Rule |
|---------|------|
| Functional style | `.claude/rules/functional-programming.md` |
| Security | `.claude/rules/security.md` |
| TypeScript | `.claude/rules/typescript-standards.md` |
| React / UI design | `.claude/rules/design-review.md` |
| Svelte / SvelteKit | `.claude/rules/svelte.md` |
| Unit tests | `.claude/rules/testing.md` |
| Documentation edits | `.claude/rules/doc-review.md` |

<!-- TEMPLATE: add a row per repo-specific area rule (framework, infrastructure, E2E, a second frontend app). -->

**Repo-specific reminders:** imports carry the `.ts` extension, and types must be erasable (no enums, namespaces, or parameter properties), because Node runs the source without a build step.

---

## Git Workflow

See [`.claude/rules/github-operations.md`](.claude/rules/github-operations.md) for branch naming and GitHub workflow.

- Keep the local default branch (`main`) current and branch from it, unless asked otherwise.
- Target PRs to the default branch, unless asked to stack onto or target a different branch.
- **Ticket branches:** <!-- TEMPLATE: naming convention. Example shape: "bare ticket key only (e.g. `PROJ-123`) — no `feature/` or `fix/` prefix, no slug." -->
- **Non-ticket branches:** `chore/short-description` (or ask the user).
- Keep commits and PRs focused; avoid bundling unrelated changes.
- Write descriptive commit messages; no WIP commits in final PRs.
- All required CI checks must pass before a PR can merge. <!-- TEMPLATE: what PR CI runs (build, test, lint, E2E, infra diff) and where it is defined. -->

<!-- TEMPLATE: branch → environment auto-deploy mapping. Example shape: "`main` branch → auto-deploys to production." Delete if none. -->

---

## Boundaries

**✅ Always:**
- Keep changes scoped — only modify what directly supports the task
- When moving or removing logic, or changing a response shape, find every consumer of the old location and update all of them in the same change
- For doc edits, prefer the smallest diff that restores accuracy; do not remove correct content or restructure docs unless it is stale or the user explicitly asks for a rewrite (`.claude/rules/doc-review.md`)
- Create or update a spec in `docs/specs/` only when the user asks for one or the work meets the bar in `docs/specs/README.md`; do not commit planning notes or scratch specs alongside feature work
- When a change introduces a new shared pattern (package, module, middleware, error type, or helper others should follow), update `docs/CODING_STANDARDS.md` or the relevant area rule in the same change
- Write focused automated tests for new logic, utility functions, and meaningful UI workflow changes when coverage adds real value

<!-- TEMPLATE: repo-specific "always" steps. Example shape: "- Authenticate with `<cloud CLI>` before running code locally or deploying". -->

**⚠️ Ask before:**
- Adding new external dependencies to any package
- Restructuring shared packages or changing the exported API shapes of shared libraries
- Changing infrastructure-as-code, CI workflows, IAM/permissions, or environment configuration

<!-- TEMPLATE: repo-specific risky areas and pre-approved exceptions. Example shapes: "- Modifying `<config dir>` — it drives both backend behavior and E2E tests"; "- Touching `<subsystem>` without reading `<its README>`"; "(adding `<library>` from the catalog is pre-approved)". -->

**🚫 Never:**
- Commit credentials, `.env` files (a placeholder-only `.env.example` is fine), or any secrets
- Modify generated output (`node_modules/`, `dist/`, build artifacts)
- Deploy to shared non-production environments or production without explicit user confirmation
- Push large speculative refactors without user confirmation
- Push, commit, or post to external systems (GitHub, issue trackers, chat, etc.) unless the user explicitly asked for that action in the current message
- Add comments to code unless the user asked — suggest them in chat instead; leave existing comments alone (`.claude/rules/typescript-standards.md`)

---

## Decision quality and communication

When you finish a task, your **summary should explain your reasoning**, not only what changed. Developers use this to trust the solution and review it efficiently.

**Include in summaries (when non-trivial):**

- **Goal** — what the user needed.
- **Approach chosen** — what you did and why it fits this repo.
- **Alternatives considered** — when a meaningful alternative existed; do not invent trade-off prose for changes with one obvious approach.
- **Tradeoffs** — pros/cons of the chosen approach vs alternatives; be honest about downsides.
- **Adversarial check** — how the change could fail, be bypassed, or confuse humans; what you did (or deliberately did not do) to mitigate that.
- **Residual risk / follow-ups** — anything still manual, untested, or environment-dependent.

**Format summaries for scanning, not reading:**

- **Outcome first** — the first line answers "what happened," bolded, before any reasoning.
- **Bullets over paragraphs** — one idea per bullet, with a bold lead-in so the eye can skip.
- **No paragraph over three sentences** — if it runs longer, break it up or bullet it.
- **Prose is for judgment, not narration** — a few plain sentences are welcome for nuance and risk. What changed (files, behavior) belongs in bullets; the play-by-play of how you got there ("first I read X, then searched Y") does not belong at all.
- **Show, don't reference** — when flagging a specific passage of code or docs, quote or cite the actual lines in the message; never make the reader open a file to understand the finding.
- **End with the ask** — anything needing user action goes in a clearly marked line at the end, not buried mid-paragraph. When the turn ends with open decisions, present them as structured multiple-choice questions (via the question tool when available, with a marked recommendation), not prose flags the user has to notice.
- **Context before every question** — before asking the user to choose, finish checking what you can verify yourself. Then, in the same message, explain what is being decided, why, and what each option changes, including its tradeoffs. The user sees only your message, not your reasoning.

**Keep solutions simple:**

- Prefer the **smallest change** that meets the request. Do not add files, abstractions, or duplicate policy in many places unless each layer has a clear job.
- Do not expand scope (extra refactors, drive-by fixes, new utilities) unless the user asked or it is required for correctness.
- Avoid **documentation sprawl** — one canonical location per concept; link out instead of repeating the same rules in five files.
- **Work with the framework, not around it.** If you find yourself encoding data or duplicating logic a library already handles (identity, equality, lifecycle), stop and use the mechanism it provides — a workaround can be a small diff and still be the wrong solution.
- If you notice you are "defending" complexity, step back and simplify first, then explain why what remains is necessary.

**Minimal-fix discipline (bug fixes and false positives):**

1. Before editing, state the smallest diff that fixes the reported case — implement that first.
2. Fix the reported input, not the problem class. One failing case is not a mandate to make parsing, validation, or error handling "robust."
3. Generalize only if the minimal fix demonstrably fails, and say why before doing it.

Stop and propose instead of implementing when a fix would add:

- a new parser, tokenizer, state machine, or character-by-character scanner
- a new allowlist/denylist, config surface, or lookup table
- more than ~15 changed production lines for a single reported bug (tests, types, and caller updates do not count against this)
- handling for inputs that have not actually occurred

A slightly broader heuristic beats correct-but-complex machinery. In guard/hook code specifically, a false positive costs one click — bias toward simple-and-occasionally-noisy over complex-and-precise.

**Abstraction heuristics (frontend and backend):**

- **Avoid thin pass-through wrappers in new code.** Do not add an exported function whose only job is renaming another API or prepending a fixed path when one call site could invoke the underlying API directly. Prefer direct calls, or a shared named constant when the same path is reused across features.
- **Extract on reuse or real complexity.** Add a util, component, or constant when shared by multiple call sites or when logic branches, validates, or maps.
- **No dead code.** Do not add helpers, page-object methods, tests, or hooks that nothing calls yet. If you add logic, ensure something in the same change uses it.

Over-eager agents bloat diffs, slow human review, and introduce regressions. When in doubt, do less and say why.

Code-level readability standards (comments, naming, function/file size) live in [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md) under "Write For Human Reviewers" — this section governs behavior while working; that one governs the code you leave behind.

---

## Agent Routing

Use the smallest agent surface that fits the task. If a durable spec already exists in `docs/specs/`, read it before invoking domain-specific agents.
Before spawning subagents or running multiple independent/cross-model review passes, read [`docs/agents/agent-model-strategy.md`](docs/agents/agent-model-strategy.md).

The `epic-planning` skill and the `final-reviewer` agent are provided by the agent-guardrails plugin (Cursor and Claude Code).

| Situation | Primary Resource | Use It When | Typical Follow-Up |
|---|---|---|---|
| Large plan, migration, or phased rollout | `epic-planning` skill | The work needs decisions, sequencing, validation, rollback, or multi-package coordination before implementation | `final-reviewer` once implemented |
| Final implementation review | `final-reviewer` agent | The work is implemented and needs an objective merge-readiness review | Fix findings, then re-review if needed |

<!-- TEMPLATE: add a row per repo-specific skill or agent (incident triage, domain data tasks). Example shape: "| <situation> | `.claude/skills/<name>/SKILL.md` | <trigger> | <follow-up> |" -->

For review passes, prefer role separation and `readonly` review before model separation; for high-risk validation, consider a different model family when available.

---

## When Stuck

1. Ask a clarifying question rather than guessing at scope or intent.
2. Propose a short plan before starting a large refactor or infrastructure change.
3. Suggest to the user to open a draft PR when uncertain about the right approach.
4. Use `docs/CODING_STANDARDS.md` to choose the right modern or legacy reference before copying an existing pattern.
5. Use the `Agent Routing` table above when the work needs deeper research or specialized help.

---

## Canonical References

| Topic | Location |
|---|---|
| **Coding standards (canonical patterns)** | [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md) |
| Agent model strategy | [`docs/agents/agent-model-strategy.md`](docs/agents/agent-model-strategy.md) |
| Copilot agent instructions | [`.github/copilot-instructions.md`](.github/copilot-instructions.md) |
| Design review principles | [`.claude/rules/design-review.md`](.claude/rules/design-review.md) |
| Doc edits | [`.claude/rules/doc-review.md`](.claude/rules/doc-review.md) |
| Functional programming | [`.claude/rules/functional-programming.md`](.claude/rules/functional-programming.md) |
| Git branch naming and GitHub operations | [`.claude/rules/github-operations.md`](.claude/rules/github-operations.md) |
| PR review bot guidance | [`REVIEW.md`](REVIEW.md) |
| PR template / PR authoring | [`.claude/rules/pr-creation.md`](.claude/rules/pr-creation.md), [`.github/pull_request_template.md`](.github/pull_request_template.md) |
| Repo hygiene checklist | [`docs/REPO_HYGIENE.md`](docs/REPO_HYGIENE.md) |
| Security standards | [`.claude/rules/security.md`](.claude/rules/security.md) |
| Specs guide | [`docs/specs/README.md`](docs/specs/README.md) |
| Svelte and SvelteKit standards | [`.claude/rules/svelte.md`](.claude/rules/svelte.md) |
| Ticket format | [`.claude/skills/ticket-format/SKILL.md`](.claude/skills/ticket-format/SKILL.md) |
| TypeScript standards | [`.claude/rules/typescript-standards.md`](.claude/rules/typescript-standards.md) |
| Unit testing patterns | [`.claude/rules/testing.md`](.claude/rules/testing.md) |

<!-- TEMPLATE: add rows for repo-specific references — app READMEs, subsystem READMEs, runbooks, area rules. -->
