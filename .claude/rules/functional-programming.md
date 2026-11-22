# Functional Programming & Clean Code

Prefer a functional style and keep logic where the data lives.

## Prioritize functional programming

- Favor pure functions, immutability, and composition over mutation and side effects.
- Use declarative transforms (`map`/`filter`/`reduce`, or Ramda `R.pipe`/`R.map`/`R.indexBy`/`R.groupBy` if the repo uses it) instead of imperative loops with accumulator mutation.
- Keep side effects (I/O, network, logging) at the edges; keep the core transform pure.
- Return new values rather than mutating arguments or shared state.

```typescript
// ❌ imperative + mutation
const map: Record<string, User> = {}
for (const c of contacts) map[c.role] = toUser(c)

// ✅ declarative + pure
const map = R.pipe(R.indexBy(R.prop("role")), R.map(toUser))(contacts)
```

## Avoid feature envy

A function that reaches deep into another object's internals to make decisions belongs closer to that object. Move the behavior to where the data lives, or expose a focused helper.

```typescript
// ❌ feature envy: reaching into order.customer internals everywhere
const zip = order.customer?.addresses?.[order.shippingIndex]?.postalCode

// ✅ ask the owning module for what you need
const zip = shippingPostalCode(order)
```

## Avoid code smell

- No duplicated logic — extract a single, well-named helper (e.g. `getUserById(id)` instead of repeating `(await getUsersByIds([id]))[0]` at each call site).
- Functions do one thing; split long functions and deep nesting.
- Name by intent. Avoid flag/boolean params that fork behavior — prefer distinct functions.
- Don't add narration comments; let names carry meaning.
- Smallest change that meets the request; don't expand scope or add speculative abstractions.
