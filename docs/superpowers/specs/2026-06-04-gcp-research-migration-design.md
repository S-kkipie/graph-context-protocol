# GCP Research Migration — Design Spec

> Bridge the current codebase (a working 2-node read-first context-query demo) to the brainstormed research direction: a Q1 article whose falsifiable thesis is *"read-first role-gated context federation beats point-to-point message-passing for multi-agent ecosystems."* The GCP SDK is the reference artifact; an A2A-style baseline and a benchmark suite produce the evidence.

- **Date:** 2026-06-04
- **Status:** Draft for review
- **Supersedes scope of:** none (extends `2026-06-02-gcp-app-node-wiring-design.md`)
- **Source of truth for target direction:** `context/12-research-and-evaluation.md` (research), `context/11-direction.md` (engineering)
- **Scope note:** This is a **migration roadmap spec**. The work is too large for a single implementation plan, so it decomposes into milestones (M0–M6). Each milestone becomes its own spec → plan → implementation cycle.

---

## 1. Purpose

The repository today proves one primitive end-to-end: a read-first GCP `context-query` between two independently-owned Next.js nodes. The research direction requires more: role-gated access actually exercised, structured provenance, multi-node federation, MCP/A2A interoperability, an A2A baseline, and a metrics-producing benchmark suite. This spec inventories what exists, defines the target, computes the gap, and orders the work along the critical path to publishable evidence.

## 2. Current State (grounded in repo inventory)

### 2.1 `@graph-context-protocol/core`
- **Complete:** graph (immutable nodes/edges, 6 edge classes, serialization), role/capability/context-rule schema, context propagation, the full federated **contract layer** (`ContextQuery`/`ContextQueryRequest`, `ContextQueryResponse`, `RequesterDescriptor`, `ContextPeerDescriptor`, `ExposedKnowledgeDescriptor`, `AccessPolicyDescriptor`, `KnowledgeQueryContract`, `AuthContract`, `SourceOfTruthDescriptor`), peer-discovery filter helpers, protocol messages. All Zod-validated, well tested.
- **`AccessPolicyDescriptor` already supports** `readableByRoles`, `requiredCapabilities`, `fallbackAllowed`, `denialMode` (`error|empty-result|fallback-if-allowed`); round-trips through node metadata via `gcp.accessPolicy`.
- **Partial / skeletal:** `RoleDefinition.parentRole` is stored but **never inherited** (`hasCapability`/`getEffectiveContextRules` ignore it). `ContextFilter` implements only `exclude` (include/transform are no-ops). `BaseGraphEdge.isValidBetween` always returns `true`.
- **Provenance:** only `MessageProvenance` (`{nodeId, timestamp, action}`) — message-hop, not *who-read-what-when*. `ContextQueryResponse.provenance` exists but is untyped `Record<string,unknown>`.
- **Delegation vocabulary exists, model does not:** `MessageType` includes `action-request`/`action-response`; `SystemCapabilities` includes `MODIFY_GRAPH`/`WRITE_CONTEXT`; but `ContextRule.access` is only `read|write|none` (no execute/delegate verb), and `action-request` carries an unschematized `payload`.
- **Discovery execution is single-graph:** `discoverNodes/Agents/Knowledge` traverse one in-memory `Graph`; **no co-located test** for this BFS/denial logic.
- **Absent:** MCP/A2A types, benchmark/metrics types.

### 2.2 `@graph-context-protocol/server`
- **Complete:** one `context-query` handler with the full flow (validate → authenticate → principal → resolve target node → `authorizeKnowledgeNodeAccess` (default-deny on missing policy; enforces `readableByRoles` + `requiredCapabilities` from node metadata) → `executeTargetedContextQuery` against a single adapter → response). Auth providers: `allowAll` (the **default**), `staticToken`, `capability`. `KnowledgeSourceRegistry`, connection manager, lifecycle, memory cache, sync scheduler, memory transport, external-agent registry, message router, `createFetchHandler`/`queryRemoteContext`.
- **Partial / unused:** HTTP exists **only as a standalone fetch handler/client, not behind the `Transport` interface** (only `memory` transport implemented). `cache` and `sync` are wired as defaults but never invoked by the request path. Router declares `knowledge-source`/`broadcast` route kinds that are **never produced** (placeholder). `ExternalAgentRegistry` is a **directory only** — no code invokes/delegates to a remote agent.
- **Absent:** action/delegation handler, structured read-provenance/audit sink, peer discovery/fan-out, MCP exposure or consumption, A2A bridge or baseline, any metrics/canary/leakage instrumentation.
- **Test gaps:** no specs for `routing/`, `server/` (the orchestrator), `sync/`. `server.ts` is a vestigial stub.

### 2.3 `@graph-context-protocol/adapters`
- **Only one adapter:** `createMarkdownKnowledgeAdapter` (reads one markdown file; advertises `lookup`/`search` but **ignores the query/filters** — no real search). Implements `KnowledgeSourceAdapter` (read/query only; no mutate).
- **Absent:** MCP, A2A, vector/RAG, logs, events, structured-DB adapters.

### 2.4 `@graph-context-protocol/langgraph`
- **Complete:** `createOpenRouterLLM` (default model `openai/gpt-4o-mini`, temp 0.7), `createContextQueryTool` (**read-only**; mode hardcoded `"text"`; tool name `query_peer_context`; requester `principal:peer-agent`, audit-only), `toLangChainTool(s)`, `createLangGraphAgent` (a `createReactAgent` wrapper; uses a `node as graph` type shortcut), `createCollaborationWorkflow` (`StateGraph`, `maxIterations` 10), `toAssistantUiMessage`.
- **Absent:** any delegation/action tool, MCP/A2A integration.

### 2.5 Apps + workspace
- **Two Next.js apps** (`researcher`, `executor`) — mirror clones. Each is both a GCP server node and a client agent. **2 nodes per graph** (1 agent + 1 knowledge), no edges. Access policy = `createAccessPolicyDescriptor([], [], true, "empty-result")` → **public read-all, anonymous credentials** — role-gating machinery exists but is **bypassed** by the demo. One hardcoded `PEER_GCP_URL`; no discovery, no multi-hop, no >2 nodes.
- **Demo proves:** owner-held source of truth + on-demand cross-node read + full ProtocolMessage round-trip + assistant-ui streaming. Nothing else.
- **Config:** Nx 22, pnpm 9 / Node 20, `customConditions: ["@org/source"]` (resolves `@graph-context-protocol/*` to TS source), TS project references, Next `transpilePackages`. Apps have **zero tests**.
- **Minor debt:** stale `core` glob in `pnpm-workspace.yaml`; `@org/source` (tsconfig) vs `@ai-do/source` (nx release) name mismatch; no `engines`/`packageManager`/`.nvmrc`. Secrets are correctly git-ignored (verified — no committed key).
- **Eval/benchmark infra:** ABSENT everywhere; exists only as the design in `context/12-research-and-evaluation.md`.

## 3. Target State

From `context/12-research-and-evaluation.md` and `context/11-direction.md`:

- **Contribution:** Path A (empirical thesis) as spine, Path B (formal model + no-leak property) as support.
- **Thesis:** read-first role-gated context federation beats point-to-point message-passing on coupling, leakage, and cost at equal task success.
- **Four sub-claims → benchmark scenarios:** (1) coupling/scaling → marketplace; (2) leakage → software-org; (3) multi-hop federated read → incident/RAG (optional); (4) cross-owner → B2B supply chain.
- **Engineering commitments driven by the research:** interoperate with MCP and A2A (bridges + A2A baseline), and make role-gated context + provenance first-class.
- **Task delegation:** a gated capability on the same query/response path requiring a stricter capability than read; denial-fallback is one special case.

## 4. Gap Analysis

| Target capability | Status today | Where |
|---|---|---|
| Read-first context query (1 hop) | **PRESENT** | core contract + server handler + langgraph tool + apps |
| `AccessPolicyDescriptor` (roles, caps, fallback, denialMode) | **PRESENT** | core; server enforces it |
| Role-gating actually exercised | **ABSENT** | apps use allow-all/anonymous |
| Role hierarchy (parentRole inheritance) | **PARTIAL** | stored, not resolved |
| Structured who-read-what-when provenance + audit sink | **ABSENT** | only message-hop provenance |
| Task-delegation / action capability distinct from read | **PARTIAL** | message-type vocab only; no model/handler/tool |
| Federated discovery + multi-node query | **PARTIAL** | descriptors/filters present; execution single-graph + 1 hardcoded peer |
| HTTP behind `Transport` interface | **ABSENT** | HTTP is standalone fetch handler/client |
| MCP bridge (expose + consume) | **ABSENT** | — |
| A2A bridge + A2A baseline | **ABSENT** | external-agent registry is directory only |
| Vector/RAG adapter | **ABSENT** | only markdown |
| Metrics instrumentation (connections, messages, tokens, latency, task-success, integration effort, provenance completeness) | **ABSENT** | — |
| Canary-token leakage tooling | **ABSENT** | — |
| >2 nodes / parameterized node factory | **ABSENT** | copy-paste clones |
| Benchmark scenarios (marketplace, software-org, supply-chain) | **ABSENT** | doc-only |
| Formal model + no-leak property tests | **ABSENT** | — |

## 5. Guiding Decisions (locked in brainstorming)

1. Context access is the primary, read-first model; **task delegation is a stricter-capability layer on the same path** (denial-fallback = special case).
2. **Hybrid positioning:** own a clean core, but **bridge to MCP/A2A** rather than replace; A2A message-passing is the evaluation baseline.
3. **Path A spine + Path B support:** falsifiable thesis with evidence, backed by a small formal model and a no-leak property.
4. **Benchmark suite:** marketplace + software-org + supply-chain (incident/RAG optional). Isolate by swapping only the interop layer; hold LLM and task fixed.
5. **Don't rewrite mechanical docs / mechanical code** that the pivot doesn't touch.

## 6. Milestones

Each milestone lists goal, packages touched, key work, acceptance criteria, and whether it is **thesis-critical** (required for the article's core claim) or **supporting**.

### M0 — Foundations & cleanup *(thesis-critical enabler)*
- **Goal:** remove copy-paste and config debt that would otherwise multiply across every scenario.
- **Touches:** apps, root config, core (tests), server (tests).
- **Work:** parameterized node/scenario factory to replace the researcher/executor clones (node id, knowledge id, role, policy, peer targets, temperature as config); spin up N nodes from a manifest. Fix `pnpm-workspace.yaml` stale `core` glob; reconcile `@org/source` vs `@ai-do/source`; add `engines`/`packageManager`/`.nvmrc`. Add missing specs: core `discovery-functions`, server `routing`/`server`/`sync`.
- **Acceptance:** N nodes launch from one manifest; CI green; previously-untested modules covered.

### M1 — Role-gated context + structured provenance *(thesis-critical: Claims 2 & 4)*
- **Goal:** make least-privilege access real and auditable — the substrate for the leakage and cross-owner results.
- **Touches:** core, server, scenario apps.
- **Work:** add a typed read-provenance/audit record (`principalId`, `targetNodeId`, `timestamp`, `decision`, `matchedPolicy`); replace `ContextQueryResponse.provenance: Record<string,unknown>` with that type; add a pluggable audit sink in the server populated per query; resolve `parentRole` inheritance (effective caps/rules); switch scenarios from allow-all/anonymous to authenticated principals (`staticToken`/`capability`) with real role-gated policies.
- **Acceptance:** under-privileged principal is denied and the denial is audited; provenance records who-read-what-when; tests cover allow + deny + audit + role inheritance.

### M2 — Task-delegation gated capability layer *(supporting; realizes decision 1)*
- **Goal:** delegation as a first-class, stricter-capability operation.
- **Touches:** core, server, langgraph.
- **Work:** define an action/delegation contract over the existing `action-request`/`action-response` message types (typed request/result); add an "execute/delegate" verb to the capability model; add a server **action handler** distinct from `context-query`, gated by a stricter capability (e.g. `cap:delegate-task`), default-deny, audited; add a langgraph `delegate_task_to_peer` tool distinct from the read-only `query_peer_context`.
- **Acceptance:** a peer can request an action gated by the stricter capability; a read-only principal cannot delegate; outcome is audited; denial-fallback expressed as a special case.

### M3 — Federated discovery + multi-node transport *(thesis-critical: Claim 1)*
- **Goal:** discover and query across many peers without a global graph — the marketplace scaling result.
- **Touches:** server, core, scenarios.
- **Work:** implement an **HTTP `Transport`** behind the `Transport` interface; a peer registry + discovery built on the existing `ContextPeerDescriptor`/peer-discovery filters; make routing produce real `knowledge-source` routes; extend discovery execution over peer descriptors / multiple graphs.
- **Acceptance:** a node discovers peers from config/registry and queries across them; pairwise-connection and message counts are measurable as N scales 2→50.

### M4 — MCP & A2A bridges *(interop commitment + baseline prerequisite)*
- **Goal:** interoperate with incumbents and build the comparison baseline.
- **Touches:** adapters (and possibly a new `baseline` package).
- **Work:** MCP bridge — expose a GCP knowledge node as an MCP resource/server, and consume a remote MCP resource as a `KnowledgeSourceAdapter`. A2A bridge — wrap an A2A agent as a knowledge/delegation node. **A2A baseline** — a message-passing implementation of the scenario tasks (agents know peers via cards, delegate via messages) used as the experimental control.
- **Acceptance:** a GCP node is readable by an MCP client; an MCP resource is queryable as a GCP knowledge node; the A2A baseline runs the same scenario tasks as GCP.

### M5 — Benchmark harness + metrics + scenarios *(thesis-critical: the evidence engine)*
- **Goal:** produce the article's tables and figures.
- **Touches:** new eval package/app + instrumentation across server and the A2A baseline.
- **Work:** uniform metrics collection (pairwise connections, messages, tokens, latency/round-trips, task-success, integration effort, provenance completeness); canary-token leakage tooling (inject into confidential nodes, detect at under-privileged agents); the three scenarios as runnable, seeded experiments (marketplace, software-org, supply-chain; optional incident/RAG); common rig swapping only the interop layer.
- **Acceptance:** each scenario emits a GCP-vs-A2A metrics table; leakage measured via canaries; runs reproducible from a seed; counts (not just wall-clock) reported.

### M6 — Formal model + no-leak property *(supporting; Path B rigor)*
- **Goal:** give the empirical result formal backing.
- **Touches:** docs + property tests across core/server.
- **Work:** a small formal model of role-gated read-first context federation; executable no-leak property (a principal never reads beyond policy) under randomized policies/principals.
- **Acceptance:** no-leak property holds under randomized inputs; model documented and cross-referenced from the article.

## 7. Critical Path to Evidence

Minimum to support the article's core claim:

```
M0 → M1 → M3 → (A2A baseline subset of M4) → M5
```

`M2` (delegation), the MCP half of `M4`, and `M6` (formal model) strengthen the contribution and the interop story but are not required to test *context-federation vs message-passing*. Sequence them after the critical path unless a reviewer angle (e.g. governance framing) elevates them.

| Sub-claim | Scenario | Depends on |
|---|---|---|
| 1 — coupling/scaling | marketplace | M0, M3, M5 |
| 2 — leakage | software-org | M0, M1, M5 |
| 3 — multi-hop read (optional) | incident/RAG | M0, M3, M5 |
| 4 — cross-owner | supply-chain | M0, M1, M3, M5 |

## 8. Non-Goals

- A production-grade vector/RAG engine (markdown + a thin retriever is enough for scenarios).
- A global registry or global graph (federation stays peer/registry/config-driven).
- Replacing MCP or A2A (we bridge and benchmark against them).
- Mutating a remote node's knowledge (writes remain out of scope; delegation returns action outcomes, not graph writes into peers).
- Rewriting mechanical docs/code untouched by the pivot.

## 9. Risks

- **Baseline fairness.** The A2A baseline must be a credible, good-faith implementation, or the comparison is dismissed. Build it with the same care as the GCP path; document its design.
- **Confounded metrics.** If anything beyond the interop layer differs between arms (LLM, prompts, task), results are uninterpretable. Enforce the swap-only-the-layer rule in the harness.
- **Prior-art proximity.** Solid/LDP + WAC/ACP and SPARQL federation are close; the delta (agent-centric, LLM-query-shaped, role-gated cross-owner) must be stated and measured, not asserted.
- **Scope creep.** Each milestone is a separate plan; resist bundling. The MCP bridge especially can expand without bound — keep it to expose + consume.

## 10. Prior Art

Tracked in `context/12-research-and-evaluation.md` §"Prior Art to Position Against": Solid/LDP + WAC/ACP, SPARQL federated query, RBAC/ABAC + capability security, FIPA-ACL/KQML, MCP, A2A. The article must cite these first and state the delta.

## 11. Open Questions

1. **Baseline home:** does the A2A baseline live in a new `packages/baseline` (or `apps/`) or alongside the eval harness? (Affects M4/M5 boundary.)
2. **Metrics transport:** in-process counters vs an OpenTelemetry-style exporter? (Simpler is fine for a paper; decide in M5.)
3. **Scenario LLM:** keep OpenRouter free-tier models, or pin a deterministic/local model for reproducibility of token counts?
4. **Delegation depth (M2):** is delegation in-scope for the article at all, or purely an engineering capability shipped after the paper?
5. **Formal model venue fit (M6):** how heavy a formalism do the target venues expect — a property-test-backed model, or a full proof?

## 12. Milestone Specs (sliced)

Each milestone has its own detailed design spec. This document is the index/roadmap; the slices carry the file-level scope, design, acceptance, and test plan.

| Milestone | Spec | Thesis-critical | Depends on |
|---|---|---|---|
| M0 — Foundations & cleanup | `2026-06-04-m0-foundations-cleanup-design.md` | enabler | — |
| M1 — Role-gating + provenance | `2026-06-04-m1-role-gating-provenance-design.md` | YES (Claims 2,4) | M0 |
| M2 — Task-delegation layer | `2026-06-04-m2-task-delegation-design.md` | no | M1 |
| M3 — Federated discovery + multi-node | `2026-06-04-m3-federated-discovery-multinode-design.md` | YES (Claim 1) | M0 |
| M4 — MCP/A2A bridges + baseline | `2026-06-04-m4-mcp-a2a-bridges-baseline-design.md` | M4b YES / M4a no | M3 |
| M5 — Benchmark harness + metrics | `2026-06-04-m5-benchmark-harness-metrics-design.md` | YES (evidence) | M0,M1,M3,M4b |
| M6 — Formal model + no-leak | `2026-06-04-m6-formal-model-no-leak-design.md` | no | M1 |

## 13. Next Step

On approval, take the **critical path** (`M0 → M1 → M3 → M4b → M5`) one milestone at a time through `writing-plans`, starting with **M0**. Each milestone spec above becomes a detailed implementation plan when its turn comes.
