---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.svelte"
---

# TypeScript Standards

- Prefer `const` for local bindings. Use `let` only when a variable must be reassigned after initialization.
- Prefer returning values from helpers or expressions over declaring a variable and mutating it later.
- Use explicit types for exported functions, shared helpers, handlers and other entry points, public component props, and cross-package contracts.
- Object shapes may use `interface` or `type`; match the surrounding file. Do not prefix interfaces with `I`.
- Avoid `any` unless there is no practical typed alternative. Use `unknown` plus narrowing for untrusted input.
- Group imports as external packages, workspace/internal packages, then local modules.
- In a monorepo, import workspace packages by their declared package name.
- Put shared types/constants in a shared package or package-level module instead of duplicating them across apps and packages.
- Keep domain logic testable without cloud SDK, UI, or framework runtime dependencies; isolate SDK/client calls at the boundary.
- Preserve existing package structure and local patterns before introducing a new abstraction.
- Prefer a plain array and `.includes()` / `.some()`.

## Ramda

If the repo uses Ramda (`import * as R from "ramda"`), it is the default for the transforms below.

<!-- TEMPLATE: state whether adding Ramda to a package that lacks it needs approval, e.g. "ramda is in the workspace catalog; adding `"ramda": "catalog:"` (and `@types/ramda` in devDependencies) is pre-approved" -->

| Instead of | Use |
|---|---|
| `[...new Set(xs.map(f))]` | `R.uniq(R.map(f, xs))` / `R.uniqBy(f, xs)` |
| `xs.map((x) => x.key)` feeding another transform | `R.pluck("key", xs)` |
| `reduce` / `Object.fromEntries` building a keyed object or groups | `R.indexBy` / `R.groupBy` |
| `reduce` summing | `R.sum` |
| `Set`-based intersection or difference | `R.intersection` / `R.difference` |
| Hand-written object pick/omit | `R.pick` / `R.omit` |
| Nested spread merges | `R.mergeDeepRight` |
| 3+ chained transforms on one value | `R.pipe` |

A single `.map` / `.filter` stays native.

## Comments

Humans may add comments whenever they want. Agents do not add comments by default.

- If a comment would help, suggest it in chat and explain there. Do not put that explanation in the file.
- Do not add comments to compensate for unclear code. Fix the code.
- **Never remove or edit comments you did not add** in the current change, even if they look redundant. Existing comments belong to the team.
