---
name: langgraph-llm-spec-preexisting-failure
description: packages/langgraph/src/lib/llm.spec.ts fails to load (afterEach not defined) — pre-existing, not a branch regression
metadata:
  type: project
---

`packages/langgraph/src/lib/llm.spec.ts` fails at suite collection with `ReferenceError: afterEach is not defined`. The file imports only `{ describe, expect, it }` from vitest but calls `afterEach` at line 7. The langgraph `vitest.config.mts` has `globals: true`, yet the global is not resolving for this file.

**Why:** When running `vitest run packages/langgraph`, this shows up as 1 failed *suite* (133 tests still pass). It is easy to mistake for a regression introduced by whatever branch is under review. It is NOT — the file was last modified in commit `b146ab0` ("feat: add OpenRouter LLM factory..."), which predates recent feature branches.

**How to apply:** When reviewing a langgraph-touching branch and seeing this failure, first run `git diff <base>..HEAD --stat -- packages/langgraph/src/lib/llm.spec.ts`; if empty, it is out of scope — note it as pre-existing tech debt, do not block the branch on it. The actual fix is trivial (add `afterEach` to the vitest import or rely on globals correctly), but belongs in its own cleanup.
