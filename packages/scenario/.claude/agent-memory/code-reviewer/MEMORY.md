# Code Reviewer Memory — graph-context-protocol

- [scenario barrel is intentionally empty](project_scenario-empty-barrel.md) — `packages/scenario/src/index.ts` is `export {}`; lib factories aren't re-exported yet, so judge missing exports as scope, not regression.
- [GCP migration is staged TDD tasks](project_gcp-research-migration.md) — work lands as numbered Tasks on branch `gcp-research-migration`, each a small factory + its TDD tests, pre-verified by a controller.
