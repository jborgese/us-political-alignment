# Coding Standards

**Canonical document:** [`docs/CODING_STANDARDS.md`](../../docs/CODING_STANDARDS.md)

Read it before implementing features in this repo. It encodes established patterns (mappers, handlers, hooks, APIs, legacy/intentional inconsistencies, testing matrix) and links to area-specific rules — do not reinvent parallel conventions.

**Precedence:** ticket/spec → `CODING_STANDARDS.md` → area `.mdc` rule → agent role → skills.

**Quick anchors:** pure logic = `src/scoring.ts`; schemas and file loading = `src/files.ts`; SDK boundary = `src/rater.ts`; test that mocks a module boundary = `test/rate.test.ts`.
