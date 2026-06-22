# M4a — MCP Bridge (consume + expose) — Design Spec

> Interoperate with MCP as a first-class bridge, not a replacement. A GCP graph
> can **federate over** a remote MCP server (consume), and an MCP client can
> **read** a GCP knowledge node (expose) — with the GCP read gate still
> enforced on the expose path. A measured interop arm proves the governance
> claim: **exposing context over MCP preserves role-gating; a vanilla MCP
> server does not.**

- **Date:** 2026-06-21
- **Status:** Draft for review
- **Refines:** the **M4a** portion of `2026-06-04-m4-mcp-a2a-bridges-baseline-design.md` (M4b / A2A baseline already built and merged; this is the remaining MCP sibling).
- **Roadmap position:** interop/positioning sibling. NOT on the empirical critical path of the thesis, but the eval arm here yields a *governance-survives-the-bridge* result that supports the "bridge, don't replace" claim.
- **Depends on:** `server` (proven read gate `authorizeKnowledgeNodeAccess`, `createFetchHandler`/`server.receive`, `KnowledgeSourceAdapter` seam), `core` (`createKnowledgeNode`, context-query factories), `agent-core` (`PeerContextToolFactory`, `CouplingMetrics`, `ScenarioDef`), `eval` (arm runner, results table).
- **Source of truth for direction:** `2026-06-04-gcp-research-migration-design.md` (thesis spine), `2026-06-04-m4-mcp-a2a-bridges-baseline-design.md`.

---

## 1. Goal

Three deliverables:

1. **Consume** — a `KnowledgeSourceAdapter` backed by a remote MCP resource, so
   a GCP graph federates over MCP servers transparently (mirrors
   `createMarkdownKnowledgeAdapter`).
2. **Expose** — an MCP server whose resource reads route through the **proven
   GCP read gate**, so an existing MCP client reads permitted GCP context and is
   **denied** unpermitted context — without re-implementing authorization.
3. **Eval interop arm** — a scenario + two MCP arms measuring the governance
   claim: GCP-over-MCP **contains** an under-privileged read (canary denied); a
   vanilla MCP server exposing the same node **leaks** it.

Plus a **formal expose-gate property** (fast-check): the MCP expose path denies
exactly when the GCP read gate denies — extending the M6 no-leak coverage to
the new surface.

## 2. Locked decisions (from brainstorming)

1. **Scope:** both directions — consume **and** expose.
2. **Protocol layer:** real official **`@modelcontextprotocol/sdk`** (1.x
   stable), pinned. Maximum external credibility; symmetric with M4b's real
   `@a2a-js/sdk`. Used for transport/protocol only — the gate stays GCP's.
3. **Home:** new **`packages/mcp-bridge`** (`@graph-context-protocol/mcp-bridge`),
   isolating the MCP SDK dependency to one package — mirrors how
   `packages/baseline` isolates `@a2a-js/sdk`.
4. **Enforcement:** the expose path **reuses `server.receive`** end-to-end
   (translate MCP read → context-query `ProtocolMessage` → dispatch → the same
   `authorizeKnowledgeNodeAccess` M6 proved). No direct gate calls, no
   re-implemented auth — the same composition trick M2 delegation used.
5. **Verification depth:** round-trip + policy tests **+ interop eval arm** **+
   formal expose-gate property**.
6. **Additive only:** `core` and `server` contracts unchanged; no
   `ContractVersion` bump.

## 3. Architecture

### 3.1 Package & dependency graph

```
core ◄── server ◄── mcp-bridge ──► @modelcontextprotocol/sdk (pinned 1.x)
                        ▲
                   agent-core            (for the eval arm's MCP tool factory)
                        ▲
                      eval               (adds the gcp-mcp / raw-mcp arms)
```

- `mcp-bridge` depends on `core`, `server`, `agent-core`, and the MCP SDK.
- `core`/`server` gain **no** dependency on the MCP SDK and are untouched.
- New Nx + Vitest project wired like the other packages
  (`@graph-context-protocol/mcp-bridge`), 4-space Biome, TS 5.9 strict ESM,
  `@ai-do/source` customCondition, project references.

### 3.2 MCP SDK surface used (pinned)

Stable `@modelcontextprotocol/sdk` (1.x). Subpath imports:

- `@modelcontextprotocol/sdk/server/mcp.js` → `McpServer`
  (`.registerResource(name, uri, config, readCb)`, `.connect(transport)`).
- `@modelcontextprotocol/sdk/client/index.js` → `Client`
  (`.connect(transport)`, `.readResource({ uri })`, `.listResources()`).
- `@modelcontextprotocol/sdk/inMemory.js` →
  `InMemoryTransport.createLinkedPair()` for hermetic in-process tests (no
  network, no ports).

The exact patch version is pinned in the plan. All bridge code is confined to
this package so SDK drift is isolated behind two adapters.

## 4. Consume path — `createMcpKnowledgeAdapter`

A `KnowledgeSourceAdapter` (the same seam `createMarkdownKnowledgeAdapter`
implements; the registry resolves adapters by `targetNodeId`, so the adapter
`id` MUST equal the backed GCP node id).

```ts
export interface McpKnowledgeAdapterConfig {
  /** Adapter id — MUST equal the backed GCP knowledge node id. */
  readonly id: string;
  /** MCP server transport/endpoint to connect a Client to. */
  readonly transport: McpTransportConfig;   // url for StreamableHTTP, or an injected transport for tests
  /** MCP resource URI to read (e.g. "config://app"). */
  readonly resourceUri: string;
  /** Role assigned to the produced knowledge node. */
  readonly role?: RoleDefinition;
  /** Optional auth forwarded to the MCP server. */
  readonly credentials?: Credentials;
}

export function createMcpKnowledgeAdapter(
  config: McpKnowledgeAdapterConfig,
): KnowledgeSourceAdapter;
```

`query()`:
1. connect a real MCP `Client` to `config.transport`,
2. `client.readResource({ uri: config.resourceUri })`,
3. concatenate the returned `contents[].text` into a node body,
4. wrap via `createKnowledgeNode(config.id, role, { contentType, content })`,
5. return `succeed({ sourceId, nodes: [node], raw, metadata })`.

Fail-soft (mirrors markdown adapter): connect/read failure → `fail(createServerError("knowledge-error", …))` (a valid `ServerErrorCode`; the earlier draft said `"unavailable"`, which is not a member of the union). Capabilities: `["lookup"]` (plus `"search"` only if the MCP server advertises it; YAGNI default `["lookup"]`).

A GCP graph that registers this adapter now federates over an MCP server with
zero changes to the read path — the bridge is transparent to GCP consumers.

## 5. Expose path — `createGcpMcpServer`

A real MCP `McpServer` that surfaces one (or more) GCP knowledge node as an MCP
resource. **Reads route through the proven GCP read gate** — the expose handler
builds a GCP context-query and dispatches it via `server.receive`, never calling
the gate directly.

```ts
export interface GcpMcpServerConfig {
  /** A started GraphContextServer whose nodes are exposed. */
  readonly server: GraphContextServer;
  /** GCP node ids to expose, mapped to MCP resource URIs. */
  readonly resources: ReadonlyArray<{ nodeId: NodeId; uri: string; name: string }>;
  /** Server identity for the MCP AgentCard-equivalent. */
  readonly info?: { name?: string; version?: string };
}

export function createGcpMcpServer(config: GcpMcpServerConfig): McpServer;
```

Resource read callback for each configured node:
1. extract caller credentials from the MCP request (mapped to
   `gcp.credentials`),
2. build a context-query `ProtocolMessage` targeting `nodeId` with those
   credentials (core context-query factories),
3. `await server.receive(envelope)` — runs the context-query-handler →
   `authorizeKnowledgeNodeAccess` (kind → policy parse → role → capability →
   provider),
4. **authorized** → return `{ contents: [{ uri, text: <node content> }] }`,
5. **denied** → return an MCP error result (or empty `contents`) with **no node
   content** — the canary never crosses the bridge.

The expose path therefore inherits the M6 no-leak proof by construction: it is a
thin MCP-shaped caller of the exact `server.receive` path the proof covers.

**Credential mapping** (boundary detail, pinned in plan): MCP requests carry
auth via the SDK's transport/request metadata; the expose server reads it and
places it under `gcp.credentials` envelope metadata, exactly as
`extractCredentials` expects. Anonymous when absent → anonymous GCP principal →
gated like any anonymous read.

## 6. Eval interop arm

Surfaces the governance claim as a measured, hermetic result. Reuses the
leakage structure (under-privileged agent + canary), adds two MCP arms.

### 6.1 Scenario (`agent-core`)

New `ScenarioId "mcp-interop"` (additive to the existing union, like M2 added
`"delegation"`). One knowledge node holds a CANARY; `readableByRoles` excludes
the agent's role so the gate is what blocks. Agent tasked to read the node's
content. `succeeded` = answer includes the canary (i.e. the read got through);
`forbiddenCanaries` = `[CANARY]` (so the leakage seam flags any arm that
surfaces it). Mode tag distinguishes it for the runner.

### 6.2 Arms (`eval` runner)

Both arms use a new **MCP `PeerContextToolFactory`** (an `agent-core`
`PeerContextToolFactory`: a LangChain `StructuredTool` whose `invoke` drives a
real MCP `Client.readResource`, recording `CouplingMetrics`):

- **`gcp-mcp`** — tool → MCP `Client` → `createGcpMcpServer` (expose path) →
  GCP gate **denies** the under-privileged read → no canary reaches the agent.
  *Contained.*
- **`raw-mcp`** — tool → MCP `Client` → a vanilla `McpServer` that returns the
  node content with **no gate** → canary reaches the agent. *Leaks.* (This is
  the MCP analogue of the A2A baseline's coarse, ungated exposure.)

In-process `InMemoryTransport.createLinkedPair()` wires client↔server in tests;
the mock model emits one MCP read tool call (hermetic, no LLM in CI).

### 6.3 Metric

Reuse the existing leakage canary seam (canary present at the agent = leak),
plus a small additive `interop` metric:

```ts
export interface InteropMetrics {
  readonly mcpReadsServed: number;   // resource reads dispatched
  readonly deniedOverMcp: number;    // reads the GCP gate denied
  readonly leakedOverMcp: number;    // reads where a forbidden canary surfaced
}
```

- `gcp-mcp` arm ⇒ `deniedOverMcp ≥ 1`, `leakedOverMcp == 0`.
- `raw-mcp` arm ⇒ `leakedOverMcp ≥ 1`.

Added to `MetricsResult`; `renderTable` emits `mcpReadsServed`,
`deniedOverMcp`, `leakedOverMcp` rows when `mcpReadsServed > 0` (mirrors the
delegation-metric rendering).

### 6.4 Containment proof (hermetic, no LLM)

A both-arms spec mirroring `delegation-containment.spec.ts`: `gcp-mcp` →
denied + no canary; `raw-mcp` → canary surfaces. Deterministic; runs in CI.

## 7. Formal expose-gate property

A fast-check property over the MCP expose path lives in
**`packages/mcp-bridge/src/lib/formal/`** — NOT in `packages/server`, because it
drives `createGcpMcpServer` (which depends on `server`); putting it in `server`
would invert the dependency direction (`server → mcp-bridge` cycle). It reuses
the policy/principal generators from `server`'s `arbitraries.ts`; since test
files are not package exports, the minimal generators are either re-exported
from `server` for reuse or duplicated thinly in `mcp-bridge` (decided in the
plan — re-export preferred to keep one source of truth):

- **P5 (MCP expose soundness):** for a random `(policy, principal)`, the
  `createGcpMcpServer` resource read returns node content **iff**
  `authorized(policy, principal)` — i.e. the bridge denies exactly when the read
  gate denies. Driven through a real in-memory `Client`/`McpServer` pair so it
  exercises the true SDK path, not a mock.
- **MCP no-leak:** an under-authorized draw never yields the canary in the MCP
  `contents`; an authorized draw does (liveness), mirroring
  `delegation-no-leak.property.spec.ts`.

This makes the no-leak guarantee hold across **all three** read surfaces:
native context-query, M2 delegation, and now M4a MCP expose.

## 8. Data flow

**Consume (GCP federates over MCP):**
```
GCP context-query for node N
  → KnowledgeSourceRegistry resolves adapter id==N
  → createMcpKnowledgeAdapter.query()
     → MCP Client.readResource({uri}) over MCP transport
  → wraps resource text as KnowledgeNode → returned to the GCP read path
```

**Expose (MCP reads a GCP node, gated):**
```
MCP Client.readResource({uri})
  → createGcpMcpServer resource cb
     → build context-query ProtocolMessage (+ gcp.credentials)
     → server.receive → context-query-handler → authorizeKnowledgeNodeAccess
        → authorized: contents:[{uri,text:content}]
        → denied:    MCP error / empty contents (NO content)
```

## 9. Error handling

- Consume: MCP connect/read failure → fail-soft `ServerError`
  (`knowledge-error`); never throws into the GCP read path.
- Expose: GCP denial → MCP error result (no content), not an exception; GCP
  internal error → MCP error surfaced with code, no content.
- All transports closed in test teardown; in-memory pairs need no cleanup
  beyond GC.

## 10. Testing (all deterministic / CI-safe, no key, no real LLM)

- **consume:** real `Client` ↔ `createMcpKnowledgeAdapter` ↔ in-process mock
  `McpServer` (linked pair) → node content surfaces; server-down → fail-soft
  `ServerError`.
- **expose:** real `Client` reads via `createGcpMcpServer`; authorized role →
  content; **under-privileged role → denied, no content** (policy survives the
  bridge); anonymous → gated.
- **formal:** P5 expose-soundness + MCP no-leak property (§7), in
  `packages/mcp-bridge/src/lib/formal/`.
- **eval:** the both-arms containment spec (§6.4); `InteropMetrics` unit tests;
  `scenarios.spec` updated for `mcp-interop`.
- **regression:** `core`/`server` untouched; `nx run-many -t test typecheck`
  green (modulo the known non-deterministic `peers.spec.ts` ordering flake,
  pre-existing and unrelated).

## 11. Work breakdown (sketch for the plan)

1. `packages/mcp-bridge` scaffold + pinned `@modelcontextprotocol/sdk` dep + Nx/Vitest wiring.
2. `createMcpKnowledgeAdapter` (consume) + tests (linked-pair round-trip, fail-soft).
3. `createGcpMcpServer` (expose) routing through `server.receive` + tests (authorized/denied/anonymous).
4. Formal P5 expose-soundness + MCP no-leak properties (`packages/mcp-bridge/src/lib/formal`; re-export server's arbitraries).
5. `agent-core` `mcp-interop` scenario def + MCP `PeerContextToolFactory`.
6. `eval` `gcp-mcp` + `raw-mcp` arms, `InteropMetrics`, results-table rows, run-eval wiring.
7. Containment both-arms spec + metric unit tests + `scenarios.spec` update.
8. Full `nx run-many -t test typecheck` green.

## 12. Acceptance criteria

1. `packages/mcp-bridge` exists, isolates the pinned MCP SDK; `core`/`server`
   unchanged (no `ContractVersion` bump).
2. `createMcpKnowledgeAdapter` lets a GCP graph read a remote MCP resource as a
   knowledge node (round-trip test green; fail-soft on error).
3. `createGcpMcpServer` serves a GCP node to a real MCP `Client`, returning
   content when authorized and **no content** when denied — enforcement via
   `server.receive`, not a re-implemented gate.
4. Formal P5 + MCP no-leak properties pass: the MCP expose path denies exactly
   when the read gate denies; no canary leaks via MCP.
5. The `mcp-interop` eval arm shows `gcp-mcp` contained (denied, no canary) and
   `raw-mcp` leaking (canary surfaces), proven by a hermetic both-arms test;
   `InteropMetrics` rendered in the results table.
6. Deterministic substrate/eval tests pass in CI without a key; no real LLM
   needed for any M4a test.
7. Additive only; existing tests green.

## 13. Global constraints

- Nx 22 / pnpm 9 / Node 20; TS 5.9 strict ESM, project references,
  `@ai-do/source` customCondition; Zod 4; Vitest 4; Biome 2 (4-space indent).
  New package mirrors existing package config; scoped name
  `@graph-context-protocol/mcp-bridge`.
- **Security:** no secrets; `SECRET-CANARY-*` / runbook strings are test
  fixtures; demo tokens `tok:*` are not secrets. MCP servers bind in-process
  (linked pair) or localhost ephemeral in tests; no external exposure. Commit
  only intended source (no build artifacts, `.next/`, `*.tsbuildinfo`,
  `next-env.d.ts`, `.claude/`, `dist/`, `results/`). No OpenRouter key needed;
  no key in CI.
- `@modelcontextprotocol/sdk` version pinned in `packages/mcp-bridge`.

## 14. Risks

- **MCP SDK coupling / drift.** Confine all SDK usage to `mcp-bridge` behind the
  two adapters; pin the version.
- **Expose-path bypass.** Mitigated structurally: reads go through
  `server.receive` (the proven path), enforced by the formal P5 property — no
  direct gate calls allowed in the expose handler.
- **Credential mapping mismatch.** MCP→GCP credential translation is the one
  novel boundary; covered by the authorized/denied/anonymous expose tests and
  the formal property.
- **Scope creep in MCP coverage.** Resources-read only; tools/prompts/sampling
  out of scope (YAGNI). Document the deliberate surface.

## 15. Out of scope

- MCP tools, prompts, sampling, subscriptions — only resource reads.
- Exposing GCP **delegation** (M2) over MCP — possible future sibling; not here.
- A2A↔MCP cross-bridging.
- Real-LLM eval runs for M4a (the interop result is proven hermetically; the
  M5 real-LLM sweep is a separate concern).

## 16. Next step

On approval, this spec becomes a detailed implementation plan via
`writing-plans`, executed task-by-task with TDD (the M2/M4b precedent).

## Links
- Parent roadmap: `2026-06-04-gcp-research-migration-design.md`
- M4 slice: `2026-06-04-m4-mcp-a2a-bridges-baseline-design.md`
- Sibling (built): `2026-06-18-m4b-a2a-baseline-design.md`
- M2 (built, the composition precedent): `2026-06-04-m2-task-delegation-design.md`
- M6 (built, the no-leak proof this extends): `2026-06-20-m6-formal-no-leak-implementation-design.md`
