# M3 — Federated Discovery + Multi-Node Transport — Design Spec

> Discover and query across many independently-owned peers without a global graph. This produces the coupling/scaling result (Claim 1, marketplace) and is a prerequisite for the cross-owner scenario (Claim 4).

- **Date:** 2026-06-04
- **Status:** Draft for review
- **Parent:** `2026-06-04-gcp-research-migration-design.md` (milestone M3)
- **Thesis-critical:** YES (Claim 1; enables Claim 4)
- **Depends on:** M0 (multi-node factory). Benefits from M1 (policies per node).

## 1. Goal

A node, knowing one or more peers from config/registry, discovers which peers expose knowledge it can query and runs queries across them — with no central graph. Pairwise-connection and message counts are measurable as the node count scales 2→50.

## 2. Current State (relevant slice)

- **Descriptors + filters present:** `ContextPeerDescriptor`, `ExposedKnowledgeDescriptor`, and the `peer-discovery.ts` filter helpers (`discoverPeerContextSources`, `filterPeers*`, `filterExposedKnowledge*`) operate over arrays of descriptors **without a global graph**.
- **Execution is single-graph:** `discoverNodes/Agents/Knowledge` (`packages/core/src/lib/discovery/discovery-functions.ts`) traverse exactly one in-memory `Graph`. `ContextQueryRequest` targets a single `targetNodeId` with no peer/endpoint resolution.
- **Transport gap:** HTTP exists **only** as the standalone `createFetchHandler`/`queryRemoteContext` pair, **not behind the `Transport` interface** (only `createMemoryTransport` implements `Transport`). Server `send()` only delivers over a transport for `external-agent` routes.
- **Routing gap:** `MessageRouter` declares `knowledge-source`/`broadcast` route kinds that are **never produced** (placeholder).
- Apps use a **single hardcoded `PEER_GCP_URL`**; no registry, no discovery, no fan-out.

## 3. Scope

**In:**
- **server:** an **HTTP `Transport`** implementing the `Transport` interface (wrapping the existing fetch client/handler) so peer messaging flows through the same abstraction as memory transport. A `PeerRegistry` holding `ContextPeerDescriptor`s, populated from config/known-peers. Discovery that resolves *which peer owns / can answer* a query.
- **core:** federated discovery **execution** over peer descriptors (extend `discovery-functions` or add a peer-discovery execution layer that uses the existing filters + transport to query peers).
- **routing:** produce real `knowledge-source` routes (retire the placeholder).
- **scenarios:** peers loaded from a registry/config (M0 manifest extended with `peers[]`); a node queries across discovered peers.

**Out:**
- A global index/registry, gossip, or DHT. Discovery stays config/registry/known-peer-driven (per `context/11-direction.md`).
- Multi-hop transitive forwarding beyond what the marketplace scenario needs (revisit if Claim 3 incident scenario is built).

## 4. Design

- `HttpTransport` adapts `Transport.send` to a POST via the fetch client and routes inbound to `server.receive`; this lets `server.send` deliver to peers uniformly.
- `PeerRegistry` is in-memory + immutable (mirrors `ExternalAgentRegistry` style), seeded from the manifest.
- Federated query: resolve target → if local node, handle locally; else look up the owning peer's descriptor + endpoint, send a `context-query` over `HttpTransport`, return the response. Discovery uses `peer-discovery` filters to pick candidate peers/knowledge.
- **Coupling metric instrumentation hook:** expose counts (peers known, connections opened, messages sent) for the M5 harness to read — define the seam here even though M5 consumes it.

## 5. Work Breakdown

1. server: `HttpTransport` behind `Transport`; route peer sends through it.
2. server: `PeerRegistry` + manifest-seeded population.
3. core/server: federated query resolution (local vs peer) using peer-discovery filters.
4. routing: emit `knowledge-source` routes.
5. scenarios: manifest `peers[]`; node fans out to discovered peers.

## 6. Acceptance Criteria

- A node discovers peers from the registry and queries across them (≥3 nodes) with no global graph.
- Connection and message counts are observable per run and scale measurably as N grows 2→50.
- Existing 2-node demo still works (now via registry + HttpTransport).

## 7. Test Plan

- Local-vs-peer resolution; peer-discovery filter selection; HttpTransport round-trip (use memory transport as fake in unit tests); routing produces `knowledge-source` route; a 5-node fan-out integration test.

## 8. Risks

- **Scaling harness:** running 50 real HTTP nodes is heavy. Consider in-process `HttpTransport` fakes (memory transport with descriptor metadata) for the scaling curve, and a smaller real-HTTP set to validate parity.
- Connection-count semantics must be defined precisely (a "connection" = a peer a node had to know/contact) so the coupling curve is meaningful.

## 9. Open Questions

- In-process simulated transport vs real HTTP for the 2→50 scaling sweep? (Affects M5 fidelity vs runtime.)

## Links
- Parent roadmap: `2026-06-04-gcp-research-migration-design.md`
- Prev: M2 · Next: M4 `2026-06-04-m4-mcp-a2a-bridges-baseline-design.md`
