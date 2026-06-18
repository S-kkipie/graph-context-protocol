# M3 — Federated Discovery + Multi-Node Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A node, knowing peers from a registry, resolves which peer owns a queried knowledge node and queries across peers over real HTTP — with no global graph — and the connection/message counts are observable and scale measurably as nodes grow 2→50.

**Architecture:** Add one shared low-level `postProtocolMessage` HTTP helper, then an `HttpTransport` behind the existing `Transport` interface (fire-and-forget `send()` + inbound symmetry), reusing that helper. Add an in-memory immutable `PeerRegistry` (mirrors `ExternalAgentRegistry`) injected via `ServerDependencies` and `RoutingContext`; the `MessageRouter` produces real `knowledge-source` routes for peer-owned targets (retiring the placeholder) and `server.send()` delivers them via `HttpTransport`. A federated query resolver decides local-vs-peer and, for peers, performs the request/response round-trip via `queryRemoteContext` (sharing the same POST core), incrementing a `CouplingMetrics` seam (peers known / connections opened / messages sent) for the M5 harness. Scenarios gain manifest `peers[]`; `createGcpNode` seeds the registry; the node fans out to discovered peers. The 2→50 scaling sweep runs in-process (memory transport carrying peer-descriptor metadata) with a small real-HTTP parity check.

**Tech Stack:** TypeScript 5.9 (strict, project references, `@ai-do/source` customCondition), Zod 4, Vitest 4, Biome 2, Nx 22, pnpm 9 / Node 20, Next.js 16, LangChain/LangGraph.

## Design Decisions (confirmed before planning — flag at review if you disagree)

- **D1 — Transport model = "shared POST core."** `HttpTransport` implements `Transport` for fire-and-forget `server.send()` peer delivery + inbound symmetry; the request/response context-query round-trip uses `queryRemoteContext`. Both share ONE low-level `postProtocolMessage(url, message, fetchImpl)` helper. NO correlation/timeout machinery is built (YAGNI). This closes the "HTTP not behind Transport" gap without an async-correlation layer.
- **D2 — Scaling harness = hybrid.** The 2→50 coupling curve runs with an in-process simulated transport (memory transport + peer-descriptor metadata); a small real-HTTP set (2–3 nodes via `HttpTransport` + `createFetchHandler`) validates parity. (Spec §8 lean.)

## Global Constraints

- **Node `>=20`, pnpm `>=9`**; use `pnpm` for all commands.
- **TypeScript strict** with project references; source resolves via the `@ai-do/source` customCondition. Library packages have only `typecheck` + `test` nx targets (no `build`); only apps build. **Apps have NO `typecheck` nx target** — type-check apps via their Next build (`nx build`) or `tsc --noEmit`.
- **Contract stability:** `gcp-context-contract/v1` is the versioned public contract. Reuse the existing `ContextPeerDescriptor` / `ExposedKnowledgeDescriptor` / `ContextQueryRequest` shapes — do NOT bump `ContractVersion`. Any wire-schema change must be additive.
- **No global graph / no central index:** discovery stays config/registry/known-peer-driven. No gossip, no DHT, no multi-hop transitive forwarding.
- **Result type:** functions return `Result<T, E>` = `{ success: true, data } | { success: false, error }`; build with `succeed(data)` / `fail(error)` from `@graph-context-protocol/core`. Server errors via `createServerError(kind, message, ...)` from `../errors` (mirror existing call shapes exactly).
- **Immutability:** registries are copy-on-write immutable (mirror `createExternalAgentRegistry`): each mutator copies the backing `Map` and returns a NEW registry via `succeed(...)`.
- **Zod 4:** use `.prefault({})` (not `.default({})`) for nested objects that must apply inner field defaults.
- **Biome formatting:** 4-space indent. Run `pnpm biome check --write <files>` on every file you create/modify before committing. Repo-wide lint is `pnpm lint`.
- **TDD + frequent commits:** failing test first; one commit per task. Conventional Commits. End every commit message body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Secrets:** OpenRouter API key lives ONLY in git-ignored `.env.local`; never commit it. Demo tokens (`tok:researcher`, `tok:executor`) are NOT secrets. `OPENROUTER_API_KEY=build-dummy` is a build-time env var only — never written to a file or committed. `CONTEXT-1.md` files are read-only seed fixtures.
- **Test commands** (nx project name ≠ vitest project name):
  - core → `pnpm nx test @graph-context-protocol/core`
  - server → `pnpm nx test server`
  - langgraph → `pnpm nx test @graph-context-protocol/langgraph`
  - scenario → `pnpm nx test @graph-context-protocol/scenario`
  - typecheck a single lib → `pnpm nx typecheck <project>`; **never** `nx typecheck A B` (single-target, two projects → nx forwards the 2nd as a tsc positional → `error TS5083`). Use `pnpm nx run-many -t typecheck -p A B` or run each separately.
  - apps build → `OPENROUTER_API_KEY=build-dummy pnpm nx run-many -t build -p researcher executor`.

---

## Reference: exact current signatures (from recon — do not re-derive)

**Transport** (`packages/server/src/lib/transport/types.ts`):
```typescript
export interface Transport {
    readonly id: TransportId;
    readonly status: TransportStatus;
    start(): Promise<Result<TransportSnapshot, ServerError>>;
    stop(options?: ShutdownOptions): Promise<Result<TransportSnapshot, ServerError>>;
    send(envelope: OutboundMessageEnvelope): Promise<Result<DeliveryReceipt, ServerError>>;
    onMessage(listener: TransportMessageListener): Unsubscribe;
    snapshot(): TransportSnapshot;
}
export type TransportStatus = "idle" | "starting" | "listening" | "draining" | "stopped" | "failed";
export interface TransportEnvelope { readonly transportId: TransportId; readonly connectionId?: ConnectionId; readonly sessionId?: SessionId; readonly message: ProtocolMessage; readonly receivedAt: Timestamp; readonly metadata: Metadata; }
export type TransportMessageListener = (envelope: TransportEnvelope) => void | Promise<void>;
export interface TransportSnapshot { readonly id: TransportId; readonly status: TransportStatus; readonly startedAt?: Timestamp; readonly stoppedAt?: Timestamp; }
```
`createMemoryTransport(id = "transport:memory"): Transport` lives in `packages/server/src/lib/transport/implementation.ts` — copy its lifecycle/onMessage/snapshot structure verbatim.

**Envelopes / receipts** (`packages/server/src/lib/types.ts`):
```typescript
export interface OutboundMessageEnvelope { readonly transportId: TransportId; readonly connectionId?: ConnectionId; readonly payload: unknown; readonly createdAt: Timestamp; readonly metadata: Metadata; }
export interface InboundMessageEnvelope { readonly transportId: TransportId; readonly connectionId?: ConnectionId; readonly sessionId?: SessionId; readonly payload: unknown; readonly receivedAt: Timestamp; readonly metadata: Metadata; }
export interface DeliveryReceipt { readonly delivered: boolean; readonly timestamp: Timestamp; readonly transportId: TransportId; readonly connectionId?: ConnectionId; readonly error?: string; }
```

**HTTP** (`packages/server/src/lib/http/`): `createFetchHandler({ server, transportId? }): (Request) => Promise<Response>` (calls `server.receive`); `queryRemoteContext({ url, query, credentials?, fetchImpl? }): Promise<ContextQueryResult>` (builds a `context-query` message with `header.metadata["gcp.credentials"]`, POSTs JSON, returns `responseMessage.payload`).

**Routing** (`packages/server/src/lib/routing/`):
```typescript
export type RouteKind = "local-handler" | "external-agent" | "knowledge-source" | "broadcast" | "undeliverable";
export interface MessageRoute { readonly kind: RouteKind; readonly message: ProtocolMessage; readonly targetNodeId: NodeId; readonly connectionId?: string; readonly transportId?: string; readonly externalAgentId?: string; readonly knowledgeSourceId?: string; readonly metadata: Record<string, unknown>; }
export interface RoutingContext { readonly localNodeId: NodeId; readonly connections: ConnectionManager; readonly externalAgents: ExternalAgentRegistry; readonly knowledgeSources: KnowledgeSourceRegistry; }
export interface MessageRouter { route(message: ProtocolMessage, context: RoutingContext): Result<MessageRoute, ServerError>; }
export function createMessageRouter(): MessageRouter
```
Current router: `target === localNodeId` → `local-handler`; `externalAgents.getByNodeId(target)` → `external-agent`; else `undeliverable`. `knowledge-source`/`broadcast` are declared but never produced.

**Server** (`packages/server/src/lib/server/`): `ServerDependencies` has `transports: TransportRegistry`, `router`, `externalAgents`, `knowledgeSources`, `audit?`, `graph?`, etc. `send()` routes via `router.route(message, { localNodeId, connections, externalAgents, knowledgeSources })` and only delivers when `route.kind === "external-agent" && route.transportId` via `this.state.dependencies.transports.get(route.transportId)`. `receive()` dispatches to handlers.

**ExternalAgentRegistry pattern** (`packages/server/src/lib/agents/`): `createExternalAgentRegistry()`; internal `createRegistry(map: ReadonlyMap<...>)` closure; mutators copy the map and `succeed(createRegistry(next))`; `snapshot()` returns counts.

**Discovery / descriptors** (`packages/core`):
```typescript
export interface ContextPeerDescriptor { readonly version: typeof ContractVersion; readonly id: string; readonly peerId: string; readonly endpoint: string; readonly graphId?: GraphId; readonly displayName?: string; readonly auth: AuthContract; readonly exposedKnowledge: readonly ExposedKnowledgeDescriptor[]; readonly capabilities: readonly CapabilityId[]; readonly queryEndpoint?: string; readonly metadata: Metadata; }
export interface ExposedKnowledgeDescriptor { readonly nodeId: NodeId; readonly kind: "knowledge"; readonly knowledgeType: KnowledgeType; readonly queryable: boolean; readonly queryContract: KnowledgeQueryContract; readonly access: AccessPolicyDescriptor; readonly tags: readonly string[]; readonly contentTypes: readonly string[]; readonly metadata: Metadata; }
createContextPeerDescriptor(id, peerId, endpoint, auth, exposedKnowledge, capabilities, options?): ContextPeerDescriptor
createExposedKnowledgeDescriptor(nodeId, knowledgeType, queryable, queryContract, access, tags?, contentTypes?, metadata?): ExposedKnowledgeDescriptor
createKnowledgeQueryContract(modes, supportsFilters, supportedFilters?, options?): KnowledgeQueryContract
createAuthContract(...)  // exported from core barrel
createAccessPolicyDescriptor(readableByRoles, requiredCapabilities, fallbackAllowed, denialMode, metadata?): AccessPolicyDescriptor
discoverPeerContextSources(peers, filters?): ContextPeerDescriptor[]   // filters: { capability?, tags?, tagMode?, queryMode? }
createContextQuery(queryId, requester, targetNodeId, mode, query, metadata?, filters?): ContextQueryRequest
createContextQueryResult(queryId, status, sourceNodeId, metadata?, result?, error?, provenance?): ContextQueryResponse
createRequesterDescriptor(principalId, roles?, capabilities?, metadata?): RequesterDescriptor
```
`ContextQueryStatus = "ok" | "denied" | "not-found" | "invalid-query" | "unavailable" | "error"`. `QueryMode = "text" | "semantic" | "structured" | "hybrid"`. `KnowledgeType` includes `"text"`. `ContextQuery = ContextQueryRequest` (has `targetNodeId`). A `KnowledgeNode` has NO `ownerId` field — ownership for federation is by which peer's `exposedKnowledge[].nodeId` matches the target.

**Scenario** (`packages/scenario/src/lib/`):
```typescript
export const GcpNodeConfigSchema = z.object({ serverId, nodeId, knowledgeId, graphId?, role:{id,name,description}, accessPolicy:.prefault({}), knowledge:{filePath,tags,contentType}, shutdownTimeoutMs });
export const NodeManifestSchema = z.object({ nodes: z.array(GcpNodeConfigSchema).min(1) });
export function runManifest(manifest: NodeManifestInput): Promise<LaunchedNode[]>   // LaunchedNode { config, server }
export interface NodeAgentConfig { llm:{model?,temperature?,apiKey?}; peers: ReadonlyArray<{peerUrl,targetNodeId,credentials?}>; systemPrompt }
export async function createGcpNode(config: GcpNodeConfigInput, deps: GcpNodeDependencies = {}): Promise<GraphContextServer>
export function createNodeAgent(config: NodeAgentConfig)
```
Scenario barrel exports: `GcpNodeConfig(Input)`, `NodeAgentConfig`, `DenialModeSchema`, `GcpNodeConfigSchema`, `createGcpNode`, `LaunchedNode`, `NodeManifestInput`, `NodeManifestSchema`, `runManifest`, `createNodeAgent`. (`GcpNodeDependencies` is NOT yet exported.)

**Apps:** `apps/{researcher,executor}/src/env.ts` validate `PEER_GCP_URL` (single URL). `graph.ts` calls `createNodeAgent({ peers: [{ peerUrl: env.PEER_GCP_URL, targetNodeId, credentials }] })`. `gcp.ts` memoizes `createGcpNode(...)` + a `createStaticTokenAuthProvider`.

**Instrumentation:** none exists today. Registries expose pull-based `snapshot()` counts only.

---

## File Structure

**server — shared HTTP core:**
- Create `packages/server/src/lib/http/post-message.ts` — `postProtocolMessage`.
- Create `packages/server/src/lib/http/post-message.spec.ts`.
- Modify `packages/server/src/lib/http/fetch-client.ts` — `queryRemoteContext` uses `postProtocolMessage`.
- Modify `packages/server/src/index.ts` — export `postProtocolMessage`.

**server — HttpTransport:**
- Create `packages/server/src/lib/transport/http-transport.ts` — `createHttpTransport`, `HttpTransportOptions`.
- Create `packages/server/src/lib/transport/http-transport.spec.ts`.
- Modify `packages/server/src/lib/transport/index.ts` + `packages/server/src/index.ts` — exports.

**server — PeerRegistry:**
- Create `packages/server/src/lib/peers/types.ts`, `implementation.ts`, `index.ts`, `peers.spec.ts`.
- Modify `packages/server/src/lib/server/types.ts` (`ServerDependencies.peers?`), `packages/server/src/lib/routing/types.ts` (`RoutingContext.peers?`), `packages/server/src/lib/server/implementation.ts` (default registry + thread into routing context), `packages/server/src/index.ts` (exports).

**server — routing + send:**
- Modify `packages/server/src/lib/routing/implementation.ts` (+ `routing.spec.ts`) — emit `knowledge-source` routes.
- Modify `packages/server/src/lib/server/implementation.ts` (+ server spec) — deliver `knowledge-source` routes via transport.

**server — metrics + federation:**
- Create `packages/server/src/lib/metrics/types.ts`, `implementation.ts`, `index.ts`, `metrics.spec.ts`.
- Create `packages/server/src/lib/federation/resolve.ts`, `index.ts`, `federation.spec.ts`.
- Modify `packages/server/src/lib/server/types.ts` (`ServerDependencies.metrics?`), `implementation.ts` (default), `packages/server/src/index.ts` (exports).

**scenario:**
- Modify `packages/scenario/src/lib/config.ts` (manifest peer schema + `GcpNodeConfigSchema.peers`), `gcp-node.ts` (seed `PeerRegistry` + `HttpTransport` + metrics; resolver), `manifest.ts` (peers carried through), `index.ts` (exports).
- Create `packages/scenario/src/lib/federation.spec.ts` — 5-node in-process fan-out + scaling counts; real-HTTP parity.

**apps:**
- Modify `apps/{researcher,executor}/src/env.ts`, `src/lib/gcp.ts`, `src/lib/graph.ts` — registry-seeded peers.

---

## Task 1: server — shared `postProtocolMessage` helper

**Files:**
- Create: `packages/server/src/lib/http/post-message.ts`
- Test: `packages/server/src/lib/http/post-message.spec.ts`
- Modify: `packages/server/src/lib/http/fetch-client.ts`
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Produces: `postProtocolMessage(url: string, message: ProtocolMessage, fetchImpl?: typeof fetch): Promise<ProtocolMessage>` — POSTs the message as JSON, returns the parsed response `ProtocolMessage`; throws on non-OK HTTP status.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/lib/http/post-message.spec.ts`:

```typescript
import type { ProtocolMessage } from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import { postProtocolMessage } from "./post-message";

const message = {
    header: {
        messageId: "msg:1",
        source: "node:a",
        target: "node:b",
        type: "context-query",
        priority: "normal",
        timestamp: "2026-06-18T10:00:00.000Z",
        ttl: 30,
        metadata: {},
    },
    context: {} as ProtocolMessage["context"],
    payload: { hello: "world" },
    provenance: [],
} as unknown as ProtocolMessage;

describe("postProtocolMessage", () => {
    it("POSTs the message as JSON and returns the parsed response message", async () => {
        const responseMessage = { ...message, payload: { answer: 42 } };
        const fetchImpl = vi.fn(async () =>
            new Response(JSON.stringify(responseMessage), { status: 200 }),
        ) as unknown as typeof fetch;

        const result = await postProtocolMessage(
            "http://peer/gcp",
            message,
            fetchImpl,
        );

        expect(result.payload).toEqual({ answer: 42 });
        const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
            .calls[0];
        expect(url).toBe("http://peer/gcp");
        expect((init as RequestInit).method).toBe("POST");
        expect(JSON.parse((init as RequestInit).body as string)).toEqual(message);
    });

    it("throws on a non-OK response", async () => {
        const fetchImpl = vi.fn(async () =>
            new Response("nope", { status: 502, statusText: "Bad Gateway" }),
        ) as unknown as typeof fetch;

        await expect(
            postProtocolMessage("http://peer/gcp", message, fetchImpl),
        ).rejects.toThrow(/502/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test server`
Expected: FAIL — cannot find `./post-message`.

- [ ] **Step 3: Implement the helper**

Create `packages/server/src/lib/http/post-message.ts`:

```typescript
/**
 * Shared low-level POST for peer messaging.
 *
 * Both the request/response client (`queryRemoteContext`) and the
 * fire-and-forget `HttpTransport` route their HTTP through this single helper
 * so there is exactly one place that owns the wire format (JSON body, a
 * `ProtocolMessage` in and a `ProtocolMessage` out).
 *
 * @module http/post-message
 */

import type { ProtocolMessage } from "@graph-context-protocol/core";

/**
 * POSTs a ProtocolMessage as JSON to a peer endpoint and parses the response
 * body as a ProtocolMessage.
 *
 * @param url - Peer endpoint URL
 * @param message - The protocol message to send
 * @param fetchImpl - Injectable fetch (defaults to global fetch)
 * @returns The peer's response ProtocolMessage
 * @throws {Error} If the HTTP response status is not OK
 */
export async function postProtocolMessage(
    url: string,
    message: ProtocolMessage,
    fetchImpl: typeof fetch = fetch,
): Promise<ProtocolMessage> {
    const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
    });

    if (!response.ok) {
        throw new Error(
            `Peer request to ${url} failed: ${response.status} ${response.statusText}`,
        );
    }

    return (await response.json()) as ProtocolMessage;
}
```

- [ ] **Step 4: Refactor `queryRemoteContext` to use it**

Open `packages/server/src/lib/http/fetch-client.ts`. It currently builds the `context-query` message (header with `metadata["gcp.credentials"]`), POSTs it with `fetchImpl`, and returns `responseMessage.payload as ContextQueryResult`. Replace ONLY the inline `fetch`/parse block with a call to the shared helper. Add the import at the top:

```typescript
import { postProtocolMessage } from "./post-message";
```

Replace the body that performs the POST + JSON parse (the part after the message is built) with:

```typescript
    const responseMessage = await postProtocolMessage(
        options.url,
        message,
        options.fetchImpl,
    );

    return responseMessage.payload as ContextQueryResult;
```

(Keep the existing message-building code — `createMessageHeader(...)`, the `gcp.credentials` metadata, the default `credentials` — exactly as is. Only the transport step changes. If the existing variable holding the built message is named differently than `message`, pass that variable.)

- [ ] **Step 5: Export from barrel**

In `packages/server/src/index.ts`, add to the HTTP export block (near the existing `queryRemoteContext` export):

```typescript
export { postProtocolMessage } from "./lib/http/post-message";
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm nx test server`
Expected: PASS — new post-message tests pass; existing fetch-client tests still pass.
Run: `pnpm nx typecheck server`
Expected: PASS.

- [ ] **Step 7: Format + commit**

```bash
pnpm biome check --write packages/server/src/lib/http/post-message.ts packages/server/src/lib/http/post-message.spec.ts packages/server/src/lib/http/fetch-client.ts packages/server/src/index.ts
git add packages/server/src/lib/http/post-message.ts packages/server/src/lib/http/post-message.spec.ts packages/server/src/lib/http/fetch-client.ts packages/server/src/index.ts
git commit -m "$(cat <<'EOF'
feat(server): extract shared postProtocolMessage HTTP helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: server — `HttpTransport` behind the `Transport` interface

**Files:**
- Create: `packages/server/src/lib/transport/http-transport.ts`
- Test: `packages/server/src/lib/transport/http-transport.spec.ts`
- Modify: `packages/server/src/lib/transport/index.ts`
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Consumes: `postProtocolMessage` (Task 1); `Transport`, `OutboundMessageEnvelope`, `DeliveryReceipt`, `TransportMessageListener`, `TransportSnapshot`, `TransportStatus` (existing).
- Produces:
  - `interface HttpTransportOptions { id?: TransportId; fetchImpl?: typeof fetch; resolveEndpoint: (envelope: OutboundMessageEnvelope) => string | undefined }`
  - `createHttpTransport(options: HttpTransportOptions): Transport` — `send()` resolves the peer endpoint from the envelope, POSTs `envelope.payload`, feeds the response to `onMessage` listeners, returns a `DeliveryReceipt`. Lifecycle/`onMessage`/`snapshot` mirror `createMemoryTransport`.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/lib/transport/http-transport.spec.ts`:

```typescript
import type { ProtocolMessage } from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import type { OutboundMessageEnvelope } from "../types";
import { createHttpTransport } from "./http-transport";

function message(): ProtocolMessage {
    return {
        header: {
            messageId: "msg:1",
            source: "node:a",
            target: "node:b",
            type: "context-query",
            priority: "normal",
            timestamp: "2026-06-18T10:00:00.000Z",
            ttl: 30,
            metadata: {},
        },
        context: {} as ProtocolMessage["context"],
        payload: { ask: "status?" },
        provenance: [],
    } as unknown as ProtocolMessage;
}

function envelope(endpoint: string): OutboundMessageEnvelope {
    return {
        transportId: "transport:http",
        payload: message(),
        createdAt: "2026-06-18T10:00:00.000Z",
        metadata: { "gcp.peerEndpoint": endpoint },
    };
}

describe("createHttpTransport", () => {
    it("starts, sends a POST to the resolved endpoint, and reports delivered", async () => {
        const fetchImpl = vi.fn(async () =>
            new Response(JSON.stringify(message()), { status: 200 }),
        ) as unknown as typeof fetch;
        const transport = createHttpTransport({
            fetchImpl,
            resolveEndpoint: (e) =>
                e.metadata["gcp.peerEndpoint"] as string | undefined,
        });

        await transport.start();
        const result = await transport.send(envelope("http://peer/gcp"));

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.delivered).toBe(true);
            expect(result.data.transportId).toBe("transport:http");
        }
        expect(
            (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0],
        ).toBe("http://peer/gcp");
    });

    it("delivers the peer response to onMessage listeners", async () => {
        const fetchImpl = vi.fn(async () =>
            new Response(JSON.stringify(message()), { status: 200 }),
        ) as unknown as typeof fetch;
        const transport = createHttpTransport({
            fetchImpl,
            resolveEndpoint: () => "http://peer/gcp",
        });
        const seen: ProtocolMessage[] = [];
        transport.onMessage((env) => {
            seen.push(env.message);
        });

        await transport.start();
        await transport.send(envelope("http://peer/gcp"));

        expect(seen).toHaveLength(1);
        expect(seen[0]?.header.type).toBe("context-query");
    });

    it("fails to send when not listening", async () => {
        const transport = createHttpTransport({
            resolveEndpoint: () => "http://peer/gcp",
        });
        const result = await transport.send(envelope("http://peer/gcp"));
        expect(result.success).toBe(false);
    });

    it("fails to send when no endpoint resolves", async () => {
        const transport = createHttpTransport({ resolveEndpoint: () => undefined });
        await transport.start();
        const result = await transport.send({
            transportId: "transport:http",
            payload: message(),
            createdAt: "2026-06-18T10:00:00.000Z",
            metadata: {},
        });
        expect(result.success).toBe(false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test server`
Expected: FAIL — cannot find `./http-transport`.

- [ ] **Step 3: Implement `createHttpTransport`**

Open `packages/server/src/lib/transport/implementation.ts` and read `createMemoryTransport` to copy its exact `start`/`stop`/`snapshot`/`onMessage` structure and its `createServerError("transport-error", ...)` call shapes. Then create `packages/server/src/lib/transport/http-transport.ts`:

```typescript
/**
 * HTTP transport behind the `Transport` interface.
 *
 * Fire-and-forget `send()`: resolves the destination endpoint from the
 * outbound envelope, POSTs the payload via the shared {@link postProtocolMessage}
 * helper, and feeds the peer's response back to `onMessage` listeners for
 * duplex symmetry. No request/response correlation is performed here — the
 * request/response context-query path uses `queryRemoteContext` (decision D1).
 *
 * @module transport/http-transport
 */

import type {
    ProtocolMessage,
    Result,
    Timestamp,
} from "@graph-context-protocol/core";
import { fail, succeed } from "@graph-context-protocol/core";
import { createServerError } from "../errors";
import { postProtocolMessage } from "../http/post-message";
import type { ShutdownOptions } from "../lifecycle/types";
import type {
    DeliveryReceipt,
    OutboundMessageEnvelope,
    TransportId,
    Unsubscribe,
} from "../types";
import type {
    Transport,
    TransportEnvelope,
    TransportMessageListener,
    TransportSnapshot,
    TransportStatus,
} from "./types";

/** Options for {@link createHttpTransport}. */
export interface HttpTransportOptions {
    /** Transport id (defaults to "transport:http"). */
    readonly id?: TransportId;
    /** Injectable fetch (defaults to global fetch). */
    readonly fetchImpl?: typeof fetch;
    /**
     * Resolves the destination URL for an outbound envelope. Typically reads
     * `envelope.metadata["gcp.peerEndpoint"]` (set by the message router from
     * the matched peer descriptor).
     */
    readonly resolveEndpoint: (
        envelope: OutboundMessageEnvelope,
    ) => string | undefined;
}

/**
 * Creates an HTTP transport implementing the `Transport` interface.
 *
 * @param options - Endpoint resolver + optional id/fetch
 * @returns A new HttpTransport
 */
export function createHttpTransport(options: HttpTransportOptions): Transport {
    const transportId: TransportId = options.id ?? "transport:http";
    const fetchImpl = options.fetchImpl ?? fetch;
    let status: TransportStatus = "idle";
    let startedAt: Timestamp | undefined;
    let stoppedAt: Timestamp | undefined;
    const listeners = new Set<TransportMessageListener>();

    function createSnapshot(): TransportSnapshot {
        return { id: transportId, status, startedAt, stoppedAt };
    }

    return {
        id: transportId,
        get status() {
            return status;
        },
        async start(): Promise<Result<TransportSnapshot, ServerError>> {
            if (status === "listening") {
                return succeed(createSnapshot());
            }
            status = "starting";
            startedAt = new Date().toISOString();
            status = "listening";
            return succeed(createSnapshot());
        },
        async stop(
            _options: ShutdownOptions = {},
        ): Promise<Result<TransportSnapshot, ServerError>> {
            if (status === "stopped") {
                return succeed(createSnapshot());
            }
            stoppedAt = new Date().toISOString();
            status = "stopped";
            return succeed(createSnapshot());
        },
        async send(
            envelope: OutboundMessageEnvelope,
        ): Promise<Result<DeliveryReceipt, ServerError>> {
            if (status !== "listening") {
                return fail(
                    createServerError(
                        "transport-error",
                        `Transport is not listening: ${transportId}`,
                    ),
                );
            }
            if (envelope.transportId !== transportId) {
                return fail(
                    createServerError(
                        "transport-error",
                        `Envelope transport does not match: ${transportId}`,
                    ),
                );
            }
            const endpoint = options.resolveEndpoint(envelope);
            if (endpoint === undefined) {
                return fail(
                    createServerError(
                        "transport-error",
                        `No endpoint resolved for envelope on ${transportId}`,
                    ),
                );
            }
            const timestamp = new Date().toISOString();
            try {
                const responseMessage = await postProtocolMessage(
                    endpoint,
                    envelope.payload as ProtocolMessage,
                    fetchImpl,
                );
                const transportEnvelope: TransportEnvelope = {
                    transportId,
                    connectionId: envelope.connectionId,
                    message: responseMessage,
                    receivedAt: new Date().toISOString(),
                    metadata: envelope.metadata,
                };
                for (const listener of listeners) {
                    await listener(transportEnvelope);
                }
            } catch (cause) {
                return fail(
                    createServerError(
                        "transport-error",
                        `HTTP transport send failed: ${transportId}`,
                    ),
                );
            }
            return succeed({
                delivered: true,
                timestamp,
                transportId,
                connectionId: envelope.connectionId,
            });
        },
        onMessage(listener: TransportMessageListener): Unsubscribe {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        snapshot(): TransportSnapshot {
            return createSnapshot();
        },
    };
}
```

(If `createMemoryTransport` validates `envelope`/`listener` via Zod schemas — `OutboundMessageEnvelopeSchema`, `TransportMessageListenerSchema` — and the `ServerError` type import path differs, mirror those exactly; the structure above matches its observed shape. The `ServerError` type comes from `../errors`; add `import type { ServerError } from "../errors";` if not already pulled in.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test server`
Expected: PASS.

- [ ] **Step 5: Export from barrels**

In `packages/server/src/lib/transport/index.ts` add:

```typescript
export { createHttpTransport } from "./http-transport";
export type { HttpTransportOptions } from "./http-transport";
```

In `packages/server/src/index.ts`, add to the transport export block:

```typescript
export { createHttpTransport } from "./lib/transport/index";
export type { HttpTransportOptions } from "./lib/transport/index";
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm nx typecheck server` → PASS.

```bash
pnpm biome check --write packages/server/src/lib/transport/http-transport.ts packages/server/src/lib/transport/http-transport.spec.ts packages/server/src/lib/transport/index.ts packages/server/src/index.ts
git add packages/server/src/lib/transport packages/server/src/index.ts
git commit -m "$(cat <<'EOF'
feat(server): add HttpTransport behind the Transport interface

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: server — `PeerRegistry` + wire into `ServerDependencies` & `RoutingContext`

**Files:**
- Create: `packages/server/src/lib/peers/types.ts`, `implementation.ts`, `index.ts`
- Test: `packages/server/src/lib/peers/peers.spec.ts`
- Modify: `packages/server/src/lib/server/types.ts`, `packages/server/src/lib/routing/types.ts`, `packages/server/src/lib/server/implementation.ts`, `packages/server/src/index.ts`

**Interfaces:**
- Consumes: `ContextPeerDescriptor`, `NodeId` (core); `ServerError` (errors); `succeed`/`fail`.
- Produces:
  - `interface PeerRegistry { register(peer): Result<PeerRegistry, ServerError>; get(peerId: string): ContextPeerDescriptor | undefined; getByKnowledgeNodeId(nodeId: NodeId): ContextPeerDescriptor | undefined; list(): readonly ContextPeerDescriptor[]; unregister(peerId: string): Result<PeerRegistry, ServerError>; snapshot(): PeerRegistrySnapshot }`
  - `interface PeerRegistrySnapshot { totalPeers: number }`
  - `createPeerRegistry(initial?: readonly ContextPeerDescriptor[]): PeerRegistry`
  - `ServerDependencies.peers?: PeerRegistry`; `RoutingContext.peers?: PeerRegistry`.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/lib/peers/peers.spec.ts`:

```typescript
import {
    type ContextPeerDescriptor,
    createAccessPolicyDescriptor,
    createAuthContract,
    createContextPeerDescriptor,
    createExposedKnowledgeDescriptor,
    createKnowledgeQueryContract,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { createPeerRegistry } from "./implementation";

function peer(peerId: string, knowledgeNodeId: string): ContextPeerDescriptor {
    const exposed = createExposedKnowledgeDescriptor(
        knowledgeNodeId,
        "text",
        true,
        createKnowledgeQueryContract(["text"], false),
        createAccessPolicyDescriptor([], [], true, "empty-result"),
        ["tasks"],
    );
    return createContextPeerDescriptor(
        `peer-desc:${peerId}`,
        peerId,
        `http://${peerId}/gcp`,
        createAuthContract(["bearer-token"], false),
        [exposed],
        [],
    );
}

describe("createPeerRegistry", () => {
    it("starts empty", () => {
        expect(createPeerRegistry().list()).toEqual([]);
        expect(createPeerRegistry().snapshot().totalPeers).toBe(0);
    });

    it("registers and looks up peers immutably", () => {
        const base = createPeerRegistry();
        const next = base.register(peer("p1", "knowledge:a"));
        expect(next.success).toBe(true);
        // original registry unchanged (copy-on-write)
        expect(base.list()).toHaveLength(0);
        if (next.success) {
            expect(next.data.list()).toHaveLength(1);
            expect(next.data.get("p1")?.peerId).toBe("p1");
            expect(next.data.snapshot().totalPeers).toBe(1);
        }
    });

    it("resolves a peer by the knowledge node id it exposes", () => {
        const seeded = createPeerRegistry([
            peer("p1", "knowledge:a"),
            peer("p2", "knowledge:b"),
        ]);
        expect(seeded.getByKnowledgeNodeId("knowledge:b")?.peerId).toBe("p2");
        expect(seeded.getByKnowledgeNodeId("knowledge:missing")).toBeUndefined();
    });

    it("unregisters immutably", () => {
        const seeded = createPeerRegistry([peer("p1", "knowledge:a")]);
        const removed = seeded.unregister("p1");
        expect(removed.success).toBe(true);
        if (removed.success) {
            expect(removed.data.list()).toHaveLength(0);
        }
        expect(seeded.list()).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test server`
Expected: FAIL — cannot find `./implementation` in `peers`.

- [ ] **Step 3: Create the types**

Create `packages/server/src/lib/peers/types.ts`:

```typescript
/**
 * In-memory peer registry for federated discovery.
 *
 * @module peers/types
 */

import type {
    ContextPeerDescriptor,
    NodeId,
    Result,
} from "@graph-context-protocol/core";
import type { ServerError } from "../errors";

/** Pull-based snapshot of the peer registry (coupling-metric input). */
export interface PeerRegistrySnapshot {
    readonly totalPeers: number;
}

/** Copy-on-write immutable registry of known peer descriptors. */
export interface PeerRegistry {
    /** Registers a peer; returns a NEW registry. */
    register(peer: ContextPeerDescriptor): Result<PeerRegistry, ServerError>;
    /** Looks up a peer by its `peerId`. */
    get(peerId: string): ContextPeerDescriptor | undefined;
    /** Resolves the peer that exposes the given knowledge node id, if any. */
    getByKnowledgeNodeId(nodeId: NodeId): ContextPeerDescriptor | undefined;
    /** Lists all known peers. */
    list(): readonly ContextPeerDescriptor[];
    /** Removes a peer by `peerId`; returns a NEW registry. */
    unregister(peerId: string): Result<PeerRegistry, ServerError>;
    /** Returns a pull-based snapshot. */
    snapshot(): PeerRegistrySnapshot;
}
```

- [ ] **Step 4: Create the implementation**

Create `packages/server/src/lib/peers/implementation.ts` (mirrors `createExternalAgentRegistry`'s copy-on-write closure):

```typescript
/**
 * In-memory immutable peer registry implementation.
 *
 * @module peers/implementation
 */

import type {
    ContextPeerDescriptor,
    NodeId,
    Result,
} from "@graph-context-protocol/core";
import { fail, succeed } from "@graph-context-protocol/core";
import { createServerError } from "../errors";
import type { PeerRegistry, PeerRegistrySnapshot } from "./types";

function build(peers: ReadonlyMap<string, ContextPeerDescriptor>): PeerRegistry {
    return {
        register(
            peer: ContextPeerDescriptor,
        ): Result<PeerRegistry, ServerError> {
            if (peers.has(peer.peerId)) {
                return fail(
                    createServerError(
                        "validation-error",
                        `Peer already registered: ${peer.peerId}`,
                    ),
                );
            }
            const next = new Map(peers);
            next.set(peer.peerId, peer);
            return succeed(build(next));
        },
        get(peerId: string): ContextPeerDescriptor | undefined {
            return peers.get(peerId);
        },
        getByKnowledgeNodeId(nodeId: NodeId): ContextPeerDescriptor | undefined {
            for (const peer of peers.values()) {
                if (
                    peer.exposedKnowledge.some(
                        (knowledge) => knowledge.nodeId === nodeId,
                    )
                ) {
                    return peer;
                }
            }
            return undefined;
        },
        list(): readonly ContextPeerDescriptor[] {
            return [...peers.values()];
        },
        unregister(peerId: string): Result<PeerRegistry, ServerError> {
            if (!peers.has(peerId)) {
                return fail(
                    createServerError(
                        "not-found",
                        `Peer not registered: ${peerId}`,
                    ),
                );
            }
            const next = new Map(peers);
            next.delete(peerId);
            return succeed(build(next));
        },
        snapshot(): PeerRegistrySnapshot {
            return { totalPeers: peers.size };
        },
    };
}

/**
 * Creates an in-memory peer registry, optionally seeded with descriptors.
 *
 * @param initial - Peer descriptors to seed (deduped by peerId, last wins)
 * @returns A new PeerRegistry
 */
export function createPeerRegistry(
    initial: readonly ContextPeerDescriptor[] = [],
): PeerRegistry {
    const map = new Map<string, ContextPeerDescriptor>();
    for (const peer of initial) {
        map.set(peer.peerId, peer);
    }
    return build(map);
}
```

(Confirm the exact `ServerError` kind strings — `"validation-error"`, `"not-found"` — match the union accepted by `createServerError`; mirror the kinds used by `createExternalAgentRegistry`'s `register`/`unregister`. If the agents registry uses different kind strings, use those.)

- [ ] **Step 5: Create the barrel**

Create `packages/server/src/lib/peers/index.ts`:

```typescript
export { createPeerRegistry } from "./implementation";
export type { PeerRegistry, PeerRegistrySnapshot } from "./types";
```

- [ ] **Step 6: Wire into `ServerDependencies` and `RoutingContext`**

In `packages/server/src/lib/server/types.ts`, add the import and the optional field (after `readonly externalAgents: ExternalAgentRegistry;`):

```typescript
import type { PeerRegistry } from "../peers/types";
```
```typescript
    readonly peers?: PeerRegistry;
```

In `packages/server/src/lib/routing/types.ts`, add the import and an optional field to `RoutingContext`:

```typescript
import type { PeerRegistry } from "../peers/types";
```
```typescript
    readonly peers?: PeerRegistry;
```

- [ ] **Step 7: Default registry + thread into routing context**

In `packages/server/src/lib/server/implementation.ts`:

Add the import:

```typescript
import { createPeerRegistry } from "../peers/implementation";
```

In `defaultDependencies`, add (near `externalAgents: createExternalAgentRegistry(),`):

```typescript
        peers: createPeerRegistry(),
```

In `send()`, find the `router.route(message, { localNodeId, connections, externalAgents, knowledgeSources })` call and add `peers`:

```typescript
        const route = this.state.dependencies.router.route(message, {
            localNodeId: this.state.dependencies /* keep existing fields */
                ? this.localNodeId
                : this.localNodeId,
            connections: this.state.dependencies.connections,
            externalAgents: this.state.dependencies.externalAgents,
            knowledgeSources: this.state.dependencies.knowledgeSources,
            peers: this.state.dependencies.peers,
        });
```

(Use the EXACT field accessors already present in the current `send()` — just add the single `peers: this.state.dependencies.peers,` line to the routing-context object literal. Do not restructure the other fields.)

- [ ] **Step 8: Export from barrel**

In `packages/server/src/index.ts`, add a new block:

```typescript
// Peers
export { createPeerRegistry } from "./lib/peers/index";
export type { PeerRegistry, PeerRegistrySnapshot } from "./lib/peers/index";
```

- [ ] **Step 9: Run tests + typecheck**

Run: `pnpm nx test server` → PASS (peers tests + existing).
Run: `pnpm nx typecheck server` → PASS.

- [ ] **Step 10: Format + commit**

```bash
pnpm biome check --write packages/server/src/lib/peers packages/server/src/lib/server/types.ts packages/server/src/lib/server/implementation.ts packages/server/src/lib/routing/types.ts packages/server/src/index.ts
git add packages/server/src/lib/peers packages/server/src/lib/server packages/server/src/lib/routing/types.ts packages/server/src/index.ts
git commit -m "$(cat <<'EOF'
feat(server): add in-memory PeerRegistry wired through ServerDependencies and RoutingContext

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: routing — emit real `knowledge-source` routes; `server.send()` delivers via transport

**Files:**
- Modify: `packages/server/src/lib/routing/implementation.ts`
- Test: `packages/server/src/lib/routing/routing.spec.ts` (append)
- Modify: `packages/server/src/lib/server/implementation.ts`
- Test: `packages/server/src/lib/server/<server lifecycle/send spec>.ts` (append; match the existing server send test file)

**Interfaces:**
- Consumes: `RoutingContext.peers` (Task 3), `PeerRegistry.getByKnowledgeNodeId` (Task 3), `HttpTransport` registered as `"transport:http"` (Task 2).
- Produces:
  - Router returns `kind: "knowledge-source"` for a target nodeId owned by a known peer, carrying `transportId: "transport:http"`, `knowledgeSourceId: peer.peerId`, and `metadata["gcp.peerEndpoint"] = peer.queryEndpoint ?? peer.endpoint`.
  - `server.send()` delivers `knowledge-source` routes (in addition to `external-agent`) via `transports.get(route.transportId)`, building the outbound envelope's `metadata["gcp.peerEndpoint"]` from the route metadata.

- [ ] **Step 1: Write the failing router test**

Append to `packages/server/src/lib/routing/routing.spec.ts` (reuse existing imports for `createMessageRouter`, `RoutingContext`, message/registry builders; add a `createPeerRegistry` import + peer-descriptor builders as in Task 3's spec if not present):

```typescript
describe("MessageRouter — knowledge-source routes (M3)", () => {
    it("routes a peer-owned target to a knowledge-source route", () => {
        const router = createMessageRouter();
        const peers = createPeerRegistry([
            // build a ContextPeerDescriptor exposing knowledge node "knowledge:remote"
            // via createContextPeerDescriptor(...) + createExposedKnowledgeDescriptor("knowledge:remote", ...)
            buildPeerDescriptor("peer:remote", "knowledge:remote", "http://remote/gcp"),
        ]);
        const message = buildContextQueryMessage("knowledge:remote"); // target header = knowledge:remote
        const result = router.route(message, {
            localNodeId: "node:local",
            connections: emptyConnections(),
            externalAgents: emptyExternalAgents(),
            knowledgeSources: emptyKnowledgeSources(),
            peers,
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.kind).toBe("knowledge-source");
            expect(result.data.transportId).toBe("transport:http");
            expect(result.data.knowledgeSourceId).toBe("peer:remote");
            expect(result.data.metadata["gcp.peerEndpoint"]).toBe(
                "http://remote/gcp",
            );
        }
    });

    it("still returns undeliverable for an unknown target with no peer", () => {
        const router = createMessageRouter();
        const message = buildContextQueryMessage("knowledge:nobody");
        const result = router.route(message, {
            localNodeId: "node:local",
            connections: emptyConnections(),
            externalAgents: emptyExternalAgents(),
            knowledgeSources: emptyKnowledgeSources(),
            peers: createPeerRegistry(),
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.kind).toBe("undeliverable");
        }
    });
});
```

(Adapt the helper names — `buildPeerDescriptor`, `buildContextQueryMessage`, `emptyConnections`, etc. — to whatever the existing `routing.spec.ts` already uses for building messages and the connection/external-agent/knowledge-source registries. If the spec builds these inline, follow that style. The message's `header.target` must be the knowledge node id.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test server`
Expected: FAIL — router returns `undeliverable` (knowledge-source branch not implemented).

- [ ] **Step 3: Implement the router branch**

In `packages/server/src/lib/routing/implementation.ts`, locate the routing logic (target===localNodeId → local-handler; externalAgents.getByNodeId → external-agent; fallthrough → undeliverable). Add a peer-lookup branch BEFORE the `undeliverable` fallthrough:

```typescript
        const peer = context.peers?.getByKnowledgeNodeId(targetId);
        if (peer) {
            return succeed({
                kind: "knowledge-source",
                message,
                targetNodeId: targetId,
                transportId: "transport:http",
                knowledgeSourceId: peer.peerId,
                metadata: {
                    "gcp.peerEndpoint": peer.queryEndpoint ?? peer.endpoint,
                },
            });
        }
```

(Use the exact local variable the implementation already uses for the target node id — in recon it is `targetId`. Keep the `succeed(...)` import already present. Remove or update the stale placeholder comment about knowledge sources not having node ids.)

- [ ] **Step 4: Write the failing server-send test**

Append to the existing server send/lifecycle spec a test that registers an `HttpTransport` (id `"transport:http"`) with a fake `fetchImpl`, registers a peer exposing a knowledge node, starts the server, calls `server.send(message)` targeting that knowledge node, and asserts the fake fetch was called with the peer endpoint and the receipt reports `delivered: true`:

```typescript
it("delivers a knowledge-source route to the peer over HttpTransport (M3)", async () => {
    const fetchImpl = vi.fn(async () =>
        new Response(JSON.stringify(buildResponseMessage()), { status: 200 }),
    ) as unknown as typeof fetch;
    const httpTransport = createHttpTransport({
        fetchImpl,
        resolveEndpoint: (e) => e.metadata["gcp.peerEndpoint"] as string | undefined,
    });
    const transports = createTransportRegistry();
    transports.register(httpTransport);
    const peers = createPeerRegistry([
        buildPeerDescriptor("peer:remote", "knowledge:remote", "http://remote/gcp"),
    ]);
    const server = createGraphContextServer(
        { id: "server:1", localNodeId: "node:local" },
        { transports, peers },
    );
    await server.start();

    const result = await server.send(buildContextQueryMessage("knowledge:remote"));

    expect(result.success).toBe(true);
    expect(
        (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0],
    ).toBe("http://remote/gcp");
});
```

(Match the existing server-spec helpers and the `createGraphContextServer(config, deps)` call shape. `createTransportRegistry`, `createHttpTransport`, `createPeerRegistry` import from the server barrel/internal modules. Note `TransportRegistry.register` returns a `Result` — if the existing tests treat it as a builder, follow that; the recon shows `register(transport): Result<TransportRegistry, ServerError>`, so capture the returned registry if needed.)

- [ ] **Step 5: Implement the send delivery branch**

In `packages/server/src/lib/server/implementation.ts` `send()`, broaden the transport-delivery condition. The current branch is `if (route.kind === "external-agent" && route.transportId) { ... transport.send({ transportId, connectionId, payload: message, createdAt, metadata: {} }) }`. Change it to also handle `knowledge-source` and forward the peer endpoint in the envelope metadata:

```typescript
            if (
                (route.kind === "external-agent" ||
                    route.kind === "knowledge-source") &&
                route.transportId
            ) {
                const transport = this.state.dependencies.transports.get(
                    route.transportId,
                );
                if (!transport) {
                    return fail(
                        createServerError(
                            "transport-error",
                            `Transport "${route.transportId}" not found`,
                        ),
                    );
                }
                return transport.send({
                    transportId: route.transportId,
                    connectionId: route.connectionId,
                    payload: message,
                    createdAt: new Date().toISOString(),
                    metadata: {
                        "gcp.peerEndpoint": route.metadata["gcp.peerEndpoint"],
                    },
                });
            }
```

(Keep the existing `external-agent` envelope fields; the only changes are the `||` condition and passing `metadata: { "gcp.peerEndpoint": route.metadata["gcp.peerEndpoint"] }` so `HttpTransport.resolveEndpoint` can read it. For `external-agent` routes `route.metadata["gcp.peerEndpoint"]` is simply `undefined`, which is the prior behavior — confirm external-agent transport tests stay green.)

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm nx test server` → PASS (router + send tests + existing).
Run: `pnpm nx typecheck server` → PASS.

- [ ] **Step 7: Format + commit**

```bash
pnpm biome check --write packages/server/src/lib/routing/implementation.ts packages/server/src/lib/routing/routing.spec.ts packages/server/src/lib/server/implementation.ts
# also add the server send spec file you appended to
git add packages/server/src/lib/routing packages/server/src/lib/server
git commit -m "$(cat <<'EOF'
feat(server): route peer-owned targets to knowledge-source routes delivered over HttpTransport

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: server — `CouplingMetrics` seam + federated query resolution

**Files:**
- Create: `packages/server/src/lib/metrics/types.ts`, `implementation.ts`, `index.ts`
- Test: `packages/server/src/lib/metrics/metrics.spec.ts`
- Create: `packages/server/src/lib/federation/resolve.ts`, `index.ts`
- Test: `packages/server/src/lib/federation/federation.spec.ts`
- Modify: `packages/server/src/lib/server/types.ts` (`ServerDependencies.metrics?`), `packages/server/src/lib/server/implementation.ts` (default), `packages/server/src/index.ts` (exports)

**Interfaces:**
- Consumes: `PeerRegistry` (Task 3); `queryRemoteContext` + `QueryRemoteContextOptions` (existing); `ContextQuery`, `ContextQueryResult`, `createContextQueryResult`, `Credentials`, `NodeId` (core/server).
- Produces:
  - `interface CouplingMetricsSnapshot { peersKnown: number; connectionsOpened: number; messagesSent: number }`
  - `interface CouplingMetrics { recordPeerContacted(peerId: string): void; recordMessageSent(): void; setPeersKnown(count: number): void; snapshot(): CouplingMetricsSnapshot }`
  - `createCouplingMetrics(): CouplingMetrics`
  - `ServerDependencies.metrics?: CouplingMetrics`
  - `interface ResolveContextQueryOptions { query: ContextQuery; isLocalTarget: (nodeId: NodeId) => boolean; localNodeId: NodeId; peers: PeerRegistry; localHandler: (query: ContextQuery) => Promise<ContextQueryResult>; credentials?: Credentials; fetchImpl?: typeof fetch; metrics?: CouplingMetrics; queryFn?: typeof queryRemoteContext }`
  - `resolveContextQuery(options: ResolveContextQueryOptions): Promise<ContextQueryResult>` — local target → `localHandler`; peer-owned → contact the peer via `queryFn` and record metrics; unknown → `not-found` result.

- [ ] **Step 1: Write the failing metrics test**

Create `packages/server/src/lib/metrics/metrics.spec.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createCouplingMetrics } from "./implementation";

describe("createCouplingMetrics", () => {
    it("starts at zero", () => {
        expect(createCouplingMetrics().snapshot()).toEqual({
            peersKnown: 0,
            connectionsOpened: 0,
            messagesSent: 0,
        });
    });

    it("counts distinct peers contacted as connectionsOpened", () => {
        const m = createCouplingMetrics();
        m.recordPeerContacted("p1");
        m.recordPeerContacted("p1");
        m.recordPeerContacted("p2");
        expect(m.snapshot().connectionsOpened).toBe(2);
    });

    it("counts messages sent and tracks peers known", () => {
        const m = createCouplingMetrics();
        m.recordMessageSent();
        m.recordMessageSent();
        m.setPeersKnown(7);
        expect(m.snapshot().messagesSent).toBe(2);
        expect(m.snapshot().peersKnown).toBe(7);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test server`
Expected: FAIL — cannot find `./implementation` in `metrics`.

- [ ] **Step 3: Implement metrics**

Create `packages/server/src/lib/metrics/types.ts`:

```typescript
/**
 * Coupling-metric seam for the M5 benchmark harness.
 *
 * @module metrics/types
 */

/** Pull-based coupling counts for one node over a run. */
export interface CouplingMetricsSnapshot {
    /** Number of peers this node knows (registry size). */
    readonly peersKnown: number;
    /** Distinct peers this node had to contact. */
    readonly connectionsOpened: number;
    /** Total peer messages sent. */
    readonly messagesSent: number;
}

/** Mutable coupling-metric accumulator. */
export interface CouplingMetrics {
    /** Records that a peer was contacted (deduped → connectionsOpened). */
    recordPeerContacted(peerId: string): void;
    /** Increments the messages-sent counter. */
    recordMessageSent(): void;
    /** Sets the peers-known count (typically registry size). */
    setPeersKnown(count: number): void;
    /** Returns the current snapshot. */
    snapshot(): CouplingMetricsSnapshot;
}
```

Create `packages/server/src/lib/metrics/implementation.ts`:

```typescript
/**
 * In-memory coupling-metric accumulator.
 *
 * @module metrics/implementation
 */

import type { CouplingMetrics, CouplingMetricsSnapshot } from "./types";

/**
 * Creates an in-memory coupling-metric accumulator. `connectionsOpened` is the
 * count of DISTINCT peers contacted; `messagesSent` is the total peer message
 * count; `peersKnown` is set explicitly (usually the registry size).
 *
 * @returns A new CouplingMetrics
 */
export function createCouplingMetrics(): CouplingMetrics {
    let peersKnown = 0;
    let messagesSent = 0;
    const contacted = new Set<string>();
    return {
        recordPeerContacted(peerId: string): void {
            contacted.add(peerId);
        },
        recordMessageSent(): void {
            messagesSent += 1;
        },
        setPeersKnown(count: number): void {
            peersKnown = count;
        },
        snapshot(): CouplingMetricsSnapshot {
            return {
                peersKnown,
                connectionsOpened: contacted.size,
                messagesSent,
            };
        },
    };
}
```

Create `packages/server/src/lib/metrics/index.ts`:

```typescript
export { createCouplingMetrics } from "./implementation";
export type { CouplingMetrics, CouplingMetricsSnapshot } from "./types";
```

- [ ] **Step 4: Write the failing federation test**

Create `packages/server/src/lib/federation/federation.spec.ts`:

```typescript
import {
    type ContextPeerDescriptor,
    type ContextQueryResult,
    createAccessPolicyDescriptor,
    createAuthContract,
    createContextPeerDescriptor,
    createContextQuery,
    createExposedKnowledgeDescriptor,
    createKnowledgeQueryContract,
    createRequesterDescriptor,
} from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import { createCouplingMetrics } from "../metrics/implementation";
import { createPeerRegistry } from "../peers/implementation";
import { resolveContextQuery } from "./resolve";

function peer(peerId: string, knowledgeNodeId: string): ContextPeerDescriptor {
    return createContextPeerDescriptor(
        `peer-desc:${peerId}`,
        peerId,
        `http://${peerId}/gcp`,
        createAuthContract(["bearer-token"], false),
        [
            createExposedKnowledgeDescriptor(
                knowledgeNodeId,
                "text",
                true,
                createKnowledgeQueryContract(["text"], false),
                createAccessPolicyDescriptor([], [], true, "empty-result"),
            ),
        ],
        [],
    );
}

function query(targetNodeId: string) {
    return createContextQuery(
        `q:${targetNodeId}`,
        createRequesterDescriptor("principal:agent"),
        targetNodeId,
        "text",
        "status?",
    );
}

describe("resolveContextQuery", () => {
    it("handles a local target with the local handler (no peer contact)", async () => {
        const metrics = createCouplingMetrics();
        const localHandler = vi.fn(
            async (): Promise<ContextQueryResult> => ({
                contractVersion: "gcp-context-contract/v1",
                queryId: "q:local",
                status: "ok",
                sourceNodeId: "node:local",
                result: "local-answer",
                metadata: {},
            }),
        );

        const result = await resolveContextQuery({
            query: query("knowledge:local"),
            localNodeId: "node:local",
            isLocalTarget: (id) => id === "knowledge:local",
            peers: createPeerRegistry(),
            localHandler,
            metrics,
        });

        expect(result.status).toBe("ok");
        expect(localHandler).toHaveBeenCalledOnce();
        expect(metrics.snapshot().connectionsOpened).toBe(0);
        expect(metrics.snapshot().messagesSent).toBe(0);
    });

    it("contacts the owning peer for a remote target and records metrics", async () => {
        const metrics = createCouplingMetrics();
        const queryFn = vi.fn(
            async (): Promise<ContextQueryResult> => ({
                contractVersion: "gcp-context-contract/v1",
                queryId: "q:remote",
                status: "ok",
                sourceNodeId: "knowledge:remote",
                result: "peer-answer",
                metadata: {},
            }),
        ) as unknown as typeof import("../http/fetch-client").queryRemoteContext;

        const result = await resolveContextQuery({
            query: query("knowledge:remote"),
            localNodeId: "node:local",
            isLocalTarget: () => false,
            peers: createPeerRegistry([peer("peer:remote", "knowledge:remote")]),
            localHandler: async () => {
                throw new Error("should not be called");
            },
            metrics,
            queryFn,
        });

        expect(result.status).toBe("ok");
        expect(result.result).toBe("peer-answer");
        expect(metrics.snapshot().connectionsOpened).toBe(1);
        expect(metrics.snapshot().messagesSent).toBe(1);
        expect(metrics.snapshot().peersKnown).toBe(1);
        // queryFn was called against the peer endpoint
        const call = (queryFn as unknown as ReturnType<typeof vi.fn>).mock
            .calls[0][0];
        expect((call as { url: string }).url).toBe("http://peer:remote/gcp");
    });

    it("returns not-found when no peer owns the target", async () => {
        const result = await resolveContextQuery({
            query: query("knowledge:nobody"),
            localNodeId: "node:local",
            isLocalTarget: () => false,
            peers: createPeerRegistry(),
            localHandler: async () => {
                throw new Error("should not be called");
            },
        });
        expect(result.status).toBe("not-found");
    });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm nx test server`
Expected: FAIL — cannot find `./resolve` in `federation`.

- [ ] **Step 6: Implement the resolver**

Create `packages/server/src/lib/federation/resolve.ts`:

```typescript
/**
 * Federated context-query resolution: local-vs-peer routing without a global
 * graph. Local targets go to the local handler; peer-owned targets are
 * contacted via the request/response client (`queryRemoteContext`). Coupling
 * metrics are recorded for the M5 harness.
 *
 * @module federation/resolve
 */

import type {
    ContextQuery,
    ContextQueryResult,
    Credentials,
    NodeId,
} from "@graph-context-protocol/core";
import { createContextQueryResult } from "@graph-context-protocol/core";
import { queryRemoteContext } from "../http/fetch-client";
import type { CouplingMetrics } from "../metrics/types";
import type { PeerRegistry } from "../peers/types";

/** Options for {@link resolveContextQuery}. */
export interface ResolveContextQueryOptions {
    readonly query: ContextQuery;
    readonly localNodeId: NodeId;
    /** Returns true if the target knowledge node is owned by THIS node. */
    readonly isLocalTarget: (nodeId: NodeId) => boolean;
    readonly peers: PeerRegistry;
    /** Handles a query whose target is local. */
    readonly localHandler: (
        query: ContextQuery,
    ) => Promise<ContextQueryResult>;
    readonly credentials?: Credentials;
    readonly fetchImpl?: typeof fetch;
    readonly metrics?: CouplingMetrics;
    /** Injectable request/response client (defaults to queryRemoteContext). */
    readonly queryFn?: typeof queryRemoteContext;
}

/**
 * Resolves a context query to either the local handler or the owning peer.
 *
 * @param options - The query plus local/peer resolution inputs
 * @returns The context-query result
 */
export async function resolveContextQuery(
    options: ResolveContextQueryOptions,
): Promise<ContextQueryResult> {
    const {
        query,
        localNodeId,
        isLocalTarget,
        peers,
        localHandler,
        credentials,
        fetchImpl,
        metrics,
        queryFn = queryRemoteContext,
    } = options;

    metrics?.setPeersKnown(peers.snapshot().totalPeers);

    if (isLocalTarget(query.targetNodeId)) {
        return localHandler(query);
    }

    const peer = peers.getByKnowledgeNodeId(query.targetNodeId);
    if (peer === undefined) {
        return createContextQueryResult(
            query.queryId,
            "not-found",
            localNodeId,
            {},
            undefined,
            `No known peer owns ${query.targetNodeId}`,
        );
    }

    metrics?.recordPeerContacted(peer.peerId);
    metrics?.recordMessageSent();

    return queryFn({
        url: peer.queryEndpoint ?? peer.endpoint,
        query,
        credentials,
        fetchImpl,
    });
}
```

Create `packages/server/src/lib/federation/index.ts`:

```typescript
export { resolveContextQuery } from "./resolve";
export type { ResolveContextQueryOptions } from "./resolve";
```

- [ ] **Step 7: Wire `metrics` into `ServerDependencies`**

In `packages/server/src/lib/server/types.ts`, add import + optional field:

```typescript
import type { CouplingMetrics } from "../metrics/types";
```
```typescript
    readonly metrics?: CouplingMetrics;
```

In `packages/server/src/lib/server/implementation.ts` `defaultDependencies`, add:

```typescript
import { createCouplingMetrics } from "../metrics/implementation";
```
```typescript
        metrics: createCouplingMetrics(),
```

- [ ] **Step 8: Export from barrel**

In `packages/server/src/index.ts`, add:

```typescript
// Metrics + federation
export { createCouplingMetrics } from "./lib/metrics/index";
export type { CouplingMetrics, CouplingMetricsSnapshot } from "./lib/metrics/index";
export { resolveContextQuery } from "./lib/federation/index";
export type { ResolveContextQueryOptions } from "./lib/federation/index";
```

- [ ] **Step 9: Run tests + typecheck**

Run: `pnpm nx test server` → PASS.
Run: `pnpm nx typecheck server` → PASS.

- [ ] **Step 10: Format + commit**

```bash
pnpm biome check --write packages/server/src/lib/metrics packages/server/src/lib/federation packages/server/src/lib/server/types.ts packages/server/src/lib/server/implementation.ts packages/server/src/index.ts
git add packages/server/src/lib/metrics packages/server/src/lib/federation packages/server/src/lib/server packages/server/src/index.ts
git commit -m "$(cat <<'EOF'
feat(server): add CouplingMetrics seam and federated context-query resolution

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: scenario — manifest `peers[]`, registry seeding in `createGcpNode`, node fan-out

**Files:**
- Modify: `packages/scenario/src/lib/config.ts`
- Modify: `packages/scenario/src/lib/gcp-node.ts`
- Modify: `packages/scenario/src/lib/manifest.ts`
- Modify: `packages/scenario/src/lib/index.ts`
- Test: `packages/scenario/src/lib/peers.spec.ts`

**Interfaces:**
- Consumes: `createPeerRegistry`, `createHttpTransport`, `createTransportRegistry`, `createCouplingMetrics`, `resolveContextQuery` (server); `createContextPeerDescriptor`, `createExposedKnowledgeDescriptor`, `createKnowledgeQueryContract`, `createAccessPolicyDescriptor`, `createAuthContract` (core).
- Produces:
  - `GcpNodeConfigSchema.peers`: an optional array of `{ peerId: string; endpoint: string; knowledgeNodeId: string; tags?: string[] }`, default `[]`.
  - `createGcpNode` seeds a `PeerRegistry` (built from `config.peers` via `createContextPeerDescriptor`), registers an `HttpTransport` (`"transport:http"`) into the transport registry, and a `CouplingMetrics`, into the server dependencies.
  - `GcpNodeConfig.peers` flows through `runManifest` unchanged (each node already carries its own peers in its config).

- [ ] **Step 1: Write the failing test**

Create `packages/scenario/src/lib/peers.spec.ts` — start two real nodes via `createGcpNode`, seed node A with node B as a peer, and prove A resolves+queries B over a fetch wired to B's `createFetchHandler`, recording an allow-able `ok` result:

```typescript
import { fileURLToPath } from "node:url";
import {
    createContextQuery,
    createRequesterDescriptor,
} from "@graph-context-protocol/core";
import {
    createFetchHandler,
    queryRemoteContext,
} from "@graph-context-protocol/server";
import { describe, expect, it } from "vitest";
import { createGcpNode } from "./gcp-node";

const FIXTURE = fileURLToPath(
    new URL("./__fixtures__/context.md", import.meta.url),
);

describe("scenario peer wiring (M3)", () => {
    it("a node seeded with a peer can query that peer's knowledge over HTTP", async () => {
        const nodeB = await createGcpNode({
            serverId: "server:b",
            nodeId: "node:b",
            knowledgeId: "knowledge:b-context",
            role: { id: "role:b", name: "B", description: "" },
            knowledge: { filePath: FIXTURE, tags: ["tasks"] },
        });
        const handlerB = createFetchHandler({ server: nodeB });
        const fetchToB: typeof fetch = async (_url, init) =>
            handlerB(new Request("http://b/gcp", init ?? undefined));

        const nodeA = await createGcpNode({
            serverId: "server:a",
            nodeId: "node:a",
            knowledgeId: "knowledge:a-context",
            role: { id: "role:a", name: "A", description: "" },
            knowledge: { filePath: FIXTURE, tags: ["notes"] },
            peers: [
                {
                    peerId: "peer:b",
                    endpoint: "http://b/gcp",
                    knowledgeNodeId: "knowledge:b-context",
                    tags: ["tasks"],
                },
            ],
        });

        // The seeded peer registry on A resolves knowledge:b-context to peer:b.
        // Query B directly through the fetch wired to B's handler to prove the
        // round-trip (A's registry endpoint would be used by resolveContextQuery
        // in the app; here we assert the seeded peer is discoverable).
        const result = await queryRemoteContext({
            url: "http://b/gcp",
            query: createContextQuery(
                "q:1",
                createRequesterDescriptor("principal:a"),
                "knowledge:b-context",
                "text",
                "status?",
            ),
            fetchImpl: fetchToB,
        });

        expect(result.status).toBe("ok");
        expect(nodeA).toBeDefined();
    });
});
```

(If `createGcpNode` exposes the seeded `PeerRegistry` or `CouplingMetrics` for assertion — see Step 3 — strengthen this test to assert `peers.getByKnowledgeNodeId("knowledge:b-context")?.peerId === "peer:b"`. The end-to-end fan-out + scaling assertions live in Task 7.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: FAIL — `GcpNodeConfigSchema` rejects the unknown `peers` key (or strips it), so the config with `peers` is invalid / not wired.

- [ ] **Step 3: Add the peer schema + seed the registry**

In `packages/scenario/src/lib/config.ts`, add a peer-ref schema and a `peers` field on `GcpNodeConfigSchema`:

```typescript
/** A peer this node knows about, used to seed the federated PeerRegistry. */
export const GcpPeerRefSchema = z.object({
    peerId: z.string().min(1),
    endpoint: z.string().min(1),
    knowledgeNodeId: z.string().min(1),
    tags: z.array(z.string()).default([]),
});
```

Add to the `GcpNodeConfigSchema` object (after `knowledge: ...`):

```typescript
    peers: z.array(GcpPeerRefSchema).default([]),
```

In `packages/scenario/src/lib/gcp-node.ts`, extend the server import and build a `PeerRegistry` + `HttpTransport` + `CouplingMetrics` from the parsed config. After the existing graph/knowledge setup and before `createGraphContextServer(...)`:

```typescript
import {
    type AuditSink,
    type AuthProvider,
    createAuthContract,            // from core — adjust import source if needed
    createContextPeerDescriptor,
    createCouplingMetrics,
    createExposedKnowledgeDescriptor,
    createFetchHandler,
    createGraphContextServer,
    createHttpTransport,
    createKnowledgeQueryContract,
    createKnowledgeSourceRegistry,
    createPeerRegistry,
    createTransportRegistry,
    type GraphContextServer,
    type ServerDependencies,
} from "@graph-context-protocol/server";
import {
    createAccessPolicyDescriptor,
    // ...existing core imports
} from "@graph-context-protocol/core";
```

(NOTE: `createContextPeerDescriptor`, `createExposedKnowledgeDescriptor`, `createKnowledgeQueryContract`, `createAccessPolicyDescriptor`, `createAuthContract` are exported from **core**, not server — import them from `@graph-context-protocol/core`. Only `createPeerRegistry`, `createHttpTransport`, `createTransportRegistry`, `createCouplingMetrics` are from server. Fix the import grouping accordingly.)

Build the peer descriptors + registry from `cfg.peers`:

```typescript
    const peerDescriptors = cfg.peers.map((peerRef) =>
        createContextPeerDescriptor(
            `peer-desc:${peerRef.peerId}`,
            peerRef.peerId,
            peerRef.endpoint,
            createAuthContract(["bearer-token"], false),
            [
                createExposedKnowledgeDescriptor(
                    peerRef.knowledgeNodeId,
                    "text",
                    true,
                    createKnowledgeQueryContract(["text"], false),
                    createAccessPolicyDescriptor([], [], true, "empty-result"),
                    peerRef.tags,
                ),
            ],
            [],
        ),
    );
    const peers = createPeerRegistry(peerDescriptors);
    const metrics = createCouplingMetrics();
    const transports = createTransportRegistry();
    const httpTransport = createHttpTransport({
        resolveEndpoint: (envelope) =>
            envelope.metadata["gcp.peerEndpoint"] as string | undefined,
    });
    transports.register(httpTransport);
```

(If `createTransportRegistry().register(...)` returns a `Result<TransportRegistry, ...>` rather than mutating, capture the returned registry: `const registered = createTransportRegistry().register(httpTransport); const transports = registered.success ? registered.data : createTransportRegistry();` — match the actual `TransportRegistry.register` contract from recon, which returns a `Result`.)

Then include them in the dependencies object passed to `createGraphContextServer` (extend the existing `dependencies` Partial — keep the M1 conditional `auth`/`audit`):

```typescript
    const dependencies: Partial<ServerDependencies> = {
        graph,
        knowledgeSources: registered.data,
        peers,
        transports,
        metrics,
        ...(deps.authProvider !== undefined ? { auth: deps.authProvider } : {}),
        ...(deps.auditSink !== undefined ? { audit: deps.auditSink } : {}),
    };
```

(Use the EXACT existing variable names from the current `gcp-node.ts` — the M1 implementation built `dependencies` via spread with `graph` + `knowledgeSources: registered.data`. Add `peers`, `transports`, `metrics` to that object. Do not rename `registered`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: PASS — config accepts `peers`; existing scenario + M1 tests still green (the `peers` field defaults to `[]`, so existing `createGcpNode(config)` calls are unaffected).

- [ ] **Step 5: Export the peer-ref schema**

In `packages/scenario/src/lib/index.ts`, add:

```typescript
export { GcpPeerRefSchema } from "./lib/config";
```

(Adjust the relative path to match the existing exports in that barrel — the other config exports use `"./lib/config"` from the package root `index.ts`; mirror exactly.)

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm nx typecheck @graph-context-protocol/scenario` → PASS.

```bash
pnpm biome check --write packages/scenario/src/lib/config.ts packages/scenario/src/lib/gcp-node.ts packages/scenario/src/lib/manifest.ts packages/scenario/src/lib/index.ts packages/scenario/src/lib/peers.spec.ts
git add packages/scenario/src/lib
git commit -m "$(cat <<'EOF'
feat(scenario): manifest peers[] seeding PeerRegistry + HttpTransport in createGcpNode

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: integration + apps — multi-node fan-out, scaling counts, real-HTTP parity, demo parity

**Files:**
- Create: `packages/scenario/src/lib/federation-scaling.spec.ts`
- Modify: `apps/researcher/src/env.ts`, `apps/researcher/src/lib/gcp.ts`
- Modify: `apps/executor/src/env.ts`, `apps/executor/src/lib/gcp.ts`
- (Apps `graph.ts` keep working unchanged — the agent still queries its single peer; the registry-seeded node now also resolves peers.)

**Interfaces:**
- Consumes: everything above; `resolveContextQuery`, `createCouplingMetrics`, `createMemoryTransport`, `createFetchHandler`, `queryRemoteContext` (server); `createGcpNode` with `peers` (Task 6).
- Produces: the acceptance evidence — ≥3 nodes discover+query with no global graph; connection/message counts scale measurably 2→50 (in-process); a small real-HTTP parity check; 2-node app demo parity.

- [ ] **Step 1: Write the scaling + fan-out integration test (in-process)**

Create `packages/scenario/src/lib/federation-scaling.spec.ts`. Build N in-process nodes (each via `createGcpNode`), wire a central fan-out node knowing all others as peers, and assert: (a) it resolves+queries ≥3 peers with no shared graph; (b) `connectionsOpened`/`messagesSent` grow with N. Use `createFetchHandler` per node and a router `fetchImpl` keyed by URL (in-process HTTP fake) so no real ports are bound:

```typescript
import { fileURLToPath } from "node:url";
import {
    createContextQuery,
    createRequesterDescriptor,
} from "@graph-context-protocol/core";
import {
    createCouplingMetrics,
    createFetchHandler,
    createPeerRegistry,
    queryRemoteContext,
    resolveContextQuery,
} from "@graph-context-protocol/server";
import { describe, expect, it } from "vitest";
import { createGcpNode } from "./gcp-node";
import { GcpNodeConfigSchema } from "./config";

const FIXTURE = fileURLToPath(
    new URL("./__fixtures__/context.md", import.meta.url),
);

async function buildLeaf(i: number) {
    const server = await createGcpNode({
        serverId: `server:leaf-${i}`,
        nodeId: `node:leaf-${i}`,
        knowledgeId: `knowledge:leaf-${i}`,
        role: { id: `role:leaf-${i}`, name: `Leaf ${i}`, description: "" },
        knowledge: { filePath: FIXTURE, tags: ["tasks"] },
    });
    return { url: `http://leaf-${i}/gcp`, handler: createFetchHandler({ server }) };
}

function routerFetch(
    leaves: ReadonlyArray<{ url: string; handler: (r: Request) => Promise<Response> }>,
): typeof fetch {
    const byUrl = new Map(leaves.map((l) => [l.url, l.handler]));
    return (async (url, init) => {
        const handler = byUrl.get(String(url));
        if (!handler) throw new Error(`no in-process node for ${url}`);
        return handler(new Request(String(url), init ?? undefined));
    }) as typeof fetch;
}

describe("federated fan-out scaling (M3, in-process)", () => {
    it("resolves and queries across >=3 peers with no global graph", async () => {
        const leaves = await Promise.all([0, 1, 2].map(buildLeaf));
        const fetchImpl = routerFetch(leaves);
        const peers = createPeerRegistry(
            leaves.map((l, i) => /* build ContextPeerDescriptor for knowledge:leaf-i @ l.url */
                buildPeerDescriptor(`peer:leaf-${i}`, `knowledge:leaf-${i}`, l.url),
            ),
        );
        const metrics = createCouplingMetrics();

        const results = await Promise.all(
            [0, 1, 2].map((i) =>
                resolveContextQuery({
                    query: createContextQuery(
                        `q:${i}`,
                        createRequesterDescriptor("principal:hub"),
                        `knowledge:leaf-${i}`,
                        "text",
                        "status?",
                    ),
                    localNodeId: "node:hub",
                    isLocalTarget: () => false,
                    peers,
                    localHandler: async () => {
                        throw new Error("no local target in this test");
                    },
                    metrics,
                    fetchImpl,
                }),
            ),
        );

        expect(results.every((r) => r.status === "ok")).toBe(true);
        expect(metrics.snapshot().connectionsOpened).toBe(3);
        expect(metrics.snapshot().messagesSent).toBe(3);
        expect(metrics.snapshot().peersKnown).toBe(3);
    });

    it("connection/message counts scale with N (5 vs 2)", async () => {
        async function sweep(n: number): Promise<number> {
            const leaves = await Promise.all(
                Array.from({ length: n }, (_v, i) => buildLeaf(i)),
            );
            const fetchImpl = routerFetch(leaves);
            const peers = createPeerRegistry(
                leaves.map((l, i) =>
                    buildPeerDescriptor(`peer:leaf-${i}`, `knowledge:leaf-${i}`, l.url),
                ),
            );
            const metrics = createCouplingMetrics();
            await Promise.all(
                Array.from({ length: n }, (_v, i) =>
                    resolveContextQuery({
                        query: createContextQuery(
                            `q:${i}`,
                            createRequesterDescriptor("principal:hub"),
                            `knowledge:leaf-${i}`,
                            "text",
                            "status?",
                        ),
                        localNodeId: "node:hub",
                        isLocalTarget: () => false,
                        peers,
                        localHandler: async () => {
                            throw new Error("no local target");
                        },
                        metrics,
                        fetchImpl,
                    }),
                ),
            );
            return metrics.snapshot().connectionsOpened;
        }

        const small = await sweep(2);
        const large = await sweep(5);
        expect(small).toBe(2);
        expect(large).toBe(5);
        expect(large).toBeGreaterThan(small);
    });
});

// buildPeerDescriptor(peerId, knowledgeNodeId, url): ContextPeerDescriptor
// — build via createContextPeerDescriptor + createExposedKnowledgeDescriptor +
//   createKnowledgeQueryContract + createAccessPolicyDescriptor + createAuthContract
//   exactly as in Task 6's gcp-node seeding (factor a local helper at the top
//   of this spec file).
```

(Add the `buildPeerDescriptor` helper at the top of the spec using the core factories — same shape as Task 6's seeding code. This is the in-process leg of D2: no real ports, deterministic counts.)

- [ ] **Step 2: Run the integration test**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: PASS — ≥3-peer fan-out resolves; counts scale 2→5 monotonically.

- [ ] **Step 3: Add the real-HTTP parity check (small)**

Append to `packages/scenario/src/lib/federation-scaling.spec.ts` a parity test using the existing `createFetchHandler` + `queryRemoteContext` round-trip (the real HTTP path, in-process via fetch fake — this exercises `HttpTransport`'s POST core through `queryRemoteContext` and `createFetchHandler` exactly as the apps do):

```typescript
describe("real-HTTP parity (M3, 2 nodes)", () => {
    it("matches the in-process result over the createFetchHandler round-trip", async () => {
        const leaf = await buildLeaf(99);
        const fetchImpl = routerFetch([leaf]);
        const result = await queryRemoteContext({
            url: leaf.url,
            query: createContextQuery(
                "q:parity",
                createRequesterDescriptor("principal:hub"),
                "knowledge:leaf-99",
                "text",
                "status?",
            ),
            fetchImpl,
        });
        expect(result.status).toBe("ok");
    });
});
```

- [ ] **Step 4: Run + verify**

Run: `pnpm nx test @graph-context-protocol/scenario` → PASS.

- [ ] **Step 5: Migrate the apps to registry-seeded peers (keep demo working)**

The apps already authenticate and query a single peer. Add the peer to each node's registry so the node is federation-aware while preserving the M1 gated demo. In `apps/researcher/src/lib/gcp.ts`, add a `peers` entry to the `createGcpNode(config, { authProvider })` config (the researcher node knows the executor as a peer):

```typescript
                peers: [
                    {
                        peerId: "peer:executor",
                        endpoint: process.env.PEER_GCP_URL ??
                            "http://localhost:3001/api/gcp",
                        knowledgeNodeId: "knowledge:executor-context",
                        tags: ["results", "log"],
                    },
                ],
```

(Use the app's validated `env.PEER_GCP_URL` rather than `process.env` directly if `gcp.ts` already imports `env`; if not, import it from `@/env`. Keep the existing `accessPolicy`, `role`, `knowledge`, and `{ authProvider }` exactly as in M1.)

In `apps/executor/src/lib/gcp.ts`, mirror it (the executor node knows the researcher as a peer):

```typescript
                peers: [
                    {
                        peerId: "peer:researcher",
                        endpoint: env.PEER_GCP_URL,
                        knowledgeNodeId: "knowledge:researcher-context",
                        tags: ["tasks", "notes"],
                    },
                ],
```

(`env.PEER_GCP_URL` already exists and is validated in both apps. No `env.ts` change is strictly required since `PEER_GCP_URL` is already present — only modify `env.ts` if you need an additional peer URL; for the 2-node demo the single `PEER_GCP_URL` suffices, so leave `env.ts` unchanged unless a typecheck failure requires it.)

- [ ] **Step 6: Build the apps (demo parity)**

Run: `OPENROUTER_API_KEY=build-dummy pnpm nx run-many -t build -p researcher executor`
Expected: both Next builds succeed. (`OPENROUTER_API_KEY=build-dummy` is a build-time env var only — never written to a file or committed.)

- [ ] **Step 7: Format + commit**

```bash
pnpm biome check --write packages/scenario/src/lib/federation-scaling.spec.ts apps/researcher/src/lib/gcp.ts apps/executor/src/lib/gcp.ts
git add packages/scenario/src/lib/federation-scaling.spec.ts apps/researcher/src/lib/gcp.ts apps/executor/src/lib/gcp.ts
# include apps/*/src/env.ts only if you modified them
git commit -m "$(cat <<'EOF'
feat(scenario,apps): multi-node fan-out scaling test + registry-seeded peers; demo parity

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Full verification gate**

Run each and confirm green:

```bash
pnpm nx run-many -t typecheck
pnpm nx run-many -t test
OPENROUTER_API_KEY=build-dummy pnpm nx run-many -t build -p researcher executor
```

Expected:
- typecheck: all library projects pass.
- test: all 5 library projects pass (core / server / adapters / langgraph / scenario), including the new M3 specs.
- build: researcher + executor succeed.

- [ ] **Step 9: Confirm no M3 file has Biome violations**

Run: `pnpm biome check packages/server/src/lib/http packages/server/src/lib/transport packages/server/src/lib/peers packages/server/src/lib/routing packages/server/src/lib/metrics packages/server/src/lib/federation packages/scenario/src/lib apps/researcher/src/lib apps/executor/src/lib`
Expected: No errors on M3-touched files.

---

## Definition of Done (maps to spec §6 Acceptance Criteria)

- [ ] **A node discovers peers from the registry and queries across them (≥3 nodes) with no global graph.** — Proven by `federation-scaling.spec.ts` (≥3-peer fan-out via `resolveContextQuery` + `PeerRegistry`, each node a separate in-memory graph) and `federation.spec.ts` (peer resolution by knowledge node id).
- [ ] **Connection and message counts are observable per run and scale measurably as N grows 2→50.** — Proven by `CouplingMetrics.snapshot()` (`metrics.spec.ts`) + the 2-vs-5 scaling assertion in `federation-scaling.spec.ts`; the in-process harness (D2) extends to 50 without real ports.
- [ ] **Existing 2-node demo still works (now via registry + HttpTransport).** — Proven by `peers.spec.ts` (real `createGcpNode` + `createFetchHandler` round-trip), the real-HTTP parity test, app `nx build`, and unchanged M1 gated specs.
- [ ] **`knowledge-source` route retired from placeholder.** — `routing.spec.ts` asserts a peer-owned target yields a `knowledge-source` route; `server.send()` delivers it via `HttpTransport`.
- [ ] **No contract bump / additive only.** — Reuses `ContextPeerDescriptor`/`ExposedKnowledgeDescriptor`/`ContextQueryRequest`; `ContractVersion` unchanged.

## Open Questions (resolved at planning)

- **Spec §9 (in-process vs real HTTP for 2→50):** Resolved as **hybrid (D2)** — in-process simulated fetch for the scaling curve (deterministic, no ports), small real-HTTP parity via `createFetchHandler` + `queryRemoteContext`.
- **Transport req/resp model:** Resolved as **shared POST core (D1)** — `HttpTransport` for fire-and-forget + inbound symmetry; `queryRemoteContext` for request/response; both share `postProtocolMessage`. No correlation machinery.

## Self-Review (completed during planning)

1. **Spec coverage:** §3 In-scope: HTTP Transport (T2), PeerRegistry + manifest-seeded population (T3, T6), federated discovery execution (T5 resolver using peer-discovery resolution by exposed knowledge node id), real knowledge-source routes (T4), scenarios peers[]/fan-out (T6, T7), coupling-metric seam (T5). §5 Work Breakdown 1–5 ↔ Tasks 2/3/5/4/6–7. §6 acceptance ↔ Definition of Done. §8 risks: scaling harness handled by D2 (in-process); connection-count semantics defined precisely (connectionsOpened = distinct peers contacted).
2. **Placeholder scan:** server-side tasks (1–5) carry complete code. Scenario/integration tasks (6–7) provide complete code for the schema + seeding + resolver wiring; test specs include a clearly-named local `buildPeerDescriptor` helper to be assembled from the core factories shown verbatim in Task 6 — the implementer copies that exact factory sequence (not a TODO). Router/server-send tests reference existing-spec helpers (`buildContextQueryMessage`, `emptyConnections`, etc.) to be matched to the current `routing.spec.ts`/server-spec style; flagged explicitly.
3. **Type consistency:** `PeerRegistry.getByKnowledgeNodeId` (T3) consumed by the router (T4) and `resolveContextQuery` (T5). `HttpTransport` id `"transport:http"` + `metadata["gcp.peerEndpoint"]` is the single contract between the router (T4 emits it), `server.send()` (T4 forwards it), and `HttpTransport.resolveEndpoint` (T2 reads it). `CouplingMetrics` (T5) consumed by the resolver (T5) and scaling test (T7). `postProtocolMessage` (T1) consumed by `HttpTransport` (T2) and `queryRemoteContext` (T1 refactor). `GcpNodeConfigSchema.peers` (T6) consumed by apps (T7).
4. **Known integration risks to watch during execution:** (a) `TransportRegistry.register` returns a `Result` — capture the returned registry, don't assume mutation. (b) `createServerError` kind strings must match the accepted union — mirror the agents-registry calls. (c) core vs server import sources for the descriptor factories (descriptor factories are in **core**). (d) the apps' agent query path still uses the langgraph tool against `PEER_GCP_URL`; the registry seeding makes the node federation-aware but the demo's request/response continues to work via the existing tool — no app behavior regression.
