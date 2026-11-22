---
name: ticket-format
description: "Preferred format for writing developer tickets (Jira, Linear, GitHub Issues). Use when drafting, creating, or editing tickets, stories, or issues."
---

# Ticket Format

<!-- TEMPLATE: name the tracker and its conventions. Example: "Jira project `ABC`; stories are parented under epics (not other stories); unpointed work goes to the 'Ready for Pointing' sprint." -->

Always structure developer tickets with these four sections.

## 1. User Story

Outcome-focused, written from the perspective of who benefits. Never list implementation details here.

```
As a [role], I need [capability] so that [outcome].
```

- Pitch at the right level of abstraction: if the ticket covers multiple related items (e.g. accordion + tabs), generalize ("components", not "accordion").

## 2. Acceptance Criteria

Testable, product-readable bullets, written so a QA or PO can verify them without reading code.

- Describe observable behavior, not implementation.
- One condition per bullet.
- Cover the happy path and key edge cases.
- **Render as checkboxes** in the tracker's native format (Jira ADF `taskList`/`taskItem`, `- [ ]` in Markdown trackers), not plain bullets, so QA gets a clickable checklist.
- **Group AC under bold sub-headers by feature area** (e.g. **Settings tab**, **Add user**, **API**, **Database**, **Empty state**) so long AC stays scannable instead of one flat list.
- When the ticket defines a new API surface, include endpoint contracts as AC items (method, path, auth requirement, behavior). These are product-observable and belong in AC, not only in callouts.

## 3. Callouts

Developer implementation notes only. Keep it short; if it's obvious, leave it out.

- Fragments and phrases are fine; callouts don't need full sentences.
- Only include things that would genuinely trip someone up or save them meaningful time.
- Include file locations when they're known.
- Short, focused code snippets (under ~10 lines, illustrating a single change) can live inline.
- Large code blocks, detailed migration mappings, or multi-file diffs belong in a **ticket comment**, not the body.
- Flag decisions that need PO sign-off (e.g. exact match semantics, UI copy).
- Note cross-repo or cross-surface impacts (e.g. a shared config change that affects E2E tests).
- **Scope changes go in the body.** When asked to add scope or edit the ticket, update the description (user story, AC, callouts) rather than adding a comment.

**Callout style:** terse implementation breadcrumbs. Each bullet tells the dev where to go and what to touch, with inline code references. Example:

```
- types: add `archivedAt?: string` to `Project` and `UpdateProjectRequest`
- existing save path already persists the new field; no API change
- update the reporting mapper to include `archivedAt` when present
- requires a migration: `ALTER TABLE project ADD COLUMN archived_at TIMESTAMP;`
```

**Order callouts by component in execution/dependency order.** Use a bold component header plus an inline path for each group:

<!-- TEMPLATE: map each layer to its path(s) in this repo and drop layers the repo doesn't have. Example: "**Shared types** (`packages/types/`)". -->

1. **External / prerequisites**: auth scopes, third-party config, access requests. Mark "do this first" if they must exist before end-to-end testing.
2. **Shared types / data models**: everything else depends on them.
3. **Database**: schema before API.
4. **API**: route and middleware changes.
5. **Infrastructure**: wiring after the code it deploys is defined.
6. **Backend logic**: services, functions, and jobs that wire into the infrastructure.
7. **UI**: frontend changes.

**Cross-story dependencies:** if a callout depends on work in another story, say so explicitly (e.g. "scope creation tracked in Story B" or "prerequisite: Story A must be deployed first").

**Prerequisites:** flag anything that must exist before the ticket can be tested end-to-end (auth scopes, external service setup, another story's deploy) with "do this first" or "prerequisite".

## 4. Rollout

**Test plan:** [What will be tested (unit/integration/e2e/manual), where, and by whom.]
**Legacy / migration handling:** [Data backfill, compatibility shims, one-way migrations, and rollback constraints for existing production data.]

## Workflow

- **Show a draft before creating.** Present the ticket content for review before running any create command.
- **Make the description render as structured content.** Headings, bullets, and checkboxes must render in the tracker, not collapse to flat text. CLI create flags often flatten formatting (Jira needs ADF via the REST API); check the result and fix the description if it flattened.

## Dependencies

- Always add "blocks / is blocked by" links between tickets.
- Parent each ticket under the correct epic or parent issue.
- After creating a set of stories, ask whether to add them to a sprint or cycle.
- When creating stories under an epic, present the full dependency graph before creating any links. Confirm the chain is correct, then create all links in one pass.
