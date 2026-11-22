---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/test/**/*.ts"
  - "**/test/**/*.tsx"
---

<!-- TEMPLATE: adjust the frontmatter file patterns to where tests live, e.g. add **/__tests__/**/*.ts or **/*.spec.ts -->

# Testing Standards (Vitest)

Apply when writing or reviewing unit tests. Cross-cutting principles (test logic at the lowest level, assert the observable contract, skip tests that do not prove behavior) live in `docs/CODING_STANDARDS.md` → Testing Matrix.

## General

- When running `vitest` directly, always pass `--run` to avoid watch mode.
- Tests may be colocated as `src/*.test.ts` or placed under `test/`; follow the existing package pattern.
- Add or update tests in the same PR as the feature or fix.

`npm test` runs `vitest --run`. New tests go in `test/`, one file per `src/` module; shared builders live in `test/fixtures.ts`.

## What to Test

- **Do** test business logic (calculations, transformations, validation) in isolation.
- **Do** test entry-point behavior (handlers, routes): correct results for valid input, and the workflow-appropriate failure for invalid input (thrown error, soft-fail result, or HTTP error).
- **Do** test an access decision where it is made: the guard or policy refuses a caller who is not signed in, lacks the role, or does not own the record. An entry point then needs only a test that it is wired to that guard.
- **Do** test data transformations and mapping functions.
- **Do** test edge cases: null/undefined inputs, empty arrays, missing fields.
- **Avoid** testing SDK internals — mock at the client boundary.
- **Avoid** tests that do not prove behavior — restating source, asserting constants, or adding coverage for its own sake. If the change has no branching, mapping, or failure path to exercise, skip a new test.
- **Avoid** unit tests for trivial pass-throughs — a one-line wrapper around an existing API with no branching does not need its own test.

| Module | What to test |
|--------|--------------|
| Utils | Correct output for various inputs, edge cases, and error throwing |
| Hooks | Initial values, state updates, side effects, and cleanup (test in isolation when they hold real logic) |
| Components | User interactions, callbacks, dynamic rendering, and edge cases |
| API functions | Correct path and data sent, response transformation, and error handling |

## Mocking

- **Do** mock infrastructure at the lowest useful boundary: SDK clients, network, storage, auth, and third-party modules that reach the network.
- **Do** mock the repo's shared client modules when testing handler logic.
- **Do** use `vi.fn()` for mock functions and `vi.spyOn()` for spying. If the repo has `vitest-mock-extended`, use it for typed mocks of complex interfaces.
- **Avoid** over-mocking — prefer testing real business logic with mocked infrastructure boundaries.
- **Avoid** mocking internal utilities or external libraries unless needed to isolate the behavior under test.

### Handler tests

- **Do** export `handler` from the entry module and test it with **`vi.mock()` on sibling modules**.
- **Do** call `vi.clearAllMocks()` in `beforeEach` when reusing mocks across cases; set default mock implementations there too, or use `vi.resetAllMocks()` when implementations must be reset.
- **Avoid** `createHandler(deps)` / constructor-style dependency injection for handlers.
- **Avoid** passing mock implementations into the handler at runtime; mock the module boundary instead.

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/fetchData.js", () => ({
  fetchData: vi.fn(),
}))

import { fetchData } from "../src/fetchData.js"
import { handler } from "../src/index.js"

describe("handler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns skipped when fetch fails", async () => {
    vi.mocked(fetchData).mockRejectedValue(new Error("down"))
    const result = await handler()
    expect(result.status).toBe("skipped")
  })
})
```

## Structure And Assertions

- Use `describe` / `it` blocks with names that explain behavior, not implementation. Structure each test as arrange-act-assert.
- Group tests by scenario or function under test.
- Prefer one `toEqual` on the whole object/array over a run of single-property checks — it documents the full shape and catches unexpected properties. Use `toMatchObject` for partial matches.
- Assert separate concerns individually (`isLoading`, `error`, and `data` are different concerns).
- Combine assertions that share the same setup and describe one behavior; do not write three tests with identical setup to check three fields of the same output. Keep tests separate when inputs, scenarios, or interactions differ.

```typescript
// ✅
expect(result).toEqual({ status: "active", limit: 50, regionId: 123 })

// ❌
expect(result.status).toBe("active")
expect(result.limit).toBe(50)
expect(result.regionId).toBe(123)
```

## Avoiding Flaky Tests

- **Avoid** tests that depend on execution order or shared mutable state.
- **Avoid** tests that rely on timing or speed of execution.
- **Do** clean up mocks and side effects in `beforeEach` or `afterEach`.
- **Do** use `async/await` correctly for asynchronous assertions.

## If the Repo Has a React UI

Components render through React Testing Library. <!-- TEMPLATE: the shared render wrapper/providers and test environment, e.g. "`import { render, userEvent } from '@/test-utils/render'`; Vitest + happy-dom" -->

### What to test

- **Do** test dynamic content, formatted values, conditional rendering, and user interactions (clicks, typing, form submissions).
- **Avoid** testing static text that does not vary with props or state, or that a static component merely renders.
- **Avoid** testing internal state, private methods, call sequences, or styling class names — anything a user cannot observe.
- **Avoid** unit-testing fixed copy or string concatenation alone; verify it manually or via E2E when it matters.

### Finding elements

Use this priority order:

1. `getByRole` (with an accessible name)
2. `getByLabelText`
3. `getByPlaceholderText`
4. `getByText`
5. `getByDisplayValue`
6. `getByAltText`
7. `getByTestId` as a last resort — for generated internals or interactive elements without a stable name

Never select by class name or element type.

```tsx
const button = screen.getByRole("button", { name: /submit/i })
```

### User events

- **Do** use `userEvent` (not `fireEvent` or direct DOM `.click()`) unless the flow genuinely cannot be expressed with it.
- **Do** await interactions and async updates.

```tsx
const user = userEvent.setup()
await user.type(screen.getByLabelText(/name/i), "Ada")
await user.click(screen.getByRole("button", { name: /save/i }))
await waitFor(() => expect(onSave).toHaveBeenCalled())
```

### Mocking in UI tests

- **Do** mock real boundaries: services and API calls, `fetch` and other browser APIs, storage, auth, and third-party modules that reach the network.
- **Do not** mock by default: small child components, cheap deterministic hooks, internal utilities, or design-system components — render the real thing.
- Mock a child component only when it is a server component, genuinely expensive to set up, or calls external APIs unrelated to the flow under test; keep that mock local and assert the integration contract.

```tsx
import { fetchOrders } from "../../services/orders"

vi.mock("../../services/orders")

it("loads orders for the selected filters", async () => {
  vi.mocked(fetchOrders).mockResolvedValue(mockOrders)
  render(<OrderList />)
  await userEvent.setup().click(screen.getByRole("button", { name: "Load orders" }))
  expect(fetchOrders).toHaveBeenCalledWith({ status: "open" })
})
```

## If the Repo Has a Svelte UI

Use the component-test harness the repo already has, and do not add a second one. Projects scaffolded with `sv add vitest` run component tests in Vitest browser mode through `vitest-browser-svelte`; others commonly render in jsdom through `@testing-library/svelte`. <!-- TEMPLATE: the harness, shared render helper, and how files are routed, e.g. "browser mode via `vitest-browser-svelte`; `*.svelte.test.ts` runs in the browser project, other tests in Node" -->

The React guidance above carries over: test what a user can observe, find elements by role and accessible name, and mock only real boundaries.

- **Do** move logic out of the component before testing it: into a pure `.ts` module, or into a rune module (`.svelte.ts`) when it holds state. Render a component only for behavior a user can observe.
- **Do** name the file `*.svelte.test.ts` when the test itself uses runes. Only files with `.svelte` in the name are compiled for runes, and a scaffolded config uses the same name to send the test to the browser.
- **Do** wrap the test body in `$effect.root` when the code under test creates effects, call `flushSync()` before asserting, and call the cleanup function it returns.
- **Do** test two-way bindings, context, and snippet props through a small wrapper component written for the test.
- **Avoid** asserting on `innerHTML` or on component internals.

```typescript
import { expect, it } from "vitest"
import { createCart } from "./cart.svelte.js"

it("totals the items in the cart", () => {
  const cart = createCart()
  cart.add({ sku: "tea", price: 5 })
  cart.add({ sku: "cup", price: 7 })
  expect(cart.total).toBe(12)
})
```
