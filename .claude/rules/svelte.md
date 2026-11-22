---
paths:
  - "**/*.svelte"
  - "**/*.svelte.ts"
  - "**/*.svelte.js"
  - "**/+*.ts"
  - "**/+*.js"
  - "**/hooks.server.*"
  - "**/hooks.client.*"
---

<!-- TEMPLATE: delete this file if the repo has no Svelte. Otherwise narrow the frontmatter file patterns to the app's source directory, e.g. web/src/**/*.svelte and web/src/routes/** -->

# Svelte Standards

Apply when writing or reviewing Svelte components (`.svelte`), rune modules (`.svelte.ts` / `.svelte.js`), and SvelteKit route and hook files. These rules assume Svelte 5 in runes mode and SvelteKit 3. Design-quality criteria live in `.claude/rules/design-review.md`; component-test guidance lives in `.claude/rules/testing.md`.

## Before Writing

- **Read the installed versions.** Check `svelte` and `@sveltejs/kit` in the package manifest. Both add APIs in minor releases and remove them in majors, so use an API only if the installed version has it. If the repo is on an older major, match the repo; do not migrate it as a side effect.
- **Check the docs, not memory, for anything version-sensitive.** If the session has the Svelte MCP server or the `svelte` plugin, look sections up with `list-sections` and `get-documentation`.
- **Ask before enabling an experimental flag.** Experimental features can change in any release. As of Svelte 5.57 and SvelteKit 3.2 that covers `await` in components (`experimental.async`) and remote functions (`experimental.remoteFunctions`); use them only where the repo already enables the flag.

## Reactivity

- **`$state` only for what the UI reacts to.** A value that no markup, `$derived`, or `$effect` reads is a plain variable. Use `$state.raw` for large values that are replaced, not mutated, such as API responses.
- **Mutation has one home.** Reactive state is declared with `let` and updated in place; that is how Svelte works, not a functional-style violation. Keep it local to the component or rune module that owns it, and keep everything computed from it pure.
- **Compute with `$derived`, never with an effect that assigns.** Use `$derived(expression)` for one expression and `$derived.by(() => { ... })` for more.
- **`$effect` is an escape hatch** for syncing with something outside Svelte, such as analytics or a third-party DOM library. Do not update state inside one, and do not wrap its body in a browser check; effects never run on the server. Reach for the alternative first:

| Need | Use |
|---|---|
| A value computed from state or props | `$derived` |
| A response to user input | The event handler, or a function binding (`bind:value={() => value, setValue}`) |
| Setup and teardown tied to an element | `{@attach ...}` |
| A listener on `window` or `document` | `<svelte:window>` / `<svelte:document>` |
| Reading a reactive source outside Svelte | `createSubscriber` from `svelte/reactivity` |
| Logging a value as it changes | `$inspect` |

```typescript
// ❌ state kept in sync by an effect
let total = $state(0)
$effect(() => {
  total = sumPrices(items)
})

// ✅ derived, in sync by construction
const total = $derived(sumPrices(items))
```

## Components

- **Props are live values.** Destructure them from `$props()` with an explicit type. Anything computed from a prop uses `$derived`; a plain variable computed from a prop goes stale when the prop changes.
- **Do not mutate props.** Report changes through callback props. Use `$bindable` sparingly, for components whose purpose is a two-way value, such as an input.
- **Events are callback props.** Listeners are plain attributes (`onclick={...}`), and a component tells its parent something by calling a function it was passed.
- **Content is passed as snippets.** Declare with `{#snippet}`, render with `{@render}`, and type snippet props as `Snippet<[Args]>`.
- **Key `{#each}` blocks** with a stable unique id, never the index.
- **`{#key}` sparingly.** It destroys and recreates its content; use it to replay transitions, not to force recomputation.
- **Styles stay scoped.** Pass dynamic values with `style:--name={value}`, and let a parent theme a child through CSS custom properties (`<Child --color="red" />`). Use `:global` only to reach markup you do not own.
- **Conditional classes** use array or object `class` values, not `class:` directives.

## Shared State And Logic

- **Reusable reactive logic lives in a rune module** (`.svelte.ts`): a function or class that owns `$state` and exposes it. It is the Svelte counterpart of a custom hook.
- **Export state as an object or through accessors.** A `$state` variable that is reassigned cannot be exported; export an object whose properties change, a class instance with `$state` fields, or getter functions.
- **State that belongs to one user goes in context, not module scope, when the app server-renders.** Module-level state is shared by every request on the server, so one user's data can reach the next. Create context with `createContext` so it is typed.
- **No new stores for app state.** Runes replace them; keep `svelte/store` where existing code or a library's contract needs it.
- **Pure logic stays in plain `.ts` modules.** Mappers, validation, and calculations use no runes and are tested without rendering.

## Legacy Syntax

Write runes-mode Svelte 5 in new files. A component is in either runes mode or legacy mode, so a legacy file cannot adopt runes piecemeal: leave it in the mode it is in unless migrating it is the task.

| Legacy | Current |
|---|---|
| `let count = 0` as implicit state | `$state` |
| `$:` statements | `$derived`; `$effect` only when nothing else fits |
| `export let`, `$$props`, `$$restProps` | `$props()` |
| `on:click={...}` | `onclick={...}` |
| `createEventDispatcher` | Callback props |
| `<slot>`, `$$slots`, `<svelte:fragment>` | `{#snippet}` and `{@render}` |
| `<svelte:component this={C}>` | `<C>` |
| `<svelte:self>` | Import the component into itself |
| `use:action` | `{@attach ...}`; framework-provided actions such as `use:enhance` stay |
| `class:` directive | Array or object `class` values |
| `{@const}` | `{const ...}` declaration tags |

## TypeScript

- Use `<script lang="ts">`. Without a script preprocessor, component scripts accept only TypeScript's type-level features, so no `enum` and no constructor parameter properties.
- Type component references as `Component<Props>`, and read another component's props with `ComponentProps`.
- A component that wraps a native element extends that element's attribute type from `svelte/elements` (for example `HTMLButtonAttributes`) and spreads the rest props onto it.
- Type-check with the repo's `svelte-check` script (`sv check`), which covers `.svelte` files.

## If the Repo Uses SvelteKit

- **Server code stays on the server.** Secrets, database clients, and private environment variables live in server-only modules: a `server` segment in the filename (`db.server.ts`) or a `server` directory. Whatever a `load` function returns is sent to the browser, so return only what the page needs.
- **Pick the `load` by what it needs.** Server `load` (`+page.server.ts`) for databases, the filesystem, and private credentials. Universal `load` (`+page.ts`) for public APIs and for values that cannot be serialized. Call the `fetch` that `load` receives, not the global one.
- **`load` is pure.** It returns data; it never writes to module state or a store.
- **No waterfalls.** Start independent requests together, and call `await parent()` after your own requests unless you need its result first.
- **Page data is reactive.** Page and layout components are reused across navigations, so anything computed from `data` uses `$derived`.
- **Mutations are form actions** that work without JavaScript, with `use:enhance` layered on top. Return validation problems with `fail(status, data)`.
- **Expected failures call `error(status, message)`; redirects call `redirect(status, location)`.** Both throw, so keep them out of `try` blocks. Let unexpected errors propagate to the `handleError` hook, which is where logging and reporting belong.
- **Authorize where the data is read.** Populate `event.locals` in the `handle` hook, then guard in `handle` (matching on `event.route.id`, not the URL pathname) or in each `+page.server.ts` `load` and action through a shared helper. A guard that lives only in a layout `load` does not run on every navigation. Remote functions, where the repo has enabled them, check inside each function.
- **App state comes from `$app/state`** (`page`, `navigating`, `updated`). State that should survive a reload or be shareable goes in the URL.
- **Route files take their types from `./$types`** (`PageProps`, `PageServerLoad`, `Actions`).
- **Environment variables are declared in `src/env.ts`** and imported from `$app/env/private` or `$app/env/public`. Give each a schema so a bad value fails at startup.
- **Shared code is imported through `#lib/...`** with the file extension.

## Checks And Tooling

- After changing Svelte code, run the repo's `svelte-check` script and its linter, and fix what they report (type errors, accessibility warnings, unused CSS). Do not add `svelte-ignore` comments to get past a warning.
- If the session has the official Svelte tooling (the `svelte` plugin or the Svelte MCP server, both from `sveltejs/ai-tools`), run `svelte-autofixer` on each component you wrote or changed, and repeat until it reports nothing. If it is not available, do not install or `npx` it on your own; tell the user it exists.
- Prettier formats `.svelte` files only when the repo's config loads `prettier-plugin-svelte`.
