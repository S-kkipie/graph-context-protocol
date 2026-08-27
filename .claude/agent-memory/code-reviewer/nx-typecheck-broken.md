---
name: nx-typecheck-broken
description: The repo-wide `nx typecheck` target is pre-existing-broken (TS6310); use per-package tsc -p tsconfig.lib.json to type-check instead
metadata:
  type: project
---

The repo's `nx typecheck` target is pre-existing-broken — it fails with TS6310 ("referenced project may not disable emit") and this is NOT caused by any one task's changes.

**Why:** Project-reference / composite-build config issue at the workspace level, predating the feat/gcp-app-node-wiring work.

**How to apply:** When reviewing a package in this repo, do NOT treat an `nx typecheck` failure as a regression introduced by the change under review. To actually type-check a single package, run `pnpm exec tsc --noEmit -p packages/<pkg>/tsconfig.lib.json` (exit 0 expected). Verified working for `packages/adapters` during Task 4 review (2026-06-02).
