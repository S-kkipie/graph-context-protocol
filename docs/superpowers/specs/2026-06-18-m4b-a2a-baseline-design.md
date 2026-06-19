# M4b — A2A Message-Passing Baseline — Design Spec

> Build the experimental **control arm** for the GCP thesis: a good-faith,
> real-SDK A2A message-passing implementation that runs the same scenario
> tasks as the GCP arm, so the article can compare *read-first role-gated
> context federation* against *point-to-point message-passing* on coupling,
> leakage, and cost at equal task success.

- **Date:** 2026-06-18
- **Status:** Draft for review
- **Refines:** the **M4b** portion of `2026-06-04-m4-mcp-a2a-bridges-baseline-design.md` (which remains the roadmap slice; M4a / MCP bridge is out of scope here and lands after the empirical results).
- **Roadmap position:** critical path `M0 → M1 → M3 → M4b → M5`. M0/M1/M3 merged. This is M4b.
- **Depends on:** M3 (HTTP transport, `CouplingMetrics` seam, `resolveContextQuery`, federated read) and M0 (`scenario/node-agent.ts` parameterized agent).
- **Source of truth for target direction:** `2026-06-04-gcp-research-migration-design.md` (thesis spine), `context/12-research-and-evaluation.md`.

---

## 1. Goal

An A2A-style message-passing implementation runs the same scenario tasks as
GCP, as the experimental control. The single biggest threat to the paper is
**baseline fairness** — a strawman baseline invalidates the result — so M4b is
built with M3-level rigor and its fairness choices are documented here.

The deliverable proves: both arms run the **same** task, with the **same**
agent brain (LLM, prompt, retry, task definition), differing **only** in the
substrate that fetches peer data (GCP federated read vs A2A message). Both
arms emit the same coupling-metric shape.

## 2. Locked Decisions (from brainstorming)

1. **Real A2A SDK** — use `@a2a-js/sdk` (official JavaScript SDK, Agent2Agent
   protocol). Maximum external credibility. Used **only** for the
   transport/discovery/messaging layer; the agent brain stays shared.
2. **Baseline home:** new `packages/baseline` (a library; the M5 harness
   launches its nodes as local express servers). Kept out of the GCP SDK so it
   cannot share GCP policy machinery (confound guard).
3. **Shared agent brain:** new neutral `packages/agent-core` package. Neither
   arm owns the brain. This is the fairness anchor, enforced structurally by
   the dependency graph.
4. **Scenario scope:** all three scenarios (marketplace, software-org,
   supply-chain) are **defined** in M4b (node graph, roles, policies, agent
   goal/prompt, success predicate, canary placement) inside `agent-core`. M5
   keeps only the **measurement rig** (metric aggregation, canary *detection*
   tooling, seeded reproducibility, output tables). See §10 for the boundary.
5. **Test brain:** the three-scenario **task-success parity** runs end-to-end
   on the **real LLM** (OpenRouter), gated by API key + env flag (skips in CI
   when absent). Substrate plumbing (A2A client connection counting, message
   routing, card discovery, metrics seam, error paths) is covered by
   **deterministic** unit/integration tests with fakes. Real-LLM parity
   asserts task success on both arms + metrics emitted — **not** exact metric
   equality (the comparative numbers are M5's result; LLM nondeterminism would
   make equality flaky).
6. **Baseline access-control posture:** card-declared **coarse allow/deny**.
   Each agent's card declares the skills/data it exposes and answers any peer
   asking for an exposed skill. No federated role-gated *context* policy —
   because A2A has none natively. Leakage thus arises from the **architecture**
   (no first-class context governance), not from omitting obvious security.
7. **Transport:** JSON-RPC over HTTP (the SDK default). gRPC and HTTP+JSON/REST
   skipped (YAGNI).

## 3. Architecture

### 3.1 Package graph & dependency direction

```
packages/agent-core   (NEW, substrate-neutral — the fairness anchor)
   ▲                  ▲
   │                  │
packages/scenario     packages/baseline   (NEW, A2A control arm)
(GCP arm, existing)
```

- `agent-core` depends on `@langchain/*` and `zod` only. It knows nothing
  about GCP (`server`/`core`) or A2A (`@a2a-js/sdk`).
- `scenario` (GCP arm) gains a dependency on `agent-core` and binds the
  neutral seam to the GCP federated-read substrate.
- `baseline` (A2A arm) depends on `agent-core` and `@a2a-js/sdk` and binds the
  neutral seam to the A2A-client substrate.

**Key invariant:** the only code that differs between arms is the
`PeerContextToolFactory` implementation. Same brain, same prompt, same retry,
same task definitions, same metric shape — all pulled from `agent-core`. That
IS the swap-only-the-layer fairness contract, enforced by the dependency graph
(neither arm can reach the other's substrate).

### 3.2 The neutral seam (`agent-core`)

```ts
/** Opaque per-peer auth payload; each substrate interprets it. */
export type Credentials = Record<string, unknown>;

/** A peer an agent can consult. Endpoint meaning is substrate-specific. */
export interface PeerRef {
  readonly peerId: string;
  /** Knowledge/agent id at the peer (GCP target node id / A2A skill target). */
  readonly targetNodeId: string;
  /** Peer URL — GCP context-query URL, or A2A base URL. */
  readonly endpoint: string;
  readonly credentials?: Credentials;
}

/** Pull-based coupling counts, measured at the agent tool-call boundary. */
export interface CouplingMetricsSnapshot {
  readonly peersKnown: number;       // peers this agent was given
  readonly connectionsOpened: number; // distinct peers contacted (Set-deduped)
  readonly messagesSent: number;      // total peer calls
}
export interface CouplingMetrics {
  recordPeerContacted(peerId: string): void;
  recordMessageSent(): void;
  setPeersKnown(count: number): void;
  snapshot(): CouplingMetricsSnapshot;
}
export function createCouplingMetrics(): CouplingMetrics;

/** Builds the LangChain tool the LLM calls to read one peer; records metrics. */
export type PeerContextToolFactory = (
  peer: PeerRef,
  metrics: CouplingMetrics,
) => StructuredTool;

export interface TaskAgentConfig {
  readonly llm: { model?: string; temperature?: number; apiKey?: string };
  readonly systemPrompt: string;
  readonly peers: ReadonlyArray<PeerRef>;
  readonly toolFactory: PeerContextToolFactory; // GCP or A2A binding
  readonly metrics: CouplingMetrics;
}
/** The shared brain: a react agent, tool-injected, substrate-agnostic. */
export function createTaskAgent(config: TaskAgentConfig): CompiledStateGraph<…>;
```

`createTaskAgent` is the extraction of the existing
`scenario/node-agent.ts:createNodeAgent` body (same `createReactAgent` + LLM +
system prompt), generalized so the per-peer tools are produced by an injected
`toolFactory` instead of being hardcoded to `createContextQueryTool`.

Coupling is measured at the **agent tool-call boundary** (both arms), so the
measurement is symmetric by construction. The server-side M3 `CouplingMetrics`
in `packages/server` is left untouched.

### 3.3 Scenario definitions (`agent-core`)

The substrate-neutral description of each experiment — what is held fixed
across arms.

```ts
export interface KnowledgeNodeDef {
  readonly nodeId: string;
  readonly content: string;                 // markdown body (fixture)
  readonly tags: ReadonlyArray<string>;
  readonly canaryToken?: string;            // confidential marker, if any
  /** GCP arm: role-gated policy. */
  readonly readableByRoles: ReadonlyArray<string>;
  /** Baseline arm: card-declared coarse exposure. */
  readonly exposedSkills: ReadonlyArray<string>;
}
export interface AgentNodeDef {
  readonly nodeId: string;
  readonly role: string;                     // principal role for GCP gating
  readonly systemPrompt: string;
  readonly goal: string;                     // user task message
  readonly peers: ReadonlyArray<string>;     // knowledge nodeIds it may consult
}
export interface ScenarioDef {
  readonly id: "marketplace" | "software-org" | "supply-chain";
  readonly knowledgeNodes: ReadonlyArray<KnowledgeNodeDef>;
  readonly agent: AgentNodeDef;
  /** True iff the agent accomplished the task. */
  readonly succeeded: (finalAnswer: string) => boolean;
  /** Canary that must NOT appear at the agent for the leakage claim. */
  readonly forbiddenCanaries: ReadonlyArray<string>;
}
export const SCENARIOS: Record<ScenarioDef["id"], ScenarioDef>;
```

A scenario node plays one of two roles: a **knowledge node** (holds content,
answers reads) or the **agent** (runs the brain, consults peers). The GCP arm
realizes knowledge nodes as `createGcpNode` servers and the agent as
`createTaskAgent` + GCP substrate; the baseline realizes both as A2A servers.

## 4. GCP arm binding (`packages/scenario`)

- Add `agent-core` dependency.
- Refactor `node-agent.ts`: `createNodeAgent(config: NodeAgentConfig)` becomes
  a thin wrapper that builds a **GCP `PeerContextToolFactory`** and delegates
  to `agent-core`'s `createTaskAgent`. The GCP factory builds a tool
  equivalent to today's `createContextQueryTool` (issue `createContextQuery` →
  `queryRemoteContext({ url: peer.endpoint, query, credentials })`, fail-soft
  on error) **plus** `metrics.recordPeerContacted(peer.peerId)` +
  `metrics.recordMessageSent()` on each call.
- `createNodeAgent`'s public signature and behavior are **preserved** — both
  Next.js apps (`apps/{researcher,executor}/src/lib/graph.ts`) import it
  unchanged. Existing scenario tests stay green.
- `createGcpNode`, `manifest`, `config` are otherwise untouched.

## 5. A2A arm (`packages/baseline`)

New library. Deps (version-pinned): `@a2a-js/sdk` (~0.3.x), `express`, `uuid`,
`@types/express`, `@types/uuid`. Nx project + Vitest project wired like the
other packages (`@graph-context-protocol/baseline`).

### 5.1 A2A server per node (`createBaselineNode`)

```ts
export interface BaselineNodeHandle {
  readonly url: string;          // base URL (card at /.well-known/agent-card.json)
  close(): Promise<void>;
}
/** Boots one A2A server for a scenario node on an ephemeral localhost port. */
export function createBaselineNode(
  node: KnowledgeNodeDef | AgentNodeDef,
  opts: { port?: number; metrics?: CouplingMetrics; llm?: TaskAgentConfig["llm"];
          peerEndpoints?: Record<string, string> },
): Promise<BaselineNodeHandle>;
```

Builds, per the SDK pattern: an `AgentCard` (name, `protocolVersion`, `url`,
`skills`, JSON-RPC interface), a `DefaultRequestHandler` with
`InMemoryTaskStore` and an `AgentExecutor`, served via express
(`agentCardHandler` + `jsonRpcHandler`, `UserBuilder.noAuthentication`).

Two executor flavors:

- **`KnowledgeExecutor`** (knowledge nodes): on a request, apply
  **card-declared coarse allow/deny** — if the requested skill ∈
  `exposedSkills`, publish the node's `content` (canary included if present) as
  a completed-task artifact; otherwise publish a refusal message. No
  role-gating. Equivalent to GCP's context-query handler + markdown adapter,
  minus the policy layer (the measured architectural difference).
- **`AgentExecutor(brain)`** (the agent node): runs `agent-core`'s
  `createTaskAgent` with the **A2A `PeerContextToolFactory`**; the agent's
  final answer is published as the task result.

### 5.2 A2A peer-context substrate

```ts
export const a2aPeerContextToolFactory: PeerContextToolFactory;
```

Builds a LangChain `StructuredTool` (`name: "query_peer_context"`, same input
schema `{ question }` the GCP tool exposes) that on invoke:
`metrics.recordPeerContacted(peer.peerId)` + `metrics.recordMessageSent()`,
then `ClientFactory.createFromUrl(peer.endpoint)` + `sendMessage({ message:
{ parts: [{ kind: "text", text: question }], role: "user", … } })`, parses the
returned `Task` artifact text (or direct `Message` text) into a string, and
returns it. On transport error or refusal → returns an error string (mirrors
the GCP tool's fail-soft contract so the brain behaves identically).

### 5.3 Metrics

Baseline emits the same `CouplingMetricsSnapshot` via `agent-core`'s
`CouplingMetrics`, incremented in the A2A tool factory — byte-for-byte the same
seam the GCP factory uses. `peersKnown` set from the agent's peer list.

## 6. The three scenarios (defined in `agent-core`)

Each is authored as a `ScenarioDef` with markdown fixtures. Concrete content is
finalized in the plan; the design fixes their shape:

1. **marketplace** *(coupling/scaling — Claim 1)*: N seller knowledge nodes +
   1 buyer agent. Buyer must gather offers from sellers to answer (e.g. "which
   seller has the cheapest item matching X?"). Coupling scales with N. GCP:
   buyer federated-reads sellers; A2A: buyer sends one A2A message per seller.
   Success: answer names the correct seller. N is parameterizable for the M5
   2→N sweep; M4b fixes a small N (e.g. 3).
2. **software-org** *(leakage — Claim 2)*: knowledge nodes = `eng-confidential`
   (holds a canary), `hr-confidential` (canary), `public-readme`. An
   under-privileged agent (e.g. `role:contractor`) is tasked to summarize
   **public** info only. GCP: role-gating denies the contractor the
   confidential nodes → canary never reachable. A2A: the confidential nodes'
   coarse cards either expose or refuse the skill — leakage occurs iff the card
   exposes it, which is the architectural point. Success: a correct public
   summary. Leakage signal: canary present in the agent's answer.
3. **supply-chain** *(cross-owner — Claim 4)*: independently-owned knowledge
   nodes (`supplier`, `manufacturer`, `retailer`), each with an owner-scoped
   confidential canary and a shareable field. An agent must answer a question
   requiring data from ≥2 owners under role-gating. GCP: cross-owner role-gated
   reads return only shareable fields; A2A: cross-owner messages, coarse cards.
   Success: answer combines the shareable data correctly. Leakage signal: no
   foreign-owner canary in the answer.

Canary **placement** lives here in M4b; canary **detection/aggregation across
runs** is M5. M4b's gated parity test may assert the GCP arm does not surface a
canary (gating works) as a sanity check, but does not compute leakage rates.

## 7. Data flow (one scenario run, either arm)

```
ScenarioDef (agent-core)
  → arm instantiates knowledge nodes + agent
  → agent runs goal (createTaskAgent)
     → LLM calls query_peer_context(question) per needed peer
        → GCP:  federated read (queryRemoteContext)   + metrics++
        → A2A:  client.sendMessage to peer            + metrics++
     → peer responds (GCP handler / A2A executor, subject to its access rule)
  → agent produces final answer
  → succeeded(answer) checked; CouplingMetricsSnapshot collected
```

## 8. Error handling

- Peer unreachable / refused: the peer-context tool returns an error string to
  the brain (both arms), never throws — identical brain behavior across arms.
- A2A server lifecycle: `createBaselineNode` returns a handle with `close()`;
  tests start on ephemeral ports and always close in teardown.
- Card allow/deny refusal is a normal response (refusal message), not an error.

## 9. Testing

**Deterministic (always-on CI, no key, no real LLM):**

- `agent-core`: `createTaskAgent` builds with a fake `toolFactory` + a stub LLM
  (scripted tool calls / answer); `createCouplingMetrics` dedupe + counts;
  each `ScenarioDef.succeeded` predicate; scenario fixtures validate.
- `baseline`: A2A server boots on an ephemeral port and serves its card at
  `/.well-known/agent-card.json`; client `sendMessage` round-trip against a
  `KnowledgeExecutor` returns content; coarse allow/deny (exposed skill →
  content, unexposed → refusal); `a2aPeerContextToolFactory` increments metrics
  (3 peers → `connectionsOpened` 3, `messagesSent` 3); peer-down → tool returns
  error string.
- `scenario`: existing GCP tests stay green after the refactor; a GCP
  `PeerContextToolFactory` unit test asserts metric increments.

**Gated real-LLM parity (`OPENROUTER_API_KEY` present + `RUN_LLM_PARITY=1`;
skips cleanly otherwise):**

- For each of the 3 scenarios, run **both arms** end-to-end. Assert
  `succeeded(answer)` is true on both arms and a non-empty
  `CouplingMetricsSnapshot` is collected from each. Does **not** assert exact
  metric equality across arms (that comparison is M5). Uses the key from
  git-ignored `.env.local`.

## 10. M4b / M5 boundary

| Concern | M4b (this spec) | M5 (next) |
|---|---|---|
| Both arms (GCP + A2A) | ✅ built | consumes |
| Shared brain (`agent-core`) | ✅ built | consumes |
| Scenario **definitions** (graph, roles, success, canary placement) | ✅ built | consumes / parameterizes N |
| Coupling-metric **seam** | ✅ symmetric, both arms | aggregates |
| Real-LLM scenario **run** (both arms complete) | ✅ gated parity test | seeded, many runs |
| Token / latency / round-trip / integration-effort / provenance-completeness metrics | ➖ | ✅ added |
| Canary **detection** tooling + leakage **rates** | ➖ (placement only) | ✅ |
| Reproducible seeded experiments + GCP-vs-A2A **tables/figures** | ➖ | ✅ |
| 2→N scaling **sweep** | small fixed N | ✅ full sweep |

## 11. Acceptance Criteria

1. `agent-core` exists; `createTaskAgent` drives a react agent over an injected
   `PeerContextToolFactory`; `createNodeAgent` (GCP) and the baseline both
   consume it; the two arms share brain/prompt/retry/task-defs and differ only
   in the tool factory.
2. `createNodeAgent`'s signature/behavior is preserved; both Next apps build
   and run unchanged; all pre-existing tests green.
3. `packages/baseline` boots an A2A server per scenario node using
   `@a2a-js/sdk`, serves an Agent Card, answers reads under card-declared
   coarse allow/deny, and its agent consults peers via A2A `sendMessage`.
4. Both arms emit the same `CouplingMetricsSnapshot` shape, measured
   symmetrically at the agent tool-call boundary.
5. The three scenarios are defined neutrally in `agent-core` with success
   predicates and canary placement.
6. Deterministic substrate tests pass in CI without a key; the gated real-LLM
   parity test runs all three scenarios on both arms to the same success
   definition when the key is present, and skips cleanly when absent.
7. Additive only: `core` and `server` contracts unchanged (no `ContractVersion`
   bump); the GCP refactor is behavior-preserving.

## 12. Global Constraints

- Nx 22 / pnpm 9 / Node 20; TS 5.9 strict, project references,
  `@ai-do/source` customCondition; Zod 4 (`.default`/`.prefault` rules); Vitest
  4; Biome 2 (4-space indent). New packages mirror existing package config.
- nx project names: existing pattern is `@graph-context-protocol/<pkg>` (test
  via `pnpm nx test @graph-context-protocol/<pkg>`); `server` is the lone short
  name. New packages use the scoped form.
- **Security:** the OpenRouter key lives ONLY in git-ignored `.env.local`;
  never committed; real-LLM tests skip without it; no key in CI. A2A servers
  bind localhost ephemeral ports in tests; no external exposure. Demo tokens
  (`tok:*`) are not secrets. Commit only intended source (no build artifacts,
  `.next/`, `*.tsbuildinfo`, `next-env.d.ts`, `.claude/`).
- Versions of `@a2a-js/sdk`, `express`, `uuid` pinned in `packages/baseline`.

## 13. Risks

- **Baseline fairness (paper-killer).** Mitigated structurally: shared brain in
  `agent-core`, swap only the tool factory, no shared policy machinery, coarse
  card auth (not a strawman, not GCP-grade). Document these choices in the
  paper's methods section.
- **A2A SDK coupling.** The SDK brings its own task/message model; keep it to
  transport only (executor wraps the shared brain). Pin the version.
- **LLM nondeterminism.** Real-LLM parity asserts success + metrics-emitted,
  not exact counts; comparative numbers are M5 with seeds.
- **GCP refactor regression.** `createNodeAgent` is app-facing; preserve its
  signature and keep existing tests as the guard.

## 14. Open Questions (resolved + remaining)

- **Resolved:** SDK (real `@a2a-js/sdk`), baseline home (`packages/baseline`),
  shared-core home (`packages/agent-core`), scenario scope (all 3 defined in
  M4b), test brain (real LLM, gated, for scenario parity), baseline auth
  (card-declared coarse allow/deny), transport (JSON-RPC/HTTP).
- **Remaining (defer to M5, noted here):** LLM determinism for reproducible
  **token** counts (parent §11 Q3) — bites M5's metric tables, not M4b's
  parity gate; metric transport (in-process counters vs exporter — M5 §11 Q2).

## 15. Work Breakdown (sketch for the plan)

1. `agent-core` scaffold + neutral types (`PeerRef`, `Credentials`,
   `CouplingMetrics`/`createCouplingMetrics`, `PeerContextToolFactory`,
   `TaskAgentConfig`) + `createTaskAgent` (extracted from `node-agent`).
2. `scenario` refactor: `createNodeAgent` delegates to `createTaskAgent` via a
   GCP `PeerContextToolFactory` (federated read + metrics); apps untouched;
   existing tests green.
3. `agent-core` scenario defs (3) + `succeeded` predicates + canary specs +
   markdown fixtures.
4. `baseline` scaffold + deps + `AgentCard` builder + `KnowledgeExecutor`
   (coarse allow/deny) + `createBaselineNode` server bootstrap.
5. `baseline` A2A `PeerContextToolFactory` (client `sendMessage` + metrics) +
   `AgentExecutor(brain)`.
6. `baseline` deterministic substrate tests (card, allow/deny, round-trip,
   metrics, error path).
7. Gated real-LLM parity harness + tests for all 3 scenarios on both arms.

## 16. Next Step

On approval, this spec becomes a detailed implementation plan via
`writing-plans`, executed task-by-task with subagent-driven development (the
M3 precedent).
