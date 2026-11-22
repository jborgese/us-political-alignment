---
paths:
  - "**/*.tsx"
  - "**/*.svelte"
---

<!-- TEMPLATE: narrow the frontmatter file patterns to the UI source directory and include its .ts files so hooks and mappers are covered, e.g. web/src/**/*.tsx and web/src/**/*.ts -->

# Design-First Code Principles

Apply when writing or reviewing UI code. Evaluate changes on design quality and change economics, not cosmetic cleanliness.

**Primary question:** Does this change make the system easier or harder to evolve?

The examples below use React terms. In Svelte, read "JSX" as component markup, "hook" as a rune module (`.svelte.ts`), and `useState` as `$state`; Svelte-specific rules live in `.claude/rules/svelte.md`.

## Evaluation Criteria

1. **State ownership and locality**: Is state owned at the lowest reasonable level?
2. **Separation of UI from business logic**: Can logic run without rendering?
3. **Component responsibility clarity**: Does each component have one clear purpose?
4. **Coupling and dependency direction**: Are components coupled by intent or structure?
5. **Change locality**: How many files change when requirements evolve?

## Red Flags To Avoid

### Critical

- Business logic inside JSX or render functions
- State duplicated across multiple components
- Direct API calls inside JSX-heavy components — put them in hooks, API modules, or form submit helpers
- Business rules coupled to router or framework lifecycle

### Major

- Prop drilling through 3+ levels of components when context would be clearer
- State lifted to a parent when only one child needs it
- Components tightly coupled to parent state shape
- Boolean flag explosions controlling behavior
- Conditional logic for one feature scattered across many components

## Positive Patterns To Follow

- **State owned at the appropriate level** — a tabs component keeps tab selection in local `useState` instead of lifting it to the page.
- **Pure business logic extracted from components** — form-to-API transforms live in a `mappers.ts` module as pure functions testable without rendering.
- **Custom hooks encapsulate fetch behavior** — a hook wraps the data-fetching library with a typed return, keeping query keys and data shaping out of components.

<!-- TEMPLATE: optionally name one repo file per pattern above as a copy-from anchor, e.g. "`src/features/orders/form/mappers.ts`" -->

## Key Questions

When writing or reviewing code, ask:

1. Where is state owned? Does it belong there?
2. Can core logic be tested without rendering a component?
3. If requirements change, how many files need updates?
4. Am I depending on stable abstractions or volatile implementation details?
5. Did I reduce complexity, or just move it to different files?
