# M5 — Benchmark Harness + Metrics + Scenarios — Design Spec

> The evidence engine. Uniform metrics across the GCP arm and the A2A baseline, canary-token leakage measurement, and the three scenarios as runnable, seeded experiments. This milestone produces the article's tables and figures.

- **Date:** 2026-06-04
- **Status:** Draft for review
- **Parent:** `2026-06-04-gcp-research-migration-design.md` (milestone M5)
- **Thesis-critical:** YES (produces all evidence)
- **Depends on:** M0 (factory), M1 (role-gating + audit/provenance), M3 (multi-node + metrics seam), M4b (A2A baseline)

## 1. Goal

Each scenario emits a GCP-vs-A2A metrics table; leakage is measured via canaries; runs are reproducible from a seed. The harness swaps only the interop layer, holding LLM and task fixed.

## 2. Current State (relevant slice)

- **Nothing exists.** No benchmark/metrics/canary/simulation code in any package. The metrics table, scenarios, canary method, and experimental method live **only** in `context/12-research-and-evaluation.md`.
- M1 provides the `AuditSink` (read-provenance) the leakage + provenance-completeness metrics consume. M3 provides the connection/message-count seam. M4b provides the comparison arm.

## 3. Scope

**In:**
- An **eval harness** (new `packages/eval` or `apps/eval`) that runs a scenario under a chosen interop arm and collects metrics uniformly:
  - pairwise connections, messages exchanged, tokens, latency/round-trips, task-success rate, integration effort, provenance completeness.
- **Canary-token tooling:** inject unique canaries into confidential nodes; detect them in under-privileged agents' outputs/transcripts → leakage rate (Claim 2).
- **Scenarios** as seeded, scripted experiments built on the M0 factory:
  - marketplace (Claim 1 — coupling/scaling curve, 2→50),
  - software-org (Claim 2 — leakage canaries + task success),
  - B2B supply-chain (Claim 4 — cross-owner integration cost + leakage),
  - optional incident/RAG (Claim 3).
- A **common rig**: same LLM, same task, same agent logic; only GCP ↔ A2A baseline differs. Outputs counts (not just wall-clock), keyed by seed.

**Out:**
- Statistical write-up / the article prose itself (separate from the harness).
- New protocol features — M5 only measures what M0–M4 built.

## 4. Design

- A scenario = `{ nodes manifest, task(s), expected-success oracle, policy set, canaries }`. The runner instantiates the manifest under arm = GCP or A2A, executes tasks, and records metrics into a results table (JSON + a rendered markdown/CSV).
- Metrics collected from defined seams: M1 `AuditSink` (reads, decisions → leakage + provenance completeness), M3 counters (connections, messages), LLM client wrapper (tokens), wall-clock + round-trip counter (latency).
- **Determinism:** seed scenario randomness; for token-count stability consider pinning a deterministic/local model (= parent §11 Q3) — free-tier OpenRouter models vary.
- Canary detection: exact-match unique tokens scanned in every agent's emitted text and tool I/O; a canary from node X reaching an agent not authorized for X = a leak.

## 5. Work Breakdown

1. Harness skeleton: scenario schema + runner + arm selector (GCP | A2A).
2. Metrics collectors wired to M1/M3/LLM seams; results table emitter.
3. Canary injection + detection tooling.
4. Scenario: marketplace (scaling sweep).
5. Scenario: software-org (leakage).
6. Scenario: supply-chain (cross-owner).
7. (optional) incident/RAG.

## 6. Acceptance Criteria

- Running a scenario under both arms emits a single comparison table (GCP vs A2A) for that scenario's metrics.
- Leakage rate is computed from canaries in the software-org and supply-chain scenarios.
- A fixed seed reproduces message/connection counts (token counts reproducible if a deterministic model is used).
- The marketplace scenario produces a coupling curve across N = 2→50.

## 7. Test Plan

- Harness unit tests: metrics collectors count correctly against a fixture run; canary detector flags a planted leak and ignores authorized reads; arm selector isolates interop layer.
- A smoke scenario runs end-to-end under both arms in CI (small N) without external LLM calls (mock LLM) to keep CI hermetic; full runs are manual/seeded.

## 8. Risks

- **Confounded metrics:** anything but the interop layer differing between arms invalidates results — enforce shared agent logic + LLM + task; assert it in the runner.
- **LLM nondeterminism** distorts token/success counts — mitigate with a pinned model and multiple seeds; report variance.
- Canary false-negatives (paraphrased leaks) — use multiple canary forms; treat as a lower-bound leakage estimate and say so.

## 9. Open Questions

- Deterministic/local model vs OpenRouter free tier for reproducible token counts (= parent §11 Q3).
- Harness home: `packages/eval` vs `apps/eval`.

## Links
- Parent roadmap: `2026-06-04-gcp-research-migration-design.md`
- Prev: M4 · Next: M6 `2026-06-04-m6-formal-model-no-leak-design.md`
