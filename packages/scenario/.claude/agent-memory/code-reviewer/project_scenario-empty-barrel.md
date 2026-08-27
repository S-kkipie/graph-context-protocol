---
name: scenario-empty-barrel
description: scenario package public entry (src/index.ts) is export {} — lib factories are deliberately not re-exported yet
metadata:
  type: project
---

As of the `gcp-research-migration` branch, `packages/scenario/src/index.ts` is `export {}`. Neither `createGcpNode` (Task 4) nor `createNodeAgent` (Task 5) is re-exported from the package's public entry, so the researcher/executor apps cannot yet import these factories — the extracted code is not wired in.

**Why:** The migration lands as small staged tasks (factory + its TDD tests). Barrel export + app rewiring is a deliberately separate later task, not part of each factory's task scope. Confirmed `export {}` at the Task 4 parent commit `e3ceae9`, so it is the established state, not a regression any single commit introduced.

**How to apply:** When reviewing a new factory in this package, do NOT rate "not exported from index.ts / not consumed by apps" as a defect of that commit. Flag it only as the expected follow-up. Once a task is explicitly about wiring, then a still-empty barrel IS a real blocker. See [[gcp-research-migration]].
