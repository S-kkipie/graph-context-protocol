# M0 — Foundations & Cleanup — Design Spec

> Remove copy-paste and config debt before it multiplies across every scenario. Extract a parameterized node/scenario factory, fix workspace config, and close the test gaps in modules the research path depends on.

- **Date:** 2026-06-04
- **Status:** Draft for review
- **Parent:** `2026-06-04-gcp-research-migration-design.md` (milestone M0)
- **Thesis-critical:** enabler (every later milestone builds on the factory)
- **Depends on:** nothing (first milestone)

## 1. Goal

One manifest spins up N independent GCP nodes. The researcher/executor demo is reproduced from a reusable factory, not two hand-edited clones. Workspace config debt is gone. The modules later milestones touch (`discovery-functions`, `routing`, `server`, `sync`) have tests.

## 2. Current State (relevant slice)

- `apps/researcher` and `apps/executor` are **mirror clones**. They differ only in: node id (`node:researcher`/`node:executor`), knowledge id (`knowledge:*-context`), role, server/graph id, `CONTEXT-1.md` content, tags (`tasks,notes` vs `results,log`), LLM temperature (0.7 vs 0.2), peer target, `PEER_GCP_URL` default (3001 vs 3000). The `getGcpServer()` singleton + graph wiring in `src/lib/gcp.ts` is otherwise identical, as is `src/lib/graph.ts`, the API routes, and `assistant.tsx`.
- Each graph has exactly **2 nodes** (1 agent + 1 knowledge), no edges; access policy is `createAccessPolicyDescriptor([], [], true, "empty-result")` (public read-all).
- **Config debt:** `pnpm-workspace.yaml` has a stale `core` top-level glob (no such dir); `customConditions: ["@org/source"]` (tsconfig) vs `@ai-do/source` (nx.json release exclude) name mismatch; no `engines`/`packageManager`/`.nvmrc` (README says Node 20+/pnpm 8+, CI uses Node 20/pnpm 9).
- **Test gaps:** core `discovery-functions.ts` (BFS, capability gating, path-rule matching, `denied` collection) has **no spec**; server `routing/`, `server/` (the `GraphContextServerImpl` orchestrator), and `sync/` have **no specs**. Apps have zero tests.

## 3. Scope

**In:**
- A reusable node factory: `createGcpNode(config)` (and its server singleton helper) extracted from the duplicated app code into a shared location (proposed: `packages/scenario` lib, or `apps/_shared` if it must stay app-local).
- A **node manifest** format (TS/JSON) describing a set of nodes: `{ nodeId, knowledgeId, role, accessPolicy, source (context file or inline), peers[], tags, llm:{model,temperature} }`, plus a runner that instantiates all of them.
- Reproduce `researcher` + `executor` from the factory + a 2-node manifest (behavior-identical to today's demo).
- Config hygiene: remove stale `core` glob; reconcile `@org/source`/`@ai-do/source`; add `engines`, `packageManager`, `.nvmrc`.
- Tests: add specs for core `discovery-functions`; server `routing`, `server`, `sync`.

**Out:**
- Any new protocol capability (role-gating exercised = M1, delegation = M2, discovery/multi-node execution = M3). M0 only refactors wiring and adds tests; it does not change protocol semantics.

## 4. Design

- Lift the body of `apps/*/src/lib/gcp.ts` into `createGcpNode(config)` returning a started `GraphContextServer` (preserving the lazy process-singleton pattern). The apps' `src/lib/gcp.ts` shrink to `getGcpServer = () => createGcpNode(RESEARCHER_CONFIG)`.
- Lift `apps/*/src/lib/graph.ts` agent construction into `createNodeAgent(config)` taking `{ llm, peerTargets, systemPrompt }`.
- The manifest runner is decoupled from Next.js so later scenarios (M3/M5) can launch many nodes headless. Next apps remain thin wrappers over the factory.
- Keep `customConditions` source-resolution intact — the factory lives behind the same `@graph-context-protocol/*` import surface.

## 5. Work Breakdown

1. Extract `createGcpNode` + `createNodeAgent` into a shared lib; unit-test.
2. Define manifest schema (Zod) + a headless runner.
3. Rewrite both apps to consume the factory; confirm demo parity.
4. Config hygiene (3 fixes above).
5. Add specs: `discovery-functions`, `routing`, `server`, `sync`.

## 6. Acceptance Criteria

- A single manifest launches N nodes headless; researcher+executor reproduced from it with identical demo behavior.
- `pnpm nx run-many -t lint test build typecheck` green; CI green.
- New specs exist and pass for `discovery-functions`, `routing`, `server`, `sync`.
- No protocol/behavior change observable in the existing 2-node demo.

## 7. Test Plan

- Factory: unit tests for node construction from config (ids, policy, adapter binding, peer wiring).
- Manifest runner: launches ≥3 nodes, each answers a context-query.
- Backfill specs assert the previously-untested logic (BFS denial set, router route kinds, server receive→dispatch, sync run/cancel/status).

## 8. Risks

- Hidden coupling in the singleton pattern (module-scoped promise) — ensure per-node isolation when N>1 in one process; the headless runner may need per-node module state or instance-scoped (not module-scoped) singletons.

## 9. Open Questions

- Factory home: new `packages/scenario` vs `apps/_shared`? (A package is reusable by the eval harness in M5; lean package.)

## Links
- Parent roadmap: `2026-06-04-gcp-research-migration-design.md`
- Next: M1 `2026-06-04-m1-role-gating-provenance-design.md`
