# Graph Context Protocol Direction

> Strategic handoff for evolving Graph Context Protocol into a federated, role-gated context access protocol for AI Native Apps, autonomous agents, humans, and other graph-owning entities.

## Overview

Graph Context Protocol (GCP) should not be centered on direct agent-to-agent chat. Direct messaging can remain as an optional capability, but the primary purpose of GCP is **role-gated context access across independently owned graphs**. An AI Native App, autonomous agent, human-facing app, company system, or any other participant can own a local graph or subgraph. Other participants do not inherently talk to that owner; they request access to context exposed by nodes in that graph.

The protocol direction is: **entities expose typed knowledge/context nodes, enforce their own authentication and authorization locally, and allow external principals to query permitted context without copying the source of truth**. Context may represent RAG indexes, logs, events, decisions, issues, user stories, documents, metrics, or any other readable knowledge. For now, treat those as typed `knowledge` nodes. RAG internals can be designed later.

## Product Mental Model

Think of each graph participant as a semi-autonomous living entity in an agentic ecosystem. It owns memory, context, logs, decisions, tools, and policies. It decides what others can read. A product manager agent might own a graph containing user stories, issue history, roadmap decisions, and meeting summaries. A CEO principal may be allowed to read everything. A developer principal may read issues and technical decisions but not confidential strategy. A new employee agent may gain context across the company by traversing allowed graph relationships and querying allowed knowledge nodes.

This does not require a single global graph. There may be many local graphs, peer graphs, discovery graphs, registries, or manually bootstrapped connections. GCP should work when a participant knows one nearby peer and discovers more context from there. A global registry can exist, but it is not core to the protocol.

## Non-Goals

GCP should not become only an agent messaging protocol. It may support messages, but messages are transport/runtime mechanics, not the main product promise. GCP also should not prescribe one organization model, one company model, one identity provider, one vector database, one registry, or one RAG implementation. Those belong to applications or adapters.

For the current direction, GCP should be **read-first**. External participants query permitted context. Writing into another entity's graph is out of scope unless explicitly designed later.

## Core Principles

1. **Local ownership is absolute**: every app, agent, or entity owns its local graph, auth, policy, and source of truth.
2. **Context access beats direct conversation**: the preferred flow is reading authorized context, not asking another agent to explain itself.
3. **Roles and auth guard every boundary**: the owner decides whether a caller can discover or query each context node.
4. **Knowledge remains local**: external callers receive query results, not ownership of the remote knowledge base.
5. **Federation is optional and pluggable**: discovery may use a registry, a known peer, a discovery graph, or app-specific logic.
6. **All readable things can be graph nodes**: RAG, logs, events, decisions, issues, docs, metrics, and summaries can be modeled as `knowledge` nodes.
7. **Provenance is available, not mandatory UX**: metadata can track source, timestamp, policy, and path, but consumers decide whether to show or use it.
8. **Cached context is caller-owned after receipt**: if access is later revoked, future queries fail, but previously cached context is not automatically erased by the protocol.

## Key Terms

| Term | Meaning |
| --- | --- |
| **Entity** | Any graph-owning participant: app, agent, human-facing service, organization system, local context server, or autonomous runtime. |
| **Local graph** | The graph owned and enforced by one entity. |
| **Subgraph** | A bounded graph region owned by an entity or exposed as a unit. This may be explicit later; current `Graph` can act as one local subgraph. |
| **Principal** | Authenticated caller identity produced by the local app's auth adapter. Can represent human, app, agent, service, or delegated actor. |
| **Role** | Permission model attached to a principal or node, such as `role:ceo`, `role:developer`, or `role:agent`. |
| **Capability** | Explicit operation grant such as discover knowledge, read context, query remote context, or receive direct fallback. |
| **Knowledge node** | Readable context source. For now this can represent RAG, logs, events, issues, decisions, documents, metrics, or plain text. |
| **Context query** | Read operation against a knowledge node or graph-exposed context source. |
| **Source of truth** | The owner-side knowledge source. Querying it does not transfer ownership. |
| **Discovery graph** | Optional graph or registry used to find peers. It is not required to be global. |

## Target Flow: Remote Context Query

Primary flow when `agent:node-a` wants to know what `agent:node-b` did today:

```text
agent:node-a
    asks: "what did agent-b do today?"
        ↓
local graph/discovery finds agent-b or its exposed knowledge node
        ↓
node-a requests access to node-b's events/logs/issues knowledge node
        ↓
node-b authenticates caller using its own app-defined auth
        ↓
node-b maps caller to principal + role/capabilities
        ↓
node-b checks local graph policy on target knowledge node
        ↓
if allowed: execute remote query against node-b's local knowledge/RAG/text
        ↓
return filtered answer/results + optional provenance metadata
```

Fallback flow only happens when context is unavailable or blocked by policy:

```text
query knowledge node
    ↓
if allowed → return context result
if denied but direct fallback allowed → ask agent-b directly
if denied and no fallback → return authorization error
```

The fallback preserves the useful multi-agent feature, but it is not the first-class model. First-class model is **query readable context exposed by graph nodes**.

## Authorization Direction

Each graph owner enforces access locally. A caller does not bring universal permission. The caller presents credentials through whatever auth mechanism the host app chooses: token, OAuth, JWT, API key, mTLS, signed request, session, or a custom agent trust mechanism. The app turns that into a GCP principal and role.

Access decisions should be local and node-centered. Example: a `knowledge:issues-today` node grants read access to `role:ceo` and `role:developer`; `knowledge:strategy-decisions` grants read access to `role:ceo` only. This means the target node's owner grants access. The requesting principal's role matters only after the owner accepts and maps it.

Recommended authorization sequence:

```text
incoming request
    ↓
authenticate with host app adapter
    ↓
resolve Principal
    ↓
map Principal to RoleDefinition and capabilities
    ↓
resolve target knowledge/context node
    ↓
check node role/context rules + owner policy
    ↓
authorize query or return denied
```

Important: the library should provide interfaces and defaults, not force one auth scheme. Every app or autonomous agent that installs the SDK should be able to define how identity is validated and how principals map to roles.

## Knowledge Direction

For now, every readable context source can remain a `knowledge` node. Do not overdesign RAG yet. A node can represent a small text blob, a log stream, an event collection, an issue database, a vector index, or a remote retrieval endpoint. The protocol should care that it is queryable context with metadata and access policy; the storage engine can come later.

Suggested future knowledge kinds:

| Kind | Example |
| --- | --- |
| `knowledge:rag` | Vector-backed product docs or issue memory. |
| `knowledge:logs` | Operational logs or agent execution history. |
| `knowledge:events` | Timeline of actions, deployments, decisions, comments. |
| `knowledge:decisions` | Architecture decisions, product decisions, approvals. |
| `knowledge:issues` | Tickets, user stories, bugs, tasks. |
| `knowledge:documents` | Markdown, PDFs, specs, contracts. |
| `knowledge:metrics` | Aggregated operational or product metrics. |

Do not make this taxonomy rigid too early. Existing `KnowledgeNode` plus metadata is enough for current direction. Later, typed schemas can be added when query semantics become clearer.

## Discovery Direction

Discovery is federated, not global. GCP should support discovery through nearby peers, bootstrapped URLs, registries, local config, service discovery, or a graph dedicated to discovery. The protocol should not require a global index of all agents, apps, companies, or contexts.

Discovery should answer questions like:

- Which peers do I know?
- Which peers expose knowledge nodes?
- Which knowledge nodes are visible to my current principal?
- Which context sources can answer this query?
- Which node owns the source of truth?

Discovery may be implemented by humans in different ways. The core protocol should define descriptors and query contracts, but not assume one registry backend.

## Contract Direction

There should be a strongly typed contract between graph participants. This contract does not need to be organization-specific. It should be a general peer/context contract that says what the remote entity exposes, how callers authenticate, which knowledge nodes are queryable, what query shapes are accepted, and what denial/success responses look like.

Contracts should be public protocol objects, not internal implementation details. They should be versioned, serializable, and safe to expose before authorization. They must advertise capabilities and query surfaces without leaking private context contents.

Minimum future contract shape:

```typescript
type ContractVersion = "gcp-context-contract/v1";
type PeerId = string;
type GraphId = string;
type NodeId = string;
type RoleId = string;
type CapabilityId = string;

type AuthScheme =
    | "none"
    | "api-key"
    | "bearer-token"
    | "oauth2"
    | "jwt"
    | "signed-request"
    | "mtls"
    | "custom";

type KnowledgeType =
    | "rag"
    | "logs"
    | "events"
    | "decisions"
    | "issues"
    | "documents"
    | "metrics"
    | "text"
    | "custom";

type QueryMode = "text" | "semantic" | "structured" | "hybrid";

interface ContextPeerDescriptor {
    readonly version: ContractVersion;
    readonly id: string;
    readonly peerId: PeerId;
    readonly endpoint: string;
    readonly graphId?: string;
    readonly displayName?: string;
    readonly auth: AuthContract;
    readonly exposedKnowledge: readonly ExposedKnowledgeDescriptor[];
    readonly capabilities: readonly string[];
    readonly queryEndpoint?: string;
    readonly metadata: Record<string, unknown>;
}

interface AuthContract {
    readonly schemes: readonly AuthScheme[];
    readonly required: boolean;
    readonly acceptedRoles?: readonly RoleId[];
    readonly requiredCapabilities?: readonly CapabilityId[];
    readonly metadata: Record<string, unknown>;
}

interface ExposedKnowledgeDescriptor {
    readonly nodeId: string;
    readonly kind: "knowledge";
    readonly knowledgeType: KnowledgeType;
    readonly queryable: boolean;
    readonly queryContract: KnowledgeQueryContract;
    readonly access: AccessPolicyDescriptor;
    readonly tags: readonly string[];
    readonly contentTypes: readonly string[];
    readonly metadata: Record<string, unknown>;
}

interface KnowledgeQueryContract {
    readonly modes: readonly QueryMode[];
    readonly inputSchema?: Record<string, unknown>;
    readonly outputSchema?: Record<string, unknown>;
    readonly maxQueryLength?: number;
    readonly supportsFilters: boolean;
    readonly supportedFilters: readonly string[];
    readonly timeoutMs?: number;
}

interface AccessPolicyDescriptor {
    readonly readableByRoles: readonly RoleId[];
    readonly requiredCapabilities: readonly CapabilityId[];
    readonly fallbackAllowed: boolean;
    readonly denialMode: "error" | "empty-result" | "fallback-if-allowed";
    readonly metadata: Record<string, unknown>;
}

interface ContextQueryRequest {
    readonly contractVersion: ContractVersion;
    readonly queryId: string;
    readonly requester: RequesterDescriptor;
    readonly targetNodeId: NodeId;
    readonly mode: QueryMode;
    readonly query: string | Record<string, unknown>;
    readonly filters?: Record<string, unknown>;
    readonly metadata: Record<string, unknown>;
}

interface RequesterDescriptor {
    readonly principalId: string;
    readonly roles: readonly RoleId[];
    readonly capabilities: readonly CapabilityId[];
    readonly metadata: Record<string, unknown>;
}

type ContextQueryStatus = "ok" | "denied" | "not-found" | "invalid-query" | "unavailable" | "error";

interface ContextQueryResponse {
    readonly contractVersion: ContractVersion;
    readonly queryId: string;
    readonly status: ContextQueryStatus;
    readonly sourceNodeId: NodeId;
    readonly result?: unknown;
    readonly error?: string;
    readonly provenance?: Record<string, unknown>;
    readonly metadata: Record<string, unknown>;
}
```

These descriptors separate **discovery-time metadata** from **query-time data**. A peer descriptor can reveal that `knowledge:events` exists, supports `text` and `structured` query modes, and requires `role:developer` or `role:ceo`, but it must not reveal event contents until `ContextQueryRequest` passes local auth and node policy checks.

## Role Examples

Example role mapping in a product organization use case:

| Role | Can read |
| --- | --- |
| `role:ceo` | Issues, decisions, logs, roadmap context, summaries, public and private business context. |
| `role:developer` | Issues, technical decisions, implementation logs, user stories, relevant product specs. |
| `role:pm` | Issues, user stories, roadmap decisions, customer feedback, product metrics. |
| `role:new-employee` | Onboarding context, public docs, team-visible issues, approved summaries. |
| `role:external-agent` | Only explicitly exposed context nodes. |

These roles are examples, not built-ins. GCP should support them through role/capability/context-rule primitives.

## Current Codebase Alignment

Current implementation already supports several foundations:

- `packages/core/src/lib/graph/` has graph nodes, agent nodes, knowledge nodes, edges, and extensible edge classes.
- `packages/core/src/lib/role/` has roles, capabilities, and context rules.
- `packages/core/src/lib/discovery/` has `discoverAgents`, `discoverKnowledge`, and graph traversal over local graphs.
- `packages/core/src/lib/context/` has context objects, propagation, validation, and filtering.
- `packages/core/src/lib/protocol/` has `ProtocolMessage`, message headers, TTL, and provenance.
- `packages/server/src/lib/auth/` has an auth provider interface and simple auth implementations.
- `packages/server/src/lib/knowledge/` has `KnowledgeSourceAdapter` and `KnowledgeSourceRegistry`.
- `packages/server/src/lib/agents/` has an external agent registry.
- `packages/server/src/lib/transport/` has framework-agnostic transports.
- `packages/server/src/lib/server/` composes lifecycle, routing, handlers, transports, auth, knowledge, and external agents.

The key shift is not to remove these pieces. The shift is to orient them around **remote context query over authorized knowledge nodes**, with direct messages as fallback or supporting machinery.

## Current Gaps

### Remote Knowledge Query

There is no standard protocol endpoint or handler contract for querying a remote knowledge node owned by another graph. `KnowledgeSourceRegistry` exists locally, but a peer cannot yet ask another server: “query this knowledge node under this principal and return an authorized result.”

Needed direction:

```text
POST /gcp/context/query
or ProtocolMessage type: "context-query"
```

Request should include requester identity metadata, target knowledge node, query text or structured query, optional filters, and desired response shape. Response should include result, denied/error state, and optional provenance metadata.

### Node-Centered Authorization

Current roles/context rules exist, but the future model needs stronger owner-side checks: target node grants access to caller role/capability. This should be explicit in docs and tests.

### Federated Discovery

Current discovery works on one in-memory graph. Future discovery should work across peer descriptors, discovery registries, or known peer graphs without requiring one global graph.

### Source-of-Truth Semantics

The protocol should distinguish between query results and ownership transfer. A caller can cache returned context, but the remote node remains source of truth and controls future access.

### Fallback Policy

There is no explicit policy for “if knowledge query blocked, ask the agent directly.” This should be opt-in and owner-controlled.

### Contract Descriptor

Current descriptors in the MVP are ad hoc. Future protocol should define peer and exposed knowledge descriptors.

## Proposed Protocol Concepts

### Context Query

`ContextQuery` is a read-only request against a graph-exposed context source. It should be the central remote operation.

```typescript
interface ContextQuery {
    readonly queryId: string;
    readonly requester: string;
    readonly targetNodeId: string;
    readonly query: string;
    readonly filters?: Record<string, unknown>;
    readonly metadata: Record<string, unknown>;
}
```

### Context Query Result

```typescript
interface ContextQueryResult {
    readonly queryId: string;
    readonly success: boolean;
    readonly result?: unknown;
    readonly denied?: boolean;
    readonly error?: string;
    readonly sourceNodeId: string;
    readonly metadata: Record<string, unknown>;
}
```

### Exposed Context Node

An exposed context node is a `knowledge` node that declares whether it can be queried remotely. It may back onto plain text, a database, logs, RAG, or an adapter.

### Fallback Direct Query

Fallback is not default communication. It is a policy-controlled option:

```text
context query denied or unavailable
    ↓
fallbackPolicy allows direct agent query
    ↓
ask target agent directly
    ↓
return agent-mediated answer
```

If fallback is disabled, return authorization or unavailable error.

## Implementation Roadmap for Next Session

### Phase 1: Document and Type Remote Context Query

Add core types for context query and query result. Keep them read-only. Do not implement RAG internals. Use `KnowledgeNode` as target.

Likely files:

- `packages/core/src/lib/context/context-query-types.ts`
- `packages/core/src/lib/context/context-query-factories.ts`
- `packages/core/src/lib/context/index.ts`
- `packages/core/src/index.ts`

Acceptance criteria:

- `ContextQuery` targets a node.
- `ContextQueryResult` can represent success, denial, and error.
- Types are exported from `@graph-context-protocol/core`.
- Tests cover creation and validation.

### Phase 2: Add Server Knowledge Query Handler Contract

Add server-side contract that maps remote context queries to local `KnowledgeSourceRegistry` or local knowledge node adapters.

Likely files:

- `packages/server/src/lib/knowledge/`
- `packages/server/src/lib/handlers/`
- `packages/server/src/lib/server/`

Acceptance criteria:

- Server can receive a context query.
- Server authenticates caller through `AuthProvider`.
- Server authorizes target node read access.
- Server returns result without transferring source ownership.

### Phase 3: Define Peer and Knowledge Descriptors

Replace ad hoc MVP descriptor shape with protocol-level descriptors for peers and exposed knowledge nodes.

Likely files:

- `packages/core/src/lib/discovery/`
- `packages/server/src/lib/federation/` if federation module is introduced.

Acceptance criteria:

- Descriptor exposes queryable knowledge nodes without leaking private content.
- Descriptor advertises auth methods and capabilities.
- Descriptor can be used by discovery without global graph assumption.

### Phase 4: Add Federated Query Example

Create or refactor an example app where node A queries node B's event knowledge node. This should demonstrate the intended product model.

Acceptance criteria:

- Node B exposes `knowledge:events` or similar.
- Node A asks “what did node B do today?”
- If caller role is allowed, Node B returns context result.
- If caller role is denied, query fails.
- Optional fallback to direct agent query is explicitly shown as policy-controlled.

## Important Design Decisions to Preserve

1. Do not require a global graph.
2. Do not make direct agent messages the primary path.
3. Do not force a specific auth mechanism.
4. Do not force a specific organization/company model.
5. Do not force a specific RAG backend.
6. Do not copy remote knowledge as source of truth.
7. Do allow callers to retain previously received cached context.
8. Do make roles and auth the core boundary mechanism.
9. Do model all readable context as graph nodes first.
10. Do keep direct agent query as optional fallback.

## Example Scenario

`agent:pm` owns product context:

```text
graph:product-manager
├── agent:pm
├── knowledge:issues
├── knowledge:user-stories
├── knowledge:decisions
└── knowledge:events
```

Access policy:

```text
role:ceo       → read all knowledge nodes
role:developer → read issues, user stories, technical decisions, events
role:external  → read only explicitly exposed summaries
```

Developer query:

```text
developer-agent asks: "what changed in issues today?"
    ↓
discovers knowledge:issues on agent:pm graph
    ↓
auth maps caller to role:developer
    ↓
knowledge:issues allows read
    ↓
remote query runs against PM-owned issue context
    ↓
developer receives answer/result
```

Denied query:

```text
external-agent asks: "show strategy decisions"
    ↓
auth maps caller to role:external
    ↓
knowledge:decisions denies read
    ↓
if fallback disabled: return denied
    ↓
if fallback enabled: optionally ask agent:pm directly
```

## Notes from Related Protocols

MCP reinforces the idea of resource-specific authorization and least-privilege scopes. ActivityPub reinforces decentralized actors and federation, but GCP should avoid processing anything before authentication. Verifiable Credentials are useful for claims, but they are not authorization by themselves. Zanzibar-style systems show why relation-based authorization and consistency matter, but GCP should not assume global infrastructure like Spanner or TrueTime. Knowledge graph RAG patterns are useful, but graph errors can amplify across hops, so typed knowledge and strict source ownership matter.

Use these lessons cautiously. GCP should remain smaller: graph-owned context, local auth, role-gated query, federated discovery, optional transport/runtime.

## Success Criteria for the New Direction

This direction is successful when a developer can install the GCP SDK in an AI Native App or autonomous agent and do the following:

1. Define local graph nodes for agents and knowledge.
2. Attach local roles, capabilities, and context rules.
3. Expose selected knowledge nodes as remotely queryable context.
4. Authenticate incoming callers with app-defined auth.
5. Map callers to GCP principals and roles.
6. Authorize or deny context queries per target node.
7. Return query results without transferring source ownership.
8. Discover peer context sources without a global graph requirement.
9. Preserve optional provenance metadata.
10. Optionally fallback to direct agent query only when policy allows.

## See Also

- [Architecture](./01-architecture.md)
- [Protocol Specific](./06-protocol-specific.md)
- [Quick Reference](./10-quick-reference.md)
- [Project README](../README.md)
