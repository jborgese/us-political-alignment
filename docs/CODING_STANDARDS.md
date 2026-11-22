# Coding Standards

**Audience:** engineers and AI agents implementing features in this repo.

**Purpose:** capture established, repeated repo patterns so new work follows the system we already have instead of inventing parallel conventions.

This is a standards guide, not a claim that every legacy file already follows these patterns. Existing one-offs and older patterns are called out in **Legacy And Intentional Inconsistencies**.

## How To Use This

### Precedence

1. Ticket or spec for the task (`docs/specs/`, ticket callouts).
2. This file for cross-cutting coding patterns.
3. Area-specific rules: `.claude/rules/*.md`.
4. Agent prompts (such as the `final-reviewer` agent) for workflow, not normative coding style.
5. Skills for specialized domains.

Agent-specific guidance stays in that agent's own files: area rules in `.claude/rules/`, Copilot-specific guidance behind `.github/copilot-instructions.md`. `REVIEW.md` at the repo root configures the Claude Code review bot only; it does not govern implementation.

### Canonical References

<!-- TEMPLATE: one row per surface/layer naming the default folder or file to copy from, plus specialized or legacy anchors. Example shape: | API routes | `src/routes/orders.ts` | `src/routes/v1/` is deprecated; do not extend | -->

| Surface | Default anchors | Specialized or legacy anchors |
|---------|-----------------|-------------------------------|

## Universal Standards

- Open the canonical reference for the layer you are touching.
- Copy the file layout, naming, and test shape from the nearest sibling feature.
- Check shared packages and modules before writing a new helper. <!-- TEMPLATE: list the shared packages/modules to check first, e.g. `packages/utils/`, `packages/models/` -->
- Extend shared packages only when reuse is real and the change is within scope. Ask before changing exported APIs or restructuring shared packages.
- Keep the smallest diff that satisfies the task. Do not drive-by refactor legacy code.
- Shared services and components serve every consumer. Do not add consumer-specific branches to them; put consumer-specific behavior in the consumer, or extend the service through a generic mechanism (e.g. a strategy parameter).
- Encapsulate domain rules where every client can reuse them (e.g. which permissions a role grants). Clients ask for the result; they do not re-derive the rule.

### Functional Style

We favor a functional programming style. Most other guidance in this file falls out of these fundamentals:

- Write short, declarative functions with no side effects. Break large functions into small, readable, individually testable units.
- Avoid mutable variables. Prefer `const`, expressions, and returning new values over declaring and mutating.
- Avoid imperative loops for data transforms. Prefer `map`/`filter`/`flatMap` or Ramda pipelines. (`for...of` with `await` is still fine for ordered, sequential side effects such as migrations.)
- Handle "zero, one, or many" as a list, not a branch. Build the list of work (a one-item list for the default case) and run one pipeline over it (`map` → `Promise.all` → `flat`). Don't branch on `length` or special-case a single item:

  ```typescript
  // ❌ special-cases one item
  const linked = ids.length === 1 ? await findLinked(ids[0]) : (await Promise.all(ids.map(findLinked))).flat()

  // ✅ one pipeline over the list
  const linked = (await Promise.all(ids.map(findLinked))).flat()
  ```

- If the repo uses Ramda, use it for the transforms listed in `.claude/rules/typescript-standards.md` (dedupe, pluck, group/index, set ops, deep merge, multi-step pipes).
- Keep side effects (SDK calls, IO, DB access) at the boundary; keep domain logic pure.

### TypeScript

See `.claude/rules/typescript-standards.md` for the full rule.

| Topic | Standard |
|-------|----------|
| Bindings | Prefer `const` in new code. Use `let` only for actual reassignment. Do not churn unrelated legacy lines that still use `let`. |
| Types | Explicit types on exports, handlers, public props, and cross-package contracts. |
| Object shapes | `interface` or `type` — match the surrounding file. No `I` prefix. |
| Unknown input | Prefer `unknown` plus narrowing over `any`. Do not spread loosely typed legacy shapes (e.g. `Record<string, any>` blobs) into new code. |
| Imports | External libraries, then workspace packages, then local modules. Import workspace packages by their declared package name. |
| ESM packages | If the package already uses `.js` extensions on relative imports, keep doing that in imports and Vitest mocks. |
| Domain logic | Keep business rules testable without cloud SDKs, UI frameworks, HTTP frameworks, or other runtimes. |
| Collections | Prefer a plain array and `.includes()` / `.some()`. |

### Write For Human Reviewers

Every diff is read by a person before it merges. Optimize for their time:

- **Do** name functions for what they do or return — a reader should predict the output from the name (`getOpenOrdersByUser`, `mapFormToRequest`, `isExpired`). **Don't** use vague verbs like `handle`, `process`, or `manage` unless dispatching is genuinely all the function does.
- **Agents:** don't add comments by default. Suggest them in chat if one would help. **Humans** may comment whenever they want. Full policy: `.claude/rules/typescript-standards.md`.
- **Don't** add defensive code for states that cannot happen: `try/catch` around calls that should fail loudly, `??`/`?.` fallbacks on values the types guarantee, or validation of trusted internal inputs. Validate at system boundaries (user input, external APIs) only. Invariants you can rely on:
  - A rule enforced once does not need repeating in every layer on the same side of a trust boundary: form validation is not repeated in the mapper, and a service check is not repeated in the data module. A check that runs on the client is never the only check; the server still validates and authorizes (`.claude/rules/security.md`).
  - A prop or param with exactly one caller is required, not optional.
  - <!-- TEMPLATE: repo-specific invariants agents can rely on, e.g. "`fetchOrder(id)` throws when the order is missing — do not null-check the result" or "pages behind `<AuthGuard>` are already gated in the UI; do not re-check in the page component (the API still authorizes each request)" -->
- **Do** fail loudly on unexpected input. Throw (or return a 4xx at an API boundary) instead of defaulting, synthesizing placeholder values, or returning an empty result that hides the problem.
- **Don't** leave AI tells: JSDoc blocks on internal helpers, `// Step 1:` scaffolding comments, options/params nothing passes, re-exported aliases, or dead branches "for future use." If a reviewer would ask "why is this here?", remove it.

### Function And File Size

Line counts are signals, not rules. Split when a unit becomes hard to review or mixes responsibilities.

- The bright line: if a function needs a section comment to stay readable, extract a named helper instead — that is a trigger, not a judgment call. Past roughly 30–40 lines, assume the function is doing more than one job.
- One responsibility per function. Name each extracted helper for its output so call sites read as a sentence.
- Thin entry points (handlers, route controllers) are often under about 50 lines; a larger typed router is acceptable when it only dispatches.
- Integration modules may exceed 200 lines when they keep one coherent responsibility.
- UI pages can be larger than components, but new flows should extract form sections, hooks, mappers, and submit helpers instead of growing one page indefinitely.
- Tests may be longer than production files when they cover handler paths or UI states.

## Layer Standards

<!-- TEMPLATE: each layer below holds the generic rules plus prompts for repo specifics; delete any layer the repo does not have. -->

### Backend

<!-- TEMPLATE: runtime and entry-point kinds (HTTP API, queue consumer, scheduled job…), where services live, and the shared client/helper package to use, e.g. "Services live in `services/{name}/src/index.ts`; use `@repo/clients` for DB and storage access" -->

- Keep handlers thin: parse input, call domain logic, format the response. Domain logic lives in functions that take typed inputs, return typed outputs, and are testable without SDK mocks.
- Type the payload the entry point actually receives (queue message, scheduled event, direct invoke). Do not borrow an HTTP event shape for non-HTTP triggers.
- Prefer the repo's shared clients over inline SDK setup in handlers. When you need a differently configured client, pass your own into the shared factory instead of reimplementing the helper.
- Mappers and transforms are pure functions, not classes.
- Grow file layout on demand: start in the entry file; when it is hard to review, extract domain-named siblings; move to `{domain}/` folders only when a cohesive domain or external API appears. Do not create domain folders or many sibling files upfront.
- Error strategy follows the workflow: throw contextual errors where failure should stop the flow; log, continue, and isolate partial failures in best-effort fan-out paths (auth hooks, notification broadcasts); otherwise match the result shape of sibling handlers in the same workflow. A check that decides access is never best-effort (`.claude/rules/security.md`).
- Log failures with enough context to debug them, without logging secrets or sensitive payloads.

### Infrastructure

<!-- TEMPLATE: IaC tool, where stacks live, shared constructs/config helpers, and stack references to copy, e.g. "Stacks live beside their service in `{service}-infra/`; wrap new functions in `SharedFunction`" -->

- Never hardcode environment-specific values (URLs, resource identifiers, scopes); read them through the repo's environment-config helpers.
- Review the infrastructure diff for destructive replacements before moving or renaming stateful resources.

### UI

<!-- TEMPLATE: framework, file structure for a new feature, scaffolding command, styling approach, component library, and error-boundary component, e.g. "New features live in `src/features/{name}/` with `routes.tsx`, `form/`, `hooks/`; styling is CSS modules" -->

Design-quality review criteria live in `.claude/rules/design-review.md`. The cross-cutting rules:

- **Thin pages.** Keep page shells thin; extract form sections, hooks, mappers, and submit helpers.
- **Pure mappers.** Form-to-API transforms are pure functions in their own module, testable without rendering.
- **One styling approach per app.** Do not introduce a second one (a CSS framework, CSS modules, ad hoc CSS files), and no inline styles except rare layout cases.
- **One component library per file.** When an app is migrating between component libraries, use the current one in new code and never mix libraries in a new file.
- **API calls out of JSX.** Put API calls in hooks, API modules, or submit helpers, and route them through the app's shared API wrapper so failures reach error monitoring with useful context.
- **Hook placement.** App-wide hooks go in the shared hooks folder; feature- or page-local hooks go in that feature's folder.
- **Feature flags** come from the repo's flag provider. Do not invent local config toggles for gated behavior.
- **Form types** live in the form's `types.ts`. If using a schema library such as Zod, infer form types from the schema.
- **Derived values, not effects.** Compute read-only derived values inline or in a pure helper called from render and the mapper, not with `useEffect` plus a setter.
- **Stacking.** Use the app's documented z-index layer scale; do not invent per-file z-index values. <!-- TEMPLATE: z-index layer table (layer | value | where), if the app has overlays -->
- **One component per file** by default; colocate only for a clear local-only composition reason.

If the repo uses React Query:

- Query keys are stable and include every input that affects the result.
- Shape fetched data inside `queryFn` or `select`, not by wrapping hook results in `useMemo`.
- Distinguish loading from denied/empty — consumers check `isLoading` before treating a result as absent.

If the repo uses react-hook-form:

- Use `useWatch` (one call with an array of names, not several stacked calls).
- Use built-in rules (`required`, `maxLength`, `validate`) instead of new props or mapper-level checks; make the field non-optional in the form type and let the rule enforce it.
- Read other fields through `validate: (value, formValues) => ...` and re-validate dependents with `rules.deps`, instead of `getValues` or a `useMemo`.

If the repo uses Svelte, follow `.claude/rules/svelte.md`. The cross-cutting rules above apply in Svelte's terms:

- "JSX" is component markup, and a "hook" is a rune module (`.svelte.ts`), placed by the same shared-versus-feature rule.
- "Derived values, not effects" means `$derived`, never an `$effect` that assigns.
- API calls stay out of markup and out of effects. Load data in SvelteKit `load` functions or an API module, and mutate through form actions or submit helpers.

## APIs And Data

### API Error Handling

<!-- TEMPLATE: HTTP framework, where the typed errors and the central error middleware live, e.g. "Express 5 with `errorHandler()` from `@repo/api-utils`" -->

- Throw the repo's typed errors (`BadRequestError`, `ForbiddenError`, `NotFoundError`, or a base error with a status); one central error middleware maps them to the response status and message.
- When the framework forwards async errors to that middleware (e.g. Express 5), do not wrap handlers in `asyncHandler` or `try/catch` just to send a status.

### API Layering

| Layer | Responsibility |
|-------|----------------|
| Route handlers | Parse/validate the request, call a service, shape the response. No DB calls or heavy business logic. |
| Services | Business logic and orchestration. |
| Data modules | Persistence and queries by domain, plus conversions. |
| DB clients | Low-level table/connection wrappers. |
| Middleware | Auth/user context and route guards. |
| Validation | Request schema validation. |

<!-- TEMPLATE: map each layer to its folder (e.g. "Route handlers → `src/routes/`"), record any API that is intentionally flatter (e.g. routes may call data modules directly for simple CRUD), and list deprecated paths not to extend -->

### Data Access

- Data-access modules take domain objects and IDs, never storage-specific keys, so the backing store can change without touching callers. Keep key construction inside the data layer.
- A table set with an owning data module gets its new queries there, not in a consumer.
- SQL user values are always bound parameters; dynamic fragments are for structure only. Do not add interpolated filters, even in files that still contain legacy interpolation.
- Persisted models hold persisted data. Form-only fields belong on the UI form type; display copy and UI-only helpers stay in the UI.
- In workflow or state-machine config, name states for why the item is waiting (`AWAITING_APPROVAL`) and tasks as calls to action (`APPROVE_REQUEST`); do not reuse one name for both.

### Migrations

<!-- TEMPLATE: where migration scripts live, the generator command, and the filename shape, e.g. "`migrations/scripts/{YYYY-MM-DD}_{TICKET}_{kebab-description}.ts` via `pnpm gen migration`" -->

- Seed and data changes go through new migration scripts; do not edit old migration scripts in place.
- If migrations run in filename order, use zero-padded dates so lexicographic order matches chronological order.
- On active shared environments, prefer targeted or conditional writes over scripts that unconditionally overwrite records.

## Testing Matrix

| Layer | Runner | Location | Mock at |
|-------|--------|----------|---------|
| Rating logic and file handling | Vitest | `test/`, one file per `src/` module | The Anthropic client, through `src/rater.ts` |

For what to test and how, use `.claude/rules/testing.md`. <!-- TEMPLATE: link any additional area testing rules, e.g. an E2E rule -->

Cross-cutting principles, whatever the layer:

- **Test logic at the lowest level.** Extract mappers, calculations, and branching into pure functions and test those directly. Do not render a component or invoke a handler just to reach logic that could be a testable util.
- **Assert the observable contract, not the implementation.** Tests should survive a refactor that preserves behavior. Avoid asserting internal call sequences, private state, or intermediate shapes the caller never sees.
- **Small functions make cheap tests.** If a unit is hard to test, that is usually a size/coupling signal — split the function rather than building elaborate test setup around it.
- **Skip tests that do not prove behavior.** Do not add a test just because code changed. If it only restates source, would pass whether or not anything works, or would not catch a regression a reviewer cares about, leave it out.
- **Import, don't copy.** Tests import the code under test from its source module; never paste a copy of production logic into a test file. Delete skipped tests and tests for removed code in the same change.

## Legacy And Intentional Inconsistencies

Agents should read this section before copying a nearby file.

When no row covers the case: match the package you are editing, use the canonical reference for new files, and do not migrate legacy code outside the task's scope.

<!-- TEMPLATE: one row per place where an older pattern coexists with the current one, or where the repo intentionally departs from common advice. Example shape: | Handler layout | Newer packages use `src/index.ts`; older ones use root `index.ts` | Match the edited package; scaffold new code with `src/index.ts` | -->

| Area | Existing inconsistency | What to do |
|------|------------------------|------------|

## Anti-Patterns

| Avoid | Do instead |
|-------|------------|
| New `createHandler(deps)` factories for handler tests | Mock module boundaries with `vi.mock` |
| New fat handlers with SDK setup and domain logic inline | Split IO into domain-named siblings and domain logic into testable helpers |
| Inline SDK client construction in new handlers | The repo's shared clients or extracted IO modules |
| HTTP-style event typing for non-HTTP handlers | Type the actual queue/scheduled/direct-invoke payload |
| Hardcoded environment values (URLs, resource IDs, scopes) | The repo's environment-config helpers |
| String-interpolated SQL with user input | Named parameters and existing query helpers |
| A second styling approach in an app | The app's established styling approach |
| Mixing component libraries in one new or touched file | The current library first; fall back deliberately |
| Copying a legacy feature as the scaffold for new work | The canonical reference for that layer |
| Production `data-testid` by default | Accessible names and semantic structure first |
| Unconditional data overwrites in active shared environments | Targeted or conditional migration writes |

<!-- TEMPLATE: add repo-specific rows, e.g. | Raw `NodejsFunction` for new functions | `SharedFunction` plus explicit grants | -->

## Quick Copy-From Index

<!-- TEMPLATE: grouped lists (e.g. "### Backend", "### UI", "### APIs And Data") of `path` - what it is a good example of, e.g. "- `src/routes/orders.ts` - route handler with validation and typed errors" -->

## Maintenance

When conventions change:

1. Update the area-specific rule if detailed examples live there.
2. Update this file only when the pattern is cross-cutting or belongs in the canonical copy-from index.
3. Keep `AGENTS.md` focused on commands, boundaries, and routing.
4. Keep `.claude/rules/coding-standards.md` as a short always-applied pointer, not a duplicate of this file.
