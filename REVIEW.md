# Review instructions

Repo-wide coding patterns live in `docs/CODING_STANDARDS.md` and `.claude/rules/`; read them for context when judging whether code follows local conventions.

## What Important means here

Reserve Important for findings that would break behavior or leak data: incorrect logic, broken workflow or state transitions, SQL that interpolates user-supplied values, an entry point that does not authorize its caller on the server, secrets or PII in code or logs, and breaking changes to shared packages consumed by other parts of the repo. Style, naming, and refactoring suggestions are Nit at most.

<!-- TEMPLATE: repo-specific Important classes. Example shape: "changes to `<config dir>` that desync backend behavior, UI, and E2E tests". -->

A race condition or edge case is Important only when you can cite the code path that triggers it in normal use. Do not suggest guards, fallbacks, or null checks for states the invariants in `docs/CODING_STANDARDS.md` ("Write For Human Reviewers") rule out.

## Cap the nits

Report at most five Nits per review; the verdict-line tally counts all of them, reported or not. After the first review of a PR, suppress new Nits and post Important findings only. Findings from the "Always check" list below are exempt from both the cap and the re-review suppression — report them on every pass.

## Do not report

- Anything CI already enforces: build and type errors, failing tests. Do not restate check statuses — but predicting from the diff that existing tests will break is in scope; see "Always check".
- Formatting — never worth a review round trip <!-- TEMPLATE: what enforces formatting, e.g. "(pre-commit Prettier covers ts/tsx/json)" -->
- Generated or lock artifacts <!-- TEMPLATE: list paths, e.g. `pnpm-lock.yaml`, `src/generated/` -->
- Missing test coverage on documentation or config-only changes

## Always check

- New SQL never interpolates user-supplied values into query strings — use named parameters; flag violations as Important. Structural fragments (e.g. schema-qualified table names) are not findings. <!-- TEMPLATE: the repo's parameter helper(s) to point at, and any documented legacy interpolation that is not a finding unless a PR adds more. -->
- A new or changed entry point that is not public on purpose checks, on the server, that the caller may act on the specific record it touches; a webhook or queue consumer verifies its sender instead. A check that exists only in client code is not enforcement. Flag a missing check as Important and cite the handler. <!-- TEMPLATE: the repo's auth middleware or guard helper to point at, and the routes that are public on purpose. -->
- Responses do not carry stack traces, query text, or upstream error bodies; flag a new leak as Important.
- A change that widens what the repo trusts gets a sentence in the note under the verdict line, so a human decides: a dependency added to a manifest, a CI workflow or permission change, or an edit to agent instructions, rules, or hooks.
- Agents should not add comments by default. Flag new `//`, JSDoc, or section comments that narrate the change; do not flag pre-existing comments or comments a human clearly wrote.
- When a diff moves or removes logic or changes a response shape, confirm every consumer of the old location is updated; a consumer left behind is Important
- Diffs stay scoped: flag speculative abstractions, dead code, unused helpers or params, and defensive handling of impossible states ("AI bloat")
- When a diff introduces a new shared pattern other code is expected to follow — a new shared package, infrastructure construct, middleware, error type, or cross-feature helper — and does not update `docs/CODING_STANDARDS.md` or the relevant `.claude/rules/*.md`, flag it as a Nit naming the doc that should mention it
- Tests keep pace with the diff. If the change alters values or behavior that existing tests assert on (unit, E2E, or otherwise) and the diff does not update those tests, flag it as Important — it predicts a CI failure. If the diff adds meaningful new logic that no test touches, say so. In both cases state plainly, in one sentence, which test file(s) need to be added or updated and why.

<!-- TEMPLATE: repo-specific checks, each with its severity. Example shapes: "New UI code imports from `<current UI library>`, not `<deprecated library>` — flag new imports only"; "`<app>` styles with <system>, never <other system>"; "Currency amounts compare via `<cents-based helper>`, never raw `===` on floats (Important)"; "Edits to `<config dir>` ship a new migration (Important)". -->

## Verification bar

Behavior claims need a `file:line` citation from this repository, not an inference from naming or convention.

## Summary shape

The body is a verdict line, an optional short note, then bullets — no paragraph walls, no recap of what you reviewed or which files you opened, and no section praising the PR (an approving review already says that).

Line one is the verdict and tally. Use **LGTM** when nothing Important came back and **Needs changes** when something did; append `· tests need updating` when the diff leaves tests stale.

When the PR warrants a judgment call that no finding bullet can carry — risky new permissions, a policy decision, anything you would rather a human weigh in on than shadow-approve — say so in one to three sentences of plain prose directly under the verdict line, in your own voice. What stays banned is process narration ("What was reviewed: ..."), not nuance.

Then one bold section per severity that has findings — `**Important**`, then `**Nits**` — omitting empty ones. Each finding is one bullet: `path:line`, an em dash, then the problem in one sentence. Link that citation to a blob permalink at the PR head SHA only when the line is absent from the diff and so has no inline comment to click through to; if you are unsure of the SHA or line number, leave it plain, since a link to the wrong line is worse than none.

Example:

```
**LGTM** · 0 important, 2 nits

**Nits**
- [`docs/setup.md:40`](https://github.com/<owner>/<repo>/blob/<head-sha>/docs/setup.md#L40) — documents the local base URL with a trailing slash, which now yields `//items/new`
- `src/utils/links.ts:11` — same join logic duplicated in `getNewItemLink` and `getItemLink`
```

The `setup.md` line is linked because the PR does not touch that file; `links.ts` is plain because it is in the diff.

## Inline comments

One sentence of action, blank line, one sentence of why — never more than three lines. The same limit applies inside the collapsible extended-reasoning block: bullets, not paragraphs.

When the fix is a literal one- or two-line replacement, end with a `suggestion` block so the author can commit it in one click:

````
Drop the trailing slash so the documented URL survives the new join.

`${baseUrl}/${path}` assumes no trailing slash, so a dev copying this gets `http://localhost:5173//items/new`.

```suggestion
| `BASE_URL` | `http://localhost:5173` | local dev server |
```
````
