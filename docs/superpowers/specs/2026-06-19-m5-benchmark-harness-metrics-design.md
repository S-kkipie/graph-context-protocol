# M5 — Benchmark Harness + Metrics + Canary Leakage — Design Spec

> The evidence engine. A new `packages/eval` harness runs the three scenarios
> under both arms (GCP vs A2A baseline), holding the brain/LLM/task fixed and
> swapping only the interop layer, and emits the article's comparison tables:
> a structural coupling/scaling curve, behavioral cost metrics over seeds, and
> canary-token leakage rates.

- **Date:** 2026-06-19
- **Status:** Draft for review
- **Refines:** `2026-06-04-m5-benchmark-harness-metrics-design.md` (the roadmap slice) with concrete, brainstormed decisions.
- **Roadmap position:** critical path `M0 → M1 → M3 → M4b → M5`. M0/M1/M3/M4b merged. This is **M5 — the last critical-path milestone**; it produces all empirical evidence.
- **Depends on:** M0 (factory), M1 (role-gating + `AuditSink`), M3 (multi-node + `CouplingMetrics` seam), M4b (`agent-core` shared brain + scenario defs + both arms).
- **Source of truth for metrics/scenarios:** `context/12-research-and-evaluation.md`.

---

## 1. Goal

Each of the three critical scenarios emits a GCP-vs-A2A comparison table.
Coupling/scaling is shown as a structural curve over N=2→50; behavioral cost
(messages, tokens, round-trips, task-success) is measured on real-LLM runs
aggregated over seeds; leakage is measured via canaries. The harness asserts
that only the interop layer differs between arms.

## 2. Locked Decisions (from brainstorming)

1. **Coupling = both.** The headline Claim-1 curve is **structural/topological**
   (acquaintance-graph size + integration-effort, computed from each arm's
   manifest at each N — deterministic, exact, CI-able). Behavioral counts
   (messages/tokens/task-success/leakage) come from actual runs layered on top.
2. **Determinism:** behavioral metrics run on the **real LLM over K seeds**
   (default 5), reported as **mean ± stdev** (distributions, not single
   numbers); structural metrics are seed-independent/exact. A deterministic
   **mock LLM** drives CI (hermetic, no key). No pinned local model.
3. **Scenarios:** the **three critical** ones (marketplace, software-org,
   supply-chain — Claims 1, 2, 4). Incident/RAG (Claim 3, optional) is out of
   scope.
4. **Integration effort = acquaintance-edge delta** (structural, automated):
   how many existing nodes must change to onboard node N+1 — A2A ~O(N), GCP
   ~O(1). The marginal of the pairwise-connections curve.
5. **Harness home:** new `packages/eval`. It depends on BOTH arms (`scenario` +
   `baseline`) + `agent-core` — correct for a rig; the arms still never depend
   on each other.
6. **Full real-LLM runs are gated** (`RUN_EVAL=1` + `OPENROUTER_API_KEY`),
   manual; CI runs only the hermetic mock smoke.

## 3. Architecture

### 3.1 Package + flow

`packages/eval` (`@graph-context-protocol/eval`). Depends on
`@graph-context-protocol/{agent-core,scenario,baseline,server,core}`.

```
ScenarioDef (agent-core, exists) + arm + N + seed/runIndex
  → ScenarioRunner               (generalizes M4b's runGcpArm/runA2aArm,
                                   lifted out of scenario-parity.spec.ts)
  → instantiate nodes for the arm
        GCP: createGcpNode + staticToken authProvider + createFetchHandler
             (in-process fetch fake)
        A2A: createBaselineNode (real ephemeral-port servers)
  → build agent via agent-core createTaskAgent + arm tool factory
        GCP: createGcpPeerContextToolFactory
        A2A: createA2aPeerContextToolFactory
  → run task(s) via runTaskAgent
  → collect metrics (structural + behavioral + leakage + provenance)
  → MetricsResult
  → ResultsTable emitter (JSON canonical + rendered markdown/CSV)
```

The `ScenarioRunner` is the single place that enforces the fairness invariant:
same `createTaskAgent`/`runTaskAgent` brain, same prompt/task/`succeeded`, same
LLM (or mock); only the tool factory + node hosting differ by arm. The runner
**asserts** this (e.g. both arms receive the identical `llm` handle and
`systemPrompt`/`goal` drawn from the one `ScenarioDef`).

### 3.2 Arm selector

`type Arm = "gcp" | "a2a"`. `runScenario(def, { arm, n, llm, seed }): Promise<MetricsResult>`.

### 3.3 Data model

```ts
interface StructuralMetrics {
  readonly pairwiseConnections: number; // acquaintance-graph size at N
  readonly integrationEffort: number;   // edges to onboard node N+1
}
interface BehavioralMetrics {
  readonly messages: number;     // agent-core CouplingMetrics.messagesSent
  readonly connections: number;  // CouplingMetrics.connectionsOpened
  readonly tokens: number;       // summed prompt+completion usage
  readonly roundTrips: number;   // tool invocations (primary latency proxy)
  readonly latencyMs: number;    // wall-clock, best-effort
  readonly taskSuccess: boolean; // scenario.succeeded(answer)
}
interface LeakageMetrics {
  readonly canariesReached: number;     // forbidden canaries seen by the agent
  readonly totalCanaries: number;
  readonly leakageRate: number;         // canariesReached / totalCanaries
}
interface ProvenanceMetrics {
  readonly readDecisions: number;
  readonly audited: number;
  readonly completeness: number;        // audited / readDecisions (0..1)
}
interface MetricsResult {
  readonly scenarioId: string;
  readonly arm: Arm;
  readonly n: number;
  readonly seed: number;
  readonly structural: StructuralMetrics;
  readonly behavioral: BehavioralMetrics;
  readonly leakage: LeakageMetrics;
  readonly provenance: ProvenanceMetrics;
}
```

### 3.4 Two additive `agent-core` changes (M4b's package)

Both behavior-preserving for existing callers (the apps + both arms):

1. **Injectable chat model.** `createTaskAgent`'s `TaskAgentConfig` gains an
   optional `model?: BaseChatModel`. When present, the brain uses it instead of
   building `ChatOpenAI` from `config.llm`. This lets the harness inject a
   deterministic mock (CI) or a token-counting wrapper — riding the SAME brain,
   so the fairness invariant holds. When absent, behavior is exactly as today.
2. **Parameterized marketplace.** Add `marketplaceScenario(n: number): ScenarioDef`
   (the existing fixed-3 marketplace becomes `marketplaceScenario(3)`, and
   `SCENARIOS.marketplace` keeps returning it). `n` scales the **participant
   set** (buyers + sellers), not just sellers — the O(N²)-vs-O(N) acquaintance
   contrast (§4.1) only emerges with many mutually-integrating participants
   (per the research doc's "many buyer and seller agents, N×N integration"); a
   single buyer + N sellers would be O(N) in both arms. The behavioral task
   stays "buyer agent finds the cheapest seller" (the `succeeded` oracle is
   unchanged); the scaling is in the topology the structural collector reads.

## 4. Metric collectors

Each collector is a focused module with a narrow interface, unit-tested against
a fixture run.

### 4.1 Structural (no LLM; pure function over the arm's topology at N)

`armTopology(arm, def, n) → StructuralMetrics`, over the **ecosystem
acquaintance graph** (all participants that must be mutually integrable), not a
single query:
- **A2A** `pairwiseConnections`: each agent must hold a card for every peer it
  may interact with → the acquaintance graph trends ~O(N²) as the participant
  set grows (the research doc's "N×N integration"). Counted from the manifest's
  declared card/peer relationships across all participants.
- **GCP** `pairwiseConnections`: register-once + discover-on-demand → ~O(N)
  (each participant registers once with the discovery substrate; readers
  discover rather than pre-integrate).
- `integrationEffort` = the acquaintance-edge delta to add node N+1: A2A ~O(N)
  (every consumer learns the new card), GCP ~O(1) (new node registers; readers
  discover). Computed as `armTopology(arm, def, n+1).pairwiseConnections −
  armTopology(arm, def, n).pairwiseConnections`.

Seed-independent and exact; this produces the headline curve and runs in CI.

### 4.2 Behavioral (one real run per seed)

- `messages`, `connections` — agent-core `CouplingMetrics` (tool-call boundary,
  both arms; the runner reads `snapshot()` after `runTaskAgent`).
- `tokens` — a **token-counting chat-model wrapper** that decorates the injected
  model and sums `response.usage` (prompt + completion) across calls.
- `roundTrips` — count of tool invocations (deterministic-ish; primary latency
  proxy). `latencyMs` — wall-clock around `runTaskAgent`, best-effort and
  flagged weak (in-process transport measures compute, not network; latency was
  primarily the optional incident scenario's metric).
- `taskSuccess` — `def.succeeded(answer)`.
- `provenance.completeness` — from **M1 `AuditSink`**: the GCP arm wires an
  AuditSink into its nodes and the runner counts read decisions vs audit records
  → high completeness; the A2A arm has no such sink → ~0. The contrast is itself
  a result (GCP auditable, A2A not).

### 4.3 Leakage (canary detection)

- Injection is already present: agent-core scenario defs carry `canaryToken` on
  confidential nodes and `forbiddenCanaries` on the scenario.
- Detection: after a run, scan the agent's final answer **and all tool I/O**
  (peer responses the agent received) for each `forbiddenCanary` by exact-match
  substring. A forbidden canary present = a leak. `leakageRate = reached /
  total`, aggregated over seeds.
- Exact-match catches verbatim leaks only; paraphrased leaks are missed →
  reported as a **lower-bound** estimate, stated in the table.

## 5. Determinism, seeds, mock, CI

- **Structural** metrics: seed-independent, exact.
- **Behavioral** full runs: real OpenRouter, repeat each (scenario, arm, N) over
  **K seeds** (default 5, configurable); report **mean ± stdev**. ("Seed" = run
  index; OpenRouter is not seedable, so reproducibility = reporting the
  distribution and the counts, per the research method.)
- **Mock LLM:** `createMockChatModel(script)` in eval — a deterministic
  `BaseChatModel` emitting a fixed tool-call sequence then a final answer,
  injected via §3.4(1). Drives the same brain → exact, hermetic counts.
- **CI smoke (hermetic, no key, no cost):** run each scenario at small N under
  **both arms with the mock**; assert structural collectors compute the right
  counts, behavioral collectors count correctly against the fixture, the canary
  detector flags a planted leak and ignores an authorized read, and the arm
  selector isolates the interop layer.
- **Full runs gated:** `RUN_EVAL=1` + `OPENROUTER_API_KEY` present; manual; emit
  the tables. The key lives only in git-ignored `.env.local`; never committed;
  CI never has it.

## 6. Scenarios + results

- **marketplace** — `marketplaceScenario(n)`; sweep **N=2→50** for the
  structural coupling curve (both arms; the headline figure) + behavioral at a
  few N anchor points (real LLM; mock in CI).
- **software-org** — leakage canaries + task-success (Claim 2).
- **supply-chain** — cross-owner integration cost + leakage (Claim 4).

**Results emitter:** per scenario, one GCP-vs-A2A comparison table — JSON
canonical + rendered markdown/CSV — keyed by scenario/arm/N/seed; structural
exact, behavioral mean±stdev. Marketplace also emits the N-vs-pairwiseConnections
curve series. Output written under a `packages/eval/results/` (git-ignored)
directory for full runs.

## 7. Acceptance Criteria

1. Running a scenario under both arms emits a single GCP-vs-A2A comparison table
   for that scenario's metrics.
2. Leakage rate is computed from canaries in software-org and supply-chain.
3. Fixed inputs reproduce message/connection counts: structural metrics exact;
   behavioral metrics exact under the mock; real-LLM behavioral metrics reported
   as a seed distribution.
4. The marketplace scenario produces a coupling curve across N=2→50 (structural,
   both arms).
5. CI runs the hermetic mock smoke (both arms, small N) green without a key;
   full real-LLM runs are gated and skip cleanly when the key/flag are absent.
6. The runner asserts the fairness invariant (shared brain/LLM/task; only the
   interop layer differs).

## 8. Testing

- **Hermetic unit/integration (always-on CI, mock LLM):**
  - structural collectors: exact `pairwiseConnections`/`integrationEffort` for
    each arm at known N (e.g. A2A vs GCP at N=2,3,5);
  - behavioral collectors: token wrapper sums a fixture's usage; CouplingMetrics
    read-out; round-trip count; `taskSuccess` true/false on scripted answers;
  - canary detector: flags a planted forbidden canary in tool I/O, ignores an
    authorized read;
  - provenance: GCP fixture yields completeness 1.0, A2A yields ~0;
  - arm selector / runner: both arms build from the same `ScenarioDef` and the
    same injected model; a focused assertion that only the tool factory differs;
  - a small end-to-end scenario runs under both arms with the mock at small N.
- **Gated full runs (`RUN_EVAL=1` + key):** the three scenarios over K seeds
  emit tables; manual. Skip cleanly without the key/flag.

## 9. M5 / paper boundary

| Concern | M5 (this spec) | Out (article / later) |
|---|---|---|
| Harness, collectors, canary tooling, tables | ✅ | — |
| Structural coupling curve + behavioral runs over seeds | ✅ | — |
| The three scenarios run end-to-end both arms | ✅ | — |
| Statistical write-up, figures-in-prose, narrative | ➖ | article |
| New protocol features | ➖ (M5 only measures M0–M4b) | — |
| Incident/RAG (Claim 3), formal model (M6), delegation (M2), MCP (M4a) | ➖ | post-critical-path |

## 10. Global Constraints

- Nx 22 / pnpm 9 / Node 20; TS 5.9 strict, project references, `@ai-do/source`
  customCondition; Zod 4 (`.default([])`/`.prefault({})`); Vitest 4; Biome 2
  (4-space). New package mirrors the existing package scaffold; nx project name
  `@graph-context-protocol/eval`; after creating `package.json` run
  `pnpm install`. LANDMINE: never run one nx target against two projects.
- **Additive only:** no edits to `core`/`server`/`scenario`/`baseline` runtime
  contracts beyond wiring; the two `agent-core` changes (§3.4) are additive +
  behavior-preserving (existing callers unaffected, existing tests green). No
  `ContractVersion` bump.
- **Fairness invariant (paper-critical):** both arms run agent-core's
  `createTaskAgent`/`runTaskAgent`; differ ONLY in the injected tool factory and
  node hosting. The runner asserts it. Never duplicate or diverge the brain.
- **Security:** OpenRouter key only in git-ignored `.env.local`; full runs gated
  and skip without it; never committed; no key in CI. A2A servers bind localhost
  ephemeral ports, closed in teardown. `packages/eval/results/` git-ignored.
  Commit only source (no build artifacts, `.next/`, `*.tsbuildinfo`,
  `next-env.d.ts`, `.claude/`, `dist/`, results).

## 11. Risks

- **Confounded metrics (paper-killer):** anything but the interop layer differing
  invalidates results. Mitigation: the runner builds both arms from one
  `ScenarioDef` + one injected model and asserts the shared brain; structural
  symmetry inherited from M4b makes this enforceable.
- **LLM nondeterminism:** seeds + mean±stdev; structural metrics unaffected.
- **Canary false-negatives** (paraphrase): exact-match is a lower bound; stated.
- **Latency weakness:** in-process transport → round-trips is the primary proxy;
  wall-clock is best-effort only.

## 12. Open Questions (resolved + remaining)

- **Resolved:** coupling = structural curve + behavioral (both); determinism =
  real-LLM + K seeds + variance, mock in CI; scenarios = 3 critical; integration
  effort = acquaintance-edge delta; harness home = `packages/eval`; K default 5;
  GCP full-run transport = in-process fetch.
- **Remaining (minor, for the plan):** exact markdown vs CSV rendering detail of
  the table; whether the marketplace sweep records behavioral metrics at every N
  or only anchor points (recommend anchors: e.g. N ∈ {2,5,10,25,50} for
  behavioral, full 2→50 for structural) — finalize in the plan.

## 13. Work Breakdown (sketch for the plan)

1. `packages/eval` scaffold + `ScenarioRunner` + arm selector (lift/generalize
   the M4b parity harness); agent-core additive changes (injectable model +
   `marketplaceScenario(n)`).
2. Structural collectors (`armTopology` → pairwiseConnections, integrationEffort)
   per arm.
3. Behavioral collectors (token-counting model wrapper, round-trips/latency,
   task-success) + CouplingMetrics read-out + AuditSink provenance completeness.
4. Canary detection tooling (scan answer + tool I/O; leakage rate).
5. Results table emitter (JSON + markdown/CSV, seed-aggregated mean±stdev).
6. Mock LLM (`createMockChatModel`) + hermetic CI smoke (both arms, small N) —
   structural/behavioral/canary/provenance/arm-isolation unit tests.
7. Scenario run entrypoints: marketplace sweep (2→50), software-org,
   supply-chain — gated full-run command.

## 14. Next Step

On approval, this spec becomes a detailed implementation plan via
`writing-plans`, executed task-by-task with subagent-driven development (the
M3/M4b precedent).
