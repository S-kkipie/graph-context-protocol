---
name: gcp-research-migration
description: GCP research migration lands as numbered TDD tasks on branch gcp-research-migration, each a small factory plus its tests, controller-verified
metadata:
  type: project
---

The GCP research migration consolidates react-agent construction that was duplicated across `apps/researcher/src/lib/graph.ts` and `apps/executor/src/lib/graph.ts` into reusable factories in `packages/scenario` (e.g. Task 4 `createGcpNode`, Task 5 `createNodeAgent`).

**Why:** Removing duplication between the researcher and executor app graphs; each app graph differs only in temperature, peer `targetNodeId`, and system prompt, so the factory parameterizes exactly those.

**How to apply:** Work arrives as numbered "Task N" review requests on branch `gcp-research-migration`. Each is a tightly scoped commit (one factory + its 3-ish TDD tests) with the test run / typecheck already verified by a controller before it reaches review. Focus review on (a) faithful parameterization vs the two source `graph.ts` files and (b) tests that exercise the real factory without mocking the unit under test. Out-of-scope-for-the-task items (barrel exports, app rewiring) are tracked as follow-ups — see [[scenario-empty-barrel]]. Factory return types are intentionally implicit (whatever `createReactAgent` returns); apps consume `.stream`/`.invoke` structurally.
