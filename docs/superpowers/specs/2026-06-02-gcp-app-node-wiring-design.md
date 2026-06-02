# Design: Wire researcher & executor apps as GCP nodes

**Date:** 2026-06-02
**Status:** Approved (design phase)

## Goal

Run the `researcher` and `executor` Next.js apps as two independently-owned
Graph Context Protocol (GCP) nodes. Each node owns a local `CONTEXT-1.md`
knowledge file. Each app's LangGraph agent can **read the other node's
context** over HTTP using the read-first `context-query` protocol.

The point is observable: a user chatting with one app can watch it issue a
GCP `context-query` to the peer node (visible as a tool-call in assistant-ui,
plus server logs) and receive the peer's context back.

This is a **testing/demo environment**, not production.

## Non-goals (YAGNI)

- **No writes over GCP.** The read-first protocol governs reads only.
  `CONTEXT-1.md` files are seed fixtures, hand-edited between turns to test.
- **No auth.** Nodes use the allow-all auth provider with an anonymous
  credential and open node access policy.
- **No federation/discovery layer.** Each app is configured with the peer's
  URL directly (env var).
- No new transport class, no WebSocket, no persistence.

## Components

Three layers, bottom-up.

### 1. `@graph-context-protocol/server` — new HTTP helpers

The server package today exposes `createGraphContextServer` and
`server.receive(envelope)` but only ships `createMemoryTransport`. There is no
Web-standard HTTP bridge, so apps would otherwise hand-roll request/response
serialization. Add two helpers (framework-agnostic, Web `Request`/`Response`):

- **`createFetchHandler({ server })` → `(req: Request) => Promise<Response>`**
  - Parse JSON body into an `InboundMessageEnvelope`
    (`transportId: "fetch"`, `payload: <ProtocolMessage>`, `receivedAt`,
    `metadata`).
  - Call `server.receive(envelope)`.
  - On success, serialize `HandlerResult.response` (the
    `context-query-response` ProtocolMessage) as the JSON body, `200`.
  - On failure / no response, return a JSON error body with an appropriate
    status (`400` bad request, `500` server error).

- **`queryRemoteContext({ url, query, credentials? })` → `Promise<ContextQueryResult>`**
  (client side)
  - Wrap the `ContextQuery` in a `ProtocolMessage`
    (`message type: "context-query"`).
  - Attach an anonymous credential (`{ type: "anonymous", value: "anonymous" }`)
    in the message header / envelope metadata under `gcp.credentials`, since
    the handler requires *a* credential to be present even with allow-all auth.
  - `POST url`, parse the JSON response ProtocolMessage, return its payload
    (`ContextQueryResult`).

Both exported from `packages/server/src/index.ts`. A new
`packages/server/src/lib/transport/fetch-transport.ts` (or
`lib/http/`) module holds the implementation, with co-located `*.spec.ts`.

### 2. `@graph-context-protocol/adapters` — NEW package

A new workspace package for concrete `KnowledgeSourceAdapter` implementations.
(The adapter cannot live in `core` — core is pure/immutable, no fs/side
effects — and should not live in `server`, which is the runtime, not concrete
sources.)

- **`createMarkdownKnowledgeAdapter({ id, nodeId, filePath })` → `KnowledgeSourceAdapter`**
  - `capabilities: ["lookup", "search"]`.
  - `query(request)`: read `filePath` (Node `fs/promises`), return a single
    `KnowledgeNode` whose content is the markdown text, wrapped in a
    `KnowledgeQueryResult`. Optionally filter/echo by the query text — minimal
    for the demo (return full file).
  - `get(nodeId)`: return the same node if `nodeId` matches.
  - `health()`: healthy if the file exists/readable.
- Depends on `@graph-context-protocol/server` (adapter interface types) and
  `@graph-context-protocol/core` (KnowledgeNode factory). Standard Nx lib
  layout: `src/index.ts`, `src/lib/markdown-adapter.ts`, co-located spec,
  `package.json`, `tsconfig`, `vitest.config.mts`.

### 3. `@graph-context-protocol/langgraph` — fill the empty package

The bridge between LangGraph agents and GCP. Today the package is an empty
shell (`src/lib/` only).

- **`createContextQueryTool({ peerUrl, targetNodeId, requesterId?, sourceNodeId? })` → LangChain `tool()`**
  - Tool name e.g. `query_peer_context`, described so the LLM knows it reads a
    peer node's shared context.
  - Input schema (zod): `{ question: string }`.
  - On call: build a `ContextQuery` (via core `createContextQuery` +
    `createRequesterDescriptor`), call `queryRemoteContext` from
    `@gcp/server`, and return the peer's context text (or a "denied/not-found"
    message) as the tool result string.
- Depends on `@gcp/core`, `@gcp/server` (client helper), `@langchain/core`.

### 4. Apps: `researcher` + `executor`

Each app becomes a GCP node. Symmetric wiring; only ids/role/peer differ.

Per app:

- **`CONTEXT-1.md`** at the app root (`apps/<app>/CONTEXT-1.md`).
  - researcher: pending tasks / research notes.
  - executor: completed results / action log.
- **`src/lib/gcp.ts`** — build and start the local node:
  - Local graph (`createGraph`) with one agent node + one knowledge node
    (`createKnowledgeNode`) for `CONTEXT-1.md`, given an **open read role/policy**.
  - Register `createMarkdownKnowledgeAdapter` pointing at `CONTEXT-1.md`.
  - `createGraphContextServer({ id, localNodeId }, { graph, knowledgeSources, auth: createAllowAllAuthProvider() })`,
    then `start()`. Export the started `server` (memoized module singleton).
- **`src/app/api/gcp/route.ts`** — `export const POST = createFetchHandler({ server })`.
- **`src/lib/graph.ts`** — bind `createContextQueryTool({ peerUrl, targetNodeId })`
  to the agent's model (`model.bindTools([...])`) and add a tool node to the
  StateGraph so tool calls execute. `peerUrl` + `targetNodeId` come from env.
- **`src/env.ts`** — add `PEER_GCP_URL` (and the peer's target knowledge node id
  if not hard-coded).

Node ids (proposed):
- researcher node: `node:researcher`, knowledge: `knowledge:researcher-context`.
- executor node: `node:executor`, knowledge: `knowledge:executor-context`.
- researcher's peer = executor's `/api/gcp`, targets `knowledge:executor-context`.
- executor's peer = researcher's `/api/gcp`, targets `knowledge:researcher-context`.

## Data flow (one peer read)

```
researcher chat turn
  │ user: "what has the executor finished?"
  ▼
researcher LangGraph agent → calls query_peer_context tool   (@gcp/langgraph)
  ▼
queryRemoteContext  POST http://<executor>/api/gcp           (@gcp/server client)
  │  body = ProtocolMessage{ type: context-query, payload: ContextQuery,
  │                          header.metadata["gcp.credentials"] = anonymous }
  ▼
executor /api/gcp route → createFetchHandler                 (@gcp/server)
  ▼
executor server.receive → context-query-handler
  ├─ validate payload
  ├─ authenticate (allow-all → principal:allow-all)
  ├─ resolve target node knowledge:executor-context from graph
  ├─ authorize node access (open policy → allowed)
  └─ executeTargetedContextQuery → markdown adapter reads executor/CONTEXT-1.md
  ▼
context-query-response ProtocolMessage (payload = ContextQueryResult{text})
  ▼
back through HTTP → queryRemoteContext returns ContextQueryResult
  ▼
tool result string → researcher agent composes answer (visible in assistant-ui)
```

The reverse direction (executor reading researcher's pending tasks) is
identical with ids swapped.

## Error handling

- **Bad request body / invalid ProtocolMessage** → handler returns
  `context-query-response` with status `error`; `createFetchHandler` maps to
  `400`.
- **Target node not found** → response status `not-found`.
- **Authorization denied** → response status `denied` (should not occur with
  open policy, but path exists).
- **Peer unreachable / fetch throws** → `queryRemoteContext` rejects; the
  langgraph tool catches and returns a readable error string to the agent so
  the chat degrades gracefully instead of crashing the turn.
- **File missing** → markdown adapter returns an error result; surfaces as
  `error` status.

## Testing

Unit (Vitest, co-located):
- `@gcp/server`: `createFetchHandler` round-trips a context-query against an
  in-memory started server and returns the response message; `queryRemoteContext`
  builds a valid ProtocolMessage and parses a response (mock fetch).
- `@gcp/adapters`: markdown adapter reads a fixture file and returns its text
  as a KnowledgeNode; missing-file path returns an error result.
- `@gcp/langgraph`: `createContextQueryTool` returns peer text on success and a
  graceful error string when the client rejects (mock `queryRemoteContext`).

Manual / observable:
- Run both apps (`nx serve researcher`, `nx serve executor` on distinct ports).
- Ask researcher "check what the executor has done" → observe the
  `query_peer_context` tool-call in assistant-ui and the GCP request in the
  executor server log; the answer reflects executor's `CONTEXT-1.md`.
- Edit a `CONTEXT-1.md`, re-ask, confirm the change is read.

## Open implementation risks

- `authorizeKnowledgeNodeAccess` semantics for an allow-all principal vs the
  knowledge node's `gcp.accessPolicy` must be confirmed during implementation;
  the knowledge node role/metadata must be configured so the open-read path
  actually returns `allowed`.
- Next.js route module singletons: `server.start()` must run once per app
  process; guard against double-start on hot reload.
- Ports/URLs for local dev wired via env; default researcher and executor to
  distinct ports and cross-point `PEER_GCP_URL`.
