# Wire researcher & executor apps as GCP nodes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the `researcher` and `executor` Next.js apps as two independently-owned GCP nodes that read each other's `CONTEXT-1.md` knowledge over HTTP via the read-first `context-query` protocol, observable as a tool-call in the chat UI.

**Architecture:** Add Web-standard HTTP helpers to `@gcp/server` (`createFetchHandler` server side, `queryRemoteContext` client side). Add a new `@gcp/adapters` package with a markdown-file `KnowledgeSourceAdapter`. Add a `createContextQueryTool` LangChain tool to `@gcp/langgraph`. Each app starts a `GraphContextServer` exposing its `CONTEXT-1.md` knowledge node (open read policy, allow-all auth) at `POST /api/gcp`, and its LangGraph agent gets a tool that queries the peer node.

**Tech Stack:** TypeScript (strict), Nx 22, pnpm workspace, Vitest 4, Biome 2, Zod, Next.js 16, LangChain/LangGraph, `@graph-context-protocol/{core,server,adapters,langgraph}`.

---

## Reference: confirmed API shapes (from reading the codebase)

These exist today — use them exactly:

- `createGraphContextServer(config: ServerConfig, deps?: Partial<ServerDependencies>)` → `GraphContextServer`. Default deps already include `auth: createAllowAllAuthProvider()`. Must pass `{ graph, knowledgeSources }`.
- `server.start(): Promise<Result<ServerSnapshot, ServerError>>`, `server.receive(envelope: InboundMessageEnvelope): Promise<Result<unknown, ServerError>>`. `receive` requires status `ready`.
- `InboundMessageEnvelope` = `{ transportId, connectionId?, sessionId?, payload, receivedAt, metadata }`.
- `HandlerResult` = `{ handled, response?: ProtocolMessage, notifications?, metadata }`. The context-query handler puts the `context-query-response` ProtocolMessage in `.response`.
- The `context-query` handler reads credentials from `message.header.metadata["gcp.credentials"]` (or inbound metadata). Allow-all auth accepts any `{ type, value }` credential.
- `executeTargetedContextQuery` resolves the adapter via `registry.get(query.targetNodeId)` — **the adapter `id` MUST equal the target knowledge node id**. It returns `result.result = knowledgeResult.raw ?? knowledgeResult.nodes`.
- Core factories: `createRole(id, name, desc, caps[], rules[])`, `createCapability`, `createAgentNode(id, role, metadata?)`, `createKnowledgeNode(id, role, metadata?)`, `createGraph(id).addNode(node).addNode(node)` (chainable, immutable).
- `createAccessPolicyDescriptor(readableByRoles[], requiredCapabilities[], fallbackAllowed: boolean, denialMode, metadata?)`. `denialMode ∈ {"error","empty-result","fallback-if-allowed"}`. Open read = `([], [], true, "empty-result")`.
- `createMetadataWithAccessPolicy(policy, baseMetadata?)` → node metadata embedding the policy under key `gcp.accessPolicy`. **A knowledge node WITHOUT this metadata is denied** by `authorizeKnowledgeNodeAccess`.
- `createContextQuery(queryId, requester, targetNodeId, mode, query, metadata?, filters?)`, `createRequesterDescriptor(principalId, roles?, capabilities?, metadata?)`.
- `createMessageHeader(messageId, source, target, type, options?)` — `type` includes `"context-query"`; `options.metadata` lands on `header.metadata`. `createProtocolMessage(header, context: GraphContext, payload)`.
- `GraphContext` = `{ id, graphId, currentNode, accumulatedData, role, metadata, createdAt, path }`.
- `Result<T,E>` helpers: `succeed(data)`, `fail(error)`. Server errors: `createServerError(code, message, opts?)`; codes include `"not-found"`, `"transport-error"`, etc.
- `KnowledgeSourceAdapter` = `{ id, capabilities: KnowledgeCapability[], query(req): Promise<Result<KnowledgeQueryResult, ServerError>>, get?, sync?, health? }`. `KnowledgeQueryResult` = `{ sourceId, nodes: KnowledgeNode[], raw?, metadata: Metadata }`.
- `@gcp/langgraph` already exports `createOpenRouterLLM({ model, temperature, ... })`. App env exposes `env.OPENROUTER_MODEL`.

Node id conventions used throughout this plan:
- researcher: server `server:researcher`, local node `node:researcher`, knowledge node + adapter id `knowledge:researcher-context`, file `apps/researcher/CONTEXT-1.md`.
- executor: server `server:executor`, local node `node:executor`, knowledge node + adapter id `knowledge:executor-context`, file `apps/executor/CONTEXT-1.md`.
- researcher's peer tool targets `knowledge:executor-context`; executor's peer tool targets `knowledge:researcher-context`.

---

## Task 1: `queryRemoteContext` client helper in `@gcp/server`

**Files:**
- Create: `packages/server/src/lib/http/fetch-client.ts`
- Test: `packages/server/src/lib/http/fetch-client.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/lib/http/fetch-client.spec.ts
import {
    createContextQuery,
    createContextQueryResult,
    createMessageHeader,
    createProtocolMessage,
    createRequesterDescriptor,
    createRole,
} from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import { queryRemoteContext } from "./fetch-client.js";

function buildQuery() {
    const requester = createRequesterDescriptor("principal:test", [], []);
    return createContextQuery(
        "query:1",
        requester,
        "knowledge:peer",
        "text",
        "what happened today?",
    );
}

function fakeResponseMessage() {
    const result = createContextQueryResult(
        "query:1",
        "ok",
        "knowledge:peer",
        {},
        "TODAY: shipped feature X",
    );
    const header = createMessageHeader(
        "msg:1:response",
        "node:peer",
        "node:client",
        "context-query-response",
    );
    const ctx = {
        id: "ctx:1",
        graphId: "graph:x",
        currentNode: "node:peer",
        accumulatedData: {},
        role: createRole("role:x", "X", ""),
        metadata: {},
        createdAt: "2026-06-02T00:00:00.000Z",
        path: [],
    };
    return createProtocolMessage(header, ctx, result);
}

describe("queryRemoteContext", () => {
    it("posts a context-query message and returns the response payload", async () => {
        const fetchImpl = vi.fn(async () =>
            new Response(JSON.stringify(fakeResponseMessage()), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );

        const result = await queryRemoteContext({
            url: "http://peer.test/api/gcp",
            query: buildQuery(),
            fetchImpl,
        });

        expect(fetchImpl).toHaveBeenCalledOnce();
        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe("http://peer.test/api/gcp");
        expect(init?.method).toBe("POST");
        const sentBody = JSON.parse(init?.body as string);
        expect(sentBody.header.type).toBe("context-query");
        expect(sentBody.header.metadata["gcp.credentials"]).toEqual({
            type: "anonymous",
            value: "anonymous",
        });
        expect(result.status).toBe("ok");
        expect(result.result).toBe("TODAY: shipped feature X");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/server/src/lib/http/fetch-client.spec.ts`
Expected: FAIL — cannot find module `./fetch-client.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/server/src/lib/http/fetch-client.ts
/**
 * Web-standard client helper for issuing a remote context-query over HTTP.
 *
 * @module http/fetch-client
 */

import {
    type ContextQuery,
    type ContextQueryResult,
    createMessageHeader,
    createProtocolMessage,
    createRole,
    type GraphContext,
} from "@graph-context-protocol/core";
import type { Credentials } from "../auth/types.js";

const ANONYMOUS_CREDENTIALS: Credentials = {
    type: "anonymous",
    value: "anonymous",
};

/**
 * Options for {@link queryRemoteContext}.
 */
export interface QueryRemoteContextOptions {
    /** Absolute URL of the peer's context-query endpoint. */
    readonly url: string;
    /** The context query to send (build with `createContextQuery`). */
    readonly query: ContextQuery;
    /** Credentials placed under `gcp.credentials`. Defaults to anonymous. */
    readonly credentials?: Credentials;
    /** Injectable fetch for testing. Defaults to global `fetch`. */
    readonly fetchImpl?: typeof fetch;
}

/**
 * Sends a `context-query` ProtocolMessage to a peer node and returns the
 * `ContextQueryResult` payload of the response.
 *
 * @throws Error if the peer responds with a non-2xx status or unparseable body.
 */
export async function queryRemoteContext(
    options: QueryRemoteContextOptions,
): Promise<ContextQueryResult> {
    const { url, query } = options;
    const credentials = options.credentials ?? ANONYMOUS_CREDENTIALS;
    const doFetch = options.fetchImpl ?? fetch;

    const header = createMessageHeader(
        `msg:${query.queryId}`,
        query.requester.principalId,
        query.targetNodeId,
        "context-query",
        { metadata: { "gcp.credentials": credentials } },
    );

    const context: GraphContext = {
        id: `ctx:${query.queryId}`,
        graphId: "graph:remote-query",
        currentNode: query.requester.principalId,
        accumulatedData: {},
        role: createRole("role:remote-requester", "Remote Requester", ""),
        metadata: {},
        createdAt: new Date().toISOString(),
        path: [],
    };

    const message = createProtocolMessage(header, context, query);

    const response = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
    });

    if (!response.ok) {
        throw new Error(
            `Remote context query failed: ${response.status} ${response.statusText}`,
        );
    }

    const responseMessage = (await response.json()) as { payload?: unknown };
    return responseMessage.payload as ContextQueryResult;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/server/src/lib/http/fetch-client.spec.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/lib/http/fetch-client.ts packages/server/src/lib/http/fetch-client.spec.ts
git commit -m "feat(server): add queryRemoteContext HTTP client helper"
```

---

## Task 2: `createFetchHandler` server helper in `@gcp/server`

**Files:**
- Create: `packages/server/src/lib/http/fetch-handler.ts`
- Test: `packages/server/src/lib/http/fetch-handler.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/server/src/lib/http/fetch-handler.spec.ts
import {
    createAccessPolicyDescriptor,
    createAgentNode,
    createContextQuery,
    createGraph,
    createKnowledgeNode,
    createMessageHeader,
    createMetadataWithAccessPolicy,
    createProtocolMessage,
    createRequesterDescriptor,
    createRole,
    type GraphContext,
    succeed,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { createKnowledgeSourceRegistry } from "../knowledge/implementation.js";
import type { KnowledgeSourceAdapter } from "../knowledge/types.js";
import { createGraphContextServer } from "../server/implementation.js";
import { createFetchHandler } from "./fetch-handler.js";

const KNOWLEDGE_ID = "knowledge:peer";

function stubAdapter(): KnowledgeSourceAdapter {
    return {
        id: KNOWLEDGE_ID,
        capabilities: ["lookup"],
        async query() {
            return succeed({
                sourceId: KNOWLEDGE_ID,
                nodes: [],
                raw: "STUB CONTEXT TEXT",
                metadata: {},
            });
        },
    };
}

async function startServer() {
    const role = createRole("role:peer", "Peer", "");
    const policy = createAccessPolicyDescriptor([], [], true, "empty-result");
    const knowledge = createKnowledgeNode(
        KNOWLEDGE_ID,
        role,
        createMetadataWithAccessPolicy(policy, { contentType: "text/markdown" }),
    );
    const graph = createGraph("graph:peer")
        .addNode(createAgentNode("node:peer", role))
        .addNode(knowledge);
    const registry = createKnowledgeSourceRegistry().register(stubAdapter());
    const knowledgeSources = registry.success ? registry.data : registry;

    const server = createGraphContextServer(
        { id: "server:peer", localNodeId: "node:peer", shutdownTimeoutMs: 30000 },
        { graph, knowledgeSources: knowledgeSources as never },
    );
    await server.start();
    return server;
}

function buildRequest(): Request {
    const requester = createRequesterDescriptor("principal:test", [], []);
    const query = createContextQuery(
        "query:1",
        requester,
        KNOWLEDGE_ID,
        "text",
        "hello",
    );
    const header = createMessageHeader(
        "msg:1",
        "principal:test",
        KNOWLEDGE_ID,
        "context-query",
        { metadata: { "gcp.credentials": { type: "anonymous", value: "anonymous" } } },
    );
    const ctx: GraphContext = {
        id: "ctx:1",
        graphId: "graph:client",
        currentNode: "principal:test",
        accumulatedData: {},
        role: createRole("role:client", "Client", ""),
        metadata: {},
        createdAt: "2026-06-02T00:00:00.000Z",
        path: [],
    };
    const message = createProtocolMessage(header, ctx, query);
    return new Request("http://peer.test/api/gcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
    });
}

describe("createFetchHandler", () => {
    it("dispatches a context-query and returns the response message as JSON", async () => {
        const server = await startServer();
        const handler = createFetchHandler({ server });

        const response = await handler(buildRequest());

        expect(response.status).toBe(200);
        const body = (await response.json()) as { payload: { status: string; result: unknown } };
        expect(body.payload.status).toBe("ok");
        expect(body.payload.result).toBe("STUB CONTEXT TEXT");
    });

    it("returns 400 for an unparseable body", async () => {
        const server = await startServer();
        const handler = createFetchHandler({ server });
        const response = await handler(
            new Request("http://peer.test/api/gcp", { method: "POST", body: "not json" }),
        );
        expect(response.status).toBe(400);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/server/src/lib/http/fetch-handler.spec.ts`
Expected: FAIL — cannot find module `./fetch-handler.js`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/server/src/lib/http/fetch-handler.ts
/**
 * Web-standard request handler that bridges HTTP into a GraphContextServer.
 *
 * @module http/fetch-handler
 */

import type { ProtocolMessage } from "@graph-context-protocol/core";
import type { GraphContextServer } from "../server/types.js";
import type { InboundMessageEnvelope } from "../types.js";

/**
 * Options for {@link createFetchHandler}.
 */
export interface FetchHandlerOptions {
    /** A started GraphContextServer to dispatch inbound messages to. */
    readonly server: GraphContextServer;
    /** Transport id stamped on the inbound envelope. Defaults to "fetch". */
    readonly transportId?: string;
}

/**
 * Creates a `(Request) => Promise<Response>` handler that parses a
 * ProtocolMessage from the request body, dispatches it through
 * `server.receive`, and serializes the handler's response message as JSON.
 */
export function createFetchHandler(
    options: FetchHandlerOptions,
): (request: Request) => Promise<Response> {
    const { server } = options;
    const transportId = options.transportId ?? "fetch";

    return async (request: Request): Promise<Response> => {
        let message: ProtocolMessage;
        try {
            message = (await request.json()) as ProtocolMessage;
        } catch {
            return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        if (message?.header === undefined || message?.header?.type === undefined) {
            return jsonResponse({ error: "Body is not a ProtocolMessage" }, 400);
        }

        const envelope: InboundMessageEnvelope = {
            transportId,
            payload: message,
            receivedAt: new Date().toISOString(),
            metadata: {},
        };

        const result = await server.receive(envelope);

        if (!result.success) {
            return jsonResponse(
                { error: result.error.message, code: result.error.code },
                500,
            );
        }

        const handlerResult = result.data as { response?: ProtocolMessage };
        if (handlerResult?.response === undefined) {
            return jsonResponse({ error: "No response produced" }, 502);
        }

        return jsonResponse(handlerResult.response, 200);
    };
}

function jsonResponse(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run packages/server/src/lib/http/fetch-handler.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/lib/http/fetch-handler.ts packages/server/src/lib/http/fetch-handler.spec.ts
git commit -m "feat(server): add createFetchHandler HTTP request bridge"
```

---

## Task 3: Export HTTP helpers from `@gcp/server` public API

**Files:**
- Modify: `packages/server/src/index.ts` (add exports near the Transport section)

- [ ] **Step 1: Add the exports**

Add these lines to `packages/server/src/index.ts` (place after the `// Transport abstraction` export block):

```typescript
// HTTP helpers
export { createFetchHandler } from "./lib/http/fetch-handler.js";
export type { FetchHandlerOptions } from "./lib/http/fetch-handler.js";
export { queryRemoteContext } from "./lib/http/fetch-client.js";
export type { QueryRemoteContextOptions } from "./lib/http/fetch-client.js";
```

- [ ] **Step 2: Verify the package type-checks and builds**

Run: `pnpm exec nx run @graph-context-protocol/server:typecheck`
Expected: PASS (no type errors). If the project name differs, run `pnpm exec nx show projects | grep server` to find it.

- [ ] **Step 3: Run the server test suite**

Run: `pnpm exec nx test @graph-context-protocol/server`
Expected: PASS (all existing tests + the 3 new ones).

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): export HTTP fetch handler and client from public API"
```

---

## Task 4: New `@graph-context-protocol/adapters` package + markdown adapter

**Files:**
- Create: `packages/adapters/package.json`
- Create: `packages/adapters/tsconfig.json`
- Create: `packages/adapters/tsconfig.lib.json`
- Create: `packages/adapters/tsconfig.spec.json`
- Create: `packages/adapters/vitest.config.mts`
- Create: `packages/adapters/src/index.ts`
- Create: `packages/adapters/src/lib/markdown-adapter.ts`
- Create: `packages/adapters/src/lib/markdown-adapter.spec.ts`
- Create: `packages/adapters/src/lib/__fixtures__/sample.md`

- [ ] **Step 1: Scaffold the package config files**

`packages/adapters/package.json`:
```json
{
    "name": "@graph-context-protocol/adapters",
    "version": "0.0.1",
    "private": true,
    "type": "module",
    "main": "./src/index.ts",
    "types": "./src/index.ts",
    "exports": {
        ".": {
            "types": "./src/index.ts",
            "import": "./src/index.ts",
            "default": "./src/index.ts"
        },
        "./package.json": "./package.json"
    },
    "dependencies": {
        "@graph-context-protocol/core": "workspace:*",
        "@graph-context-protocol/server": "workspace:*"
    }
}
```

`packages/adapters/tsconfig.json`:
```json
{
    "extends": "../../tsconfig.base.json",
    "files": [],
    "include": [],
    "references": [
        { "path": "./tsconfig.lib.json" },
        { "path": "./tsconfig.spec.json" }
    ]
}
```

`packages/adapters/tsconfig.lib.json`:
```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "baseUrl": ".",
        "rootDir": "src",
        "outDir": "dist",
        "tsBuildInfoFile": "dist/tsconfig.lib.tsbuildinfo",
        "emitDeclarationOnly": true,
        "forceConsistentCasingInFileNames": true,
        "types": ["node"]
    },
    "include": ["src/**/*.ts"],
    "references": [
        { "path": "../core/tsconfig.lib.json" },
        { "path": "../server/tsconfig.lib.json" }
    ],
    "exclude": [
        "vite.config.ts",
        "vite.config.mts",
        "vitest.config.ts",
        "vitest.config.mts",
        "src/**/*.test.ts",
        "src/**/*.spec.ts"
    ]
}
```

`packages/adapters/tsconfig.spec.json`:
```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "outDir": "./out-tsc/vitest",
        "types": ["node", "vitest/globals"]
    },
    "include": [
        "vite.config.ts",
        "vite.config.mts",
        "vitest.config.ts",
        "vitest.config.mts",
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/**/*.d.ts"
    ],
    "references": [{ "path": "./tsconfig.lib.json" }]
}
```

`packages/adapters/vitest.config.mts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig(() => ({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/packages/adapters",
    test: {
        name: "@graph-context-protocol/adapters",
        watch: false,
        globals: true,
        environment: "node",
        include: [
            "{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
        ],
        reporters: ["default"],
        coverage: {
            reportsDirectory: "./test-output/vitest/coverage",
            provider: "v8" as const,
        },
    },
}));
```

- [ ] **Step 2: Install so pnpm links the new workspace package**

Run: `pnpm install`
Expected: lockfile updates; `@graph-context-protocol/adapters` linked. (`pnpm-workspace.yaml` already globs `packages/*`.)

- [ ] **Step 3: Write the fixture and the failing test**

`packages/adapters/src/lib/__fixtures__/sample.md`:
```markdown
# Executor Log

- DONE: deployed service A
- DONE: ran migration 0007
```

`packages/adapters/src/lib/markdown-adapter.spec.ts`:
```typescript
import { fileURLToPath } from "node:url";
import {
    createRequesterDescriptor,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { createMarkdownKnowledgeAdapter } from "./markdown-adapter.js";

const FIXTURE = fileURLToPath(
    new URL("./__fixtures__/sample.md", import.meta.url),
);

function knowledgeRequest() {
    return {
        requester: {
            id: "principal:test",
            capabilities: [],
            metadata: {},
        },
        query: { kinds: ["knowledge"] as const, filters: {} },
        metadata: {},
    };
}

describe("createMarkdownKnowledgeAdapter", () => {
    it("reads the markdown file and returns its text as raw content", async () => {
        const adapter = createMarkdownKnowledgeAdapter({
            id: "knowledge:executor-context",
            filePath: FIXTURE,
        });

        const result = await adapter.query(knowledgeRequest() as never);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.sourceId).toBe("knowledge:executor-context");
            expect(result.data.raw).toContain("DONE: deployed service A");
            expect(result.data.nodes).toHaveLength(1);
            expect(result.data.nodes[0].id).toBe("knowledge:executor-context");
        }
    });

    it("returns a not-found error when the file is missing", async () => {
        const adapter = createMarkdownKnowledgeAdapter({
            id: "knowledge:missing",
            filePath: "/no/such/file.md",
        });
        const result = await adapter.query(knowledgeRequest() as never);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("not-found");
        }
    });
});
```

(The `createRequesterDescriptor` import keeps the test honest about core resolving; remove if unused after writing — Biome will flag it.)

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm exec vitest run packages/adapters/src/lib/markdown-adapter.spec.ts`
Expected: FAIL — cannot find module `./markdown-adapter.js`.

- [ ] **Step 5: Write the implementation and barrel export**

`packages/adapters/src/lib/markdown-adapter.ts`:
```typescript
/**
 * Markdown-file knowledge source adapter.
 *
 * Reads a `.md` file from disk and exposes its text as a single knowledge
 * node. The adapter `id` MUST equal the knowledge node id it backs, because
 * the server resolves adapters by `targetNodeId`.
 *
 * @module lib/markdown-adapter
 */

import { readFile } from "node:fs/promises";
import {
    createKnowledgeNode,
    createRole,
    fail,
    type RoleDefinition,
    succeed,
} from "@graph-context-protocol/core";
import {
    createServerError,
    type KnowledgeSourceAdapter,
} from "@graph-context-protocol/server";

/**
 * Configuration for {@link createMarkdownKnowledgeAdapter}.
 */
export interface MarkdownKnowledgeAdapterConfig {
    /** Adapter id — MUST equal the backed knowledge node id. */
    readonly id: string;
    /** Absolute path to the markdown file to read. */
    readonly filePath: string;
    /** Role assigned to the produced knowledge node. */
    readonly role?: RoleDefinition;
}

const DEFAULT_ROLE = createRole(
    "role:markdown-source",
    "Markdown Source",
    "Read-only markdown knowledge source",
);

/**
 * Creates a KnowledgeSourceAdapter backed by a single markdown file.
 */
export function createMarkdownKnowledgeAdapter(
    config: MarkdownKnowledgeAdapterConfig,
): KnowledgeSourceAdapter {
    const role = config.role ?? DEFAULT_ROLE;

    return {
        id: config.id,
        capabilities: ["lookup", "search"],

        async query() {
            try {
                const text = await readFile(config.filePath, "utf8");
                const node = createKnowledgeNode(config.id, role, {
                    contentType: "text/markdown",
                    content: text,
                });
                return succeed({
                    sourceId: config.id,
                    nodes: [node],
                    raw: text,
                    metadata: { sourceOfTruth: config.filePath },
                });
            } catch (cause) {
                return fail(
                    createServerError(
                        "not-found",
                        `Cannot read markdown file: ${config.filePath}`,
                        { metadata: { cause: String(cause) } },
                    ),
                );
            }
        },
    };
}
```

`packages/adapters/src/index.ts`:
```typescript
export {
    createMarkdownKnowledgeAdapter,
    type MarkdownKnowledgeAdapterConfig,
} from "./lib/markdown-adapter.js";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run packages/adapters/src/lib/markdown-adapter.spec.ts`
Expected: PASS (2 tests). If `createServerError` second-arg options shape differs, check `packages/server/src/lib/errors.ts` and adjust the metadata option.

- [ ] **Step 7: Commit**

```bash
git add packages/adapters pnpm-lock.yaml
git commit -m "feat(adapters): add markdown knowledge source adapter package"
```

---

## Task 5: `createContextQueryTool` in `@gcp/langgraph`

**Files:**
- Modify: `packages/langgraph/package.json` (add server dependency)
- Modify: `packages/langgraph/tsconfig.lib.json` (add server project reference)
- Create: `packages/langgraph/src/lib/context-query-tool.ts`
- Create: `packages/langgraph/src/lib/context-query-tool.spec.ts`
- Modify: `packages/langgraph/src/index.ts` (export the tool)

- [ ] **Step 1: Add the server dependency and reference**

In `packages/langgraph/package.json`, add to `dependencies`:
```json
"@graph-context-protocol/server": "workspace:*"
```

In `packages/langgraph/tsconfig.lib.json`, add to `references`:
```json
{ "path": "../server/tsconfig.lib.json" }
```

Then run: `pnpm install`
Expected: workspace link added.

- [ ] **Step 2: Write the failing test**

```typescript
// packages/langgraph/src/lib/context-query-tool.spec.ts
import { createContextQueryResult } from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import { createContextQueryTool } from "./context-query-tool.js";

describe("createContextQueryTool", () => {
    it("returns the peer context text on a successful ok response", async () => {
        const queryFn = vi.fn(async () =>
            createContextQueryResult(
                "query:x",
                "ok",
                "knowledge:executor-context",
                {},
                "PEER TASKS: do the thing",
            ),
        );

        const tool = createContextQueryTool({
            peerUrl: "http://executor.test/api/gcp",
            targetNodeId: "knowledge:executor-context",
            queryFn,
        });

        const output = await tool.invoke({ question: "what is pending?" });

        expect(queryFn).toHaveBeenCalledOnce();
        const arg = queryFn.mock.calls[0][0];
        expect(arg.url).toBe("http://executor.test/api/gcp");
        expect(arg.query.targetNodeId).toBe("knowledge:executor-context");
        expect(arg.query.query).toBe("what is pending?");
        expect(output).toBe("PEER TASKS: do the thing");
    });

    it("returns a graceful message when the peer is unreachable", async () => {
        const queryFn = vi.fn(async () => {
            throw new Error("ECONNREFUSED");
        });
        const tool = createContextQueryTool({
            peerUrl: "http://down.test/api/gcp",
            targetNodeId: "knowledge:executor-context",
            queryFn,
        });

        const output = await tool.invoke({ question: "status?" });
        expect(output).toContain("Failed to reach peer node");
        expect(output).toContain("ECONNREFUSED");
    });

    it("reports a non-ok status without throwing", async () => {
        const queryFn = vi.fn(async () =>
            createContextQueryResult(
                "query:x",
                "denied",
                "knowledge:executor-context",
                {},
                undefined,
                "policy says no",
            ),
        );
        const tool = createContextQueryTool({
            peerUrl: "http://executor.test/api/gcp",
            targetNodeId: "knowledge:executor-context",
            queryFn,
        });
        const output = await tool.invoke({ question: "x" });
        expect(output).toContain("denied");
        expect(output).toContain("policy says no");
    });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run packages/langgraph/src/lib/context-query-tool.spec.ts`
Expected: FAIL — cannot find module `./context-query-tool.js`.

- [ ] **Step 4: Write the implementation**

```typescript
// packages/langgraph/src/lib/context-query-tool.ts
/**
 * LangChain tool that issues a read-first GCP context-query to a peer node.
 *
 * @module context-query-tool
 */

import {
    createContextQuery,
    createRequesterDescriptor,
} from "@graph-context-protocol/core";
import { queryRemoteContext } from "@graph-context-protocol/server";
import { type StructuredTool, tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Configuration for {@link createContextQueryTool}.
 */
export interface ContextQueryToolConfig {
    /** Absolute URL of the peer node's context-query endpoint. */
    readonly peerUrl: string;
    /** Knowledge node id at the peer to query. */
    readonly targetNodeId: string;
    /** Tool name exposed to the LLM. Defaults to "query_peer_context". */
    readonly toolName?: string;
    /** Tool description override. */
    readonly description?: string;
    /** Principal id placed in the (audit-only) requester descriptor. */
    readonly requesterId?: string;
    /** Injectable client for testing. Defaults to `queryRemoteContext`. */
    readonly queryFn?: typeof queryRemoteContext;
}

const InputSchema = z.object({
    question: z
        .string()
        .min(1)
        .describe("The natural-language question to ask the peer node's context"),
});

/**
 * Builds a LangChain StructuredTool that reads a peer node's shared context.
 */
export function createContextQueryTool(
    config: ContextQueryToolConfig,
): StructuredTool {
    const {
        peerUrl,
        targetNodeId,
        toolName = "query_peer_context",
        requesterId = "principal:peer-agent",
        queryFn = queryRemoteContext,
    } = config;

    const description =
        config.description ??
        `Read the shared context owned by the peer node "${targetNodeId}" over the Graph Context Protocol. Use this to learn what the other node knows or has done.`;

    return tool(
        async ({ question }: z.infer<typeof InputSchema>): Promise<string> => {
            const requester = createRequesterDescriptor(requesterId, [], []);
            const query = createContextQuery(
                `query:${crypto.randomUUID()}`,
                requester,
                targetNodeId,
                "text",
                question,
            );

            try {
                const result = await queryFn({ url: peerUrl, query });
                if (result.status !== "ok") {
                    return `Peer context query ${result.status}: ${result.error ?? "no detail"}`;
                }
                return typeof result.result === "string"
                    ? result.result
                    : JSON.stringify(result.result);
            } catch (cause) {
                const message =
                    cause instanceof Error ? cause.message : String(cause);
                return `Failed to reach peer node: ${message}`;
            }
        },
        { name: toolName, description, schema: InputSchema },
    );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/langgraph/src/lib/context-query-tool.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Export from the package index**

Add to `packages/langgraph/src/index.ts`:
```typescript
export {
    type ContextQueryToolConfig,
    createContextQueryTool,
} from "./lib/context-query-tool";
```

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm exec nx run @graph-context-protocol/langgraph:typecheck`
Expected: PASS.

```bash
git add packages/langgraph
git commit -m "feat(langgraph): add createContextQueryTool for peer context-query"
```

---

## Task 6: Wire the `researcher` app as a GCP node

**Files:**
- Create: `apps/researcher/CONTEXT-1.md`
- Create: `apps/researcher/src/lib/gcp.ts`
- Create: `apps/researcher/src/app/api/gcp/route.ts`
- Modify: `apps/researcher/src/env.ts` (add `PEER_GCP_URL`)
- Modify: `apps/researcher/src/lib/graph.ts` (replace single-agent graph with a react agent that has the peer tool)
- Modify: `apps/researcher/package.json` (add `@gcp/{core,server,adapters,langgraph}` deps)

- [ ] **Step 1: Add workspace deps to the app**

In `apps/researcher/package.json`, add to `dependencies`:
```json
"@graph-context-protocol/core": "workspace:*",
"@graph-context-protocol/server": "workspace:*",
"@graph-context-protocol/adapters": "workspace:*",
"@graph-context-protocol/langgraph": "workspace:*"
```
Then run: `pnpm install`

- [ ] **Step 2: Create the seed context file**

`apps/researcher/CONTEXT-1.md`:
```markdown
# Researcher Node — Shared Context

## Pending Tasks
- TASK-1: Investigate auth latency spike (priority: high)
- TASK-2: Summarize Q2 incident reports (priority: medium)

## Research Notes
- Auth latency correlates with token refresh storms after deploys.
```

- [ ] **Step 3: Create the GCP server module**

`apps/researcher/src/lib/gcp.ts`:
```typescript
import path from "node:path";
import {
    createAccessPolicyDescriptor,
    createAgentNode,
    createGraph,
    createKnowledgeNode,
    createMetadataWithAccessPolicy,
    createRole,
} from "@graph-context-protocol/core";
import { createMarkdownKnowledgeAdapter } from "@graph-context-protocol/adapters";
import {
    createGraphContextServer,
    createKnowledgeSourceRegistry,
    type GraphContextServer,
} from "@graph-context-protocol/server";

const LOCAL_NODE_ID = "node:researcher";
const KNOWLEDGE_ID = "knowledge:researcher-context";
const CONTEXT_FILE = path.join(process.cwd(), "CONTEXT-1.md");

let serverPromise: Promise<GraphContextServer> | undefined;

/** Returns the started researcher GCP server, building it once per process. */
export function getGcpServer(): Promise<GraphContextServer> {
    if (serverPromise === undefined) {
        serverPromise = buildServer();
    }
    return serverPromise;
}

async function buildServer(): Promise<GraphContextServer> {
    const role = createRole(
        "role:researcher-context",
        "Researcher Context",
        "Public read-only context for the researcher node",
    );

    const policy = createAccessPolicyDescriptor([], [], true, "empty-result");
    const knowledgeNode = createKnowledgeNode(
        KNOWLEDGE_ID,
        role,
        createMetadataWithAccessPolicy(policy, {
            tags: ["tasks", "notes"],
            contentType: "text/markdown",
        }),
    );

    const graph = createGraph("graph:researcher")
        .addNode(createAgentNode(LOCAL_NODE_ID, role))
        .addNode(knowledgeNode);

    const adapter = createMarkdownKnowledgeAdapter({
        id: KNOWLEDGE_ID,
        filePath: CONTEXT_FILE,
    });
    const registered = createKnowledgeSourceRegistry().register(adapter);
    const knowledgeSources = registered.success
        ? registered.data
        : createKnowledgeSourceRegistry();

    const server = createGraphContextServer(
        {
            id: "server:researcher",
            localNodeId: LOCAL_NODE_ID,
            shutdownTimeoutMs: 30000,
        },
        { graph, knowledgeSources },
    );

    const started = await server.start();
    if (!started.success) {
        throw new Error(`Failed to start GCP server: ${started.error.message}`);
    }
    return server;
}
```

- [ ] **Step 4: Create the GCP HTTP route**

`apps/researcher/src/app/api/gcp/route.ts`:
```typescript
import { createFetchHandler } from "@graph-context-protocol/server";
import { getGcpServer } from "@/lib/gcp";

export async function POST(request: Request): Promise<Response> {
    const server = await getGcpServer();
    const handler = createFetchHandler({ server });
    return handler(request);
}
```

- [ ] **Step 5: Add `PEER_GCP_URL` to env**

Edit `apps/researcher/src/env.ts` — add to the `server` object and `runtimeEnv`:
```typescript
// inside server: { ... }
PEER_GCP_URL: z.string().url().default("http://localhost:3001/api/gcp"),
// inside runtimeEnv: { ... }
PEER_GCP_URL: process.env.PEER_GCP_URL,
```

- [ ] **Step 6: Rewrite the agent graph to use the peer tool**

Replace the entire contents of `apps/researcher/src/lib/graph.ts`:
```typescript
import { SystemMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import {
    createContextQueryTool,
    createOpenRouterLLM,
} from "@graph-context-protocol/langgraph";
import { env } from "@/env";

const llm = createOpenRouterLLM({
    model: env.OPENROUTER_MODEL,
    temperature: 0.7,
});

const peerTool = createContextQueryTool({
    peerUrl: env.PEER_GCP_URL,
    targetNodeId: "knowledge:executor-context",
});

const systemPrompt = new SystemMessage(
    `You are the RESEARCHER node in a Graph Context Protocol network.
You own a list of pending tasks and research notes.
When the user asks about what the executor has done or its status, use the
"query_peer_context" tool to read the executor node's shared context, then
answer based on what you learn.`,
);

export const graph = createReactAgent({
    llm,
    tools: [peerTool],
    messageModifier: systemPrompt,
});
```

- [ ] **Step 7: Type-check the app**

Run: `pnpm exec nx run researcher:typecheck`
Expected: PASS. (If the project/target name differs, run `pnpm exec nx show project researcher` to confirm the typecheck target.)

- [ ] **Step 8: Commit**

```bash
git add apps/researcher pnpm-lock.yaml
git commit -m "feat(researcher): run app as a GCP node with peer context-query tool"
```

---

## Task 7: Wire the `executor` app as a GCP node

**Files:**
- Create: `apps/executor/CONTEXT-1.md`
- Create: `apps/executor/src/lib/gcp.ts`
- Create: `apps/executor/src/app/api/gcp/route.ts`
- Modify: `apps/executor/src/env.ts`
- Modify: `apps/executor/src/lib/graph.ts`
- Modify: `apps/executor/package.json`

- [ ] **Step 1: Add workspace deps**

In `apps/executor/package.json`, add the same four `@graph-context-protocol/*` deps as Task 6 Step 1, then run `pnpm install`.

- [ ] **Step 2: Create the seed context file**

`apps/executor/CONTEXT-1.md`:
```markdown
# Executor Node — Shared Context

## Completed Results
- DONE: Deployed auth-service v2.3 at 09:12
- DONE: Applied DB migration 0007 (token_refresh index)

## Action Log
- 09:05 received deploy request
- 09:12 deploy succeeded, health checks green
```

- [ ] **Step 3: Create the GCP server module**

`apps/executor/src/lib/gcp.ts` — identical to researcher's but with executor ids:
```typescript
import path from "node:path";
import {
    createAccessPolicyDescriptor,
    createAgentNode,
    createGraph,
    createKnowledgeNode,
    createMetadataWithAccessPolicy,
    createRole,
} from "@graph-context-protocol/core";
import { createMarkdownKnowledgeAdapter } from "@graph-context-protocol/adapters";
import {
    createGraphContextServer,
    createKnowledgeSourceRegistry,
    type GraphContextServer,
} from "@graph-context-protocol/server";

const LOCAL_NODE_ID = "node:executor";
const KNOWLEDGE_ID = "knowledge:executor-context";
const CONTEXT_FILE = path.join(process.cwd(), "CONTEXT-1.md");

let serverPromise: Promise<GraphContextServer> | undefined;

export function getGcpServer(): Promise<GraphContextServer> {
    if (serverPromise === undefined) {
        serverPromise = buildServer();
    }
    return serverPromise;
}

async function buildServer(): Promise<GraphContextServer> {
    const role = createRole(
        "role:executor-context",
        "Executor Context",
        "Public read-only context for the executor node",
    );

    const policy = createAccessPolicyDescriptor([], [], true, "empty-result");
    const knowledgeNode = createKnowledgeNode(
        KNOWLEDGE_ID,
        role,
        createMetadataWithAccessPolicy(policy, {
            tags: ["results", "log"],
            contentType: "text/markdown",
        }),
    );

    const graph = createGraph("graph:executor")
        .addNode(createAgentNode(LOCAL_NODE_ID, role))
        .addNode(knowledgeNode);

    const adapter = createMarkdownKnowledgeAdapter({
        id: KNOWLEDGE_ID,
        filePath: CONTEXT_FILE,
    });
    const registered = createKnowledgeSourceRegistry().register(adapter);
    const knowledgeSources = registered.success
        ? registered.data
        : createKnowledgeSourceRegistry();

    const server = createGraphContextServer(
        {
            id: "server:executor",
            localNodeId: LOCAL_NODE_ID,
            shutdownTimeoutMs: 30000,
        },
        { graph, knowledgeSources },
    );

    const started = await server.start();
    if (!started.success) {
        throw new Error(`Failed to start GCP server: ${started.error.message}`);
    }
    return server;
}
```

- [ ] **Step 4: Create the GCP HTTP route**

`apps/executor/src/app/api/gcp/route.ts`:
```typescript
import { createFetchHandler } from "@graph-context-protocol/server";
import { getGcpServer } from "@/lib/gcp";

export async function POST(request: Request): Promise<Response> {
    const server = await getGcpServer();
    const handler = createFetchHandler({ server });
    return handler(request);
}
```

- [ ] **Step 5: Add `PEER_GCP_URL` to env (defaults to researcher's port)**

Edit `apps/executor/src/env.ts` — add to `server` and `runtimeEnv`:
```typescript
// inside server: { ... }
PEER_GCP_URL: z.string().url().default("http://localhost:3000/api/gcp"),
// inside runtimeEnv: { ... }
PEER_GCP_URL: process.env.PEER_GCP_URL,
```

- [ ] **Step 6: Rewrite the agent graph**

Replace `apps/executor/src/lib/graph.ts`:
```typescript
import { SystemMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import {
    createContextQueryTool,
    createOpenRouterLLM,
} from "@graph-context-protocol/langgraph";
import { env } from "@/env";

const llm = createOpenRouterLLM({
    model: env.OPENROUTER_MODEL,
    temperature: 0.2,
});

const peerTool = createContextQueryTool({
    peerUrl: env.PEER_GCP_URL,
    targetNodeId: "knowledge:researcher-context",
});

const systemPrompt = new SystemMessage(
    `You are the EXECUTOR node in a Graph Context Protocol network.
You own a log of completed results and actions.
When the user asks what tasks are pending or what the researcher wants, use the
"query_peer_context" tool to read the researcher node's shared context, then
answer based on what you learn.`,
);

export const graph = createReactAgent({
    llm,
    tools: [peerTool],
    messageModifier: systemPrompt,
});
```

- [ ] **Step 7: Type-check the app**

Run: `pnpm exec nx run executor:typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/executor pnpm-lock.yaml
git commit -m "feat(executor): run app as a GCP node with peer context-query tool"
```

---

## Task 8: Whole-workspace verification + docs note

**Files:**
- Modify: `README.md` (add a short "Running the GCP demo" subsection under Demo Applications)

- [ ] **Step 1: Run the full lint/test/typecheck/build sweep**

Run: `pnpm exec nx run-many -t lint test typecheck build`
Expected: all projects PASS. Fix any Biome formatting with `pnpm format` and re-run.

- [ ] **Step 2: Manual end-to-end check (requires `OPENROUTER_API_KEY`)**

In two terminals (set `OPENROUTER_API_KEY` in each):
```bash
# terminal 1
OPENROUTER_API_KEY=sk-... pnpm exec nx dev researcher --port 3000
# terminal 2
OPENROUTER_API_KEY=sk-... pnpm exec nx dev executor --port 3001
```
(If the dev target name differs, run `pnpm exec nx show project researcher` and use the listed serve/dev target.)

First, sanity-check the protocol path without the LLM:
```bash
curl -s -X POST http://localhost:3001/api/gcp \
  -H 'Content-Type: application/json' \
  -d '{
    "header": { "messageId": "msg:1", "source": "principal:test",
      "target": "knowledge:executor-context", "type": "context-query",
      "priority": "normal", "timestamp": "2026-06-02T00:00:00.000Z", "ttl": 60,
      "metadata": { "gcp.credentials": { "type": "anonymous", "value": "anonymous" } } },
    "context": { "id": "ctx:1", "graphId": "g", "currentNode": "principal:test",
      "accumulatedData": {}, "role": { "id": "role:x", "name": "x", "description": "",
      "capabilities": [], "contextRules": [], "metadata": {} }, "metadata": {},
      "createdAt": "2026-06-02T00:00:00.000Z", "path": [] },
    "payload": { "contractVersion": "gcp-context-contract/v1", "queryId": "query:1",
      "requester": { "principalId": "principal:test", "roles": [], "capabilities": [], "metadata": {} },
      "targetNodeId": "knowledge:executor-context", "mode": "text",
      "query": "what is done?", "metadata": {} } }'
```
Expected: JSON response whose `payload.status` is `"ok"` and `payload.result` contains the executor's `CONTEXT-1.md` text. (The `role` in `context` may be sent as a plain object; the handler does not re-validate it.)

Then open `http://localhost:3000` (researcher), ask: *"What has the executor finished?"* — confirm the `query_peer_context` tool-call appears in the assistant-ui thread and the answer reflects `apps/executor/CONTEXT-1.md`. Edit that file, re-ask, confirm the change is read.

- [ ] **Step 3: Add the README note**

Under the `### Demo Applications` section in `README.md`, append:
```markdown
#### Running the GCP demo

`researcher` and `executor` each run as an independent GCP node. Each owns a
`CONTEXT-1.md` knowledge file exposed at `POST /api/gcp`, and each app's agent
has a `query_peer_context` tool that reads the *other* node's context over the
read-first `context-query` protocol.

```bash
OPENROUTER_API_KEY=sk-... pnpm exec nx dev researcher --port 3000
OPENROUTER_API_KEY=sk-... pnpm exec nx dev executor --port 3001
```

Ask the researcher "what has the executor done?" to watch a live GCP
context-query between the two nodes. Edit either `CONTEXT-1.md` to change what a
node exposes. Override the peer location with `PEER_GCP_URL`.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the researcher/executor GCP node demo"
```

---

## Self-review notes

- **Spec coverage:** server HTTP helpers (Tasks 1–3), `@gcp/adapters` markdown adapter (Task 4), langgraph context-query tool (Task 5), per-app node wiring + `CONTEXT-1.md` + `/api/gcp` + env (Tasks 6–7), verification + docs (Task 8). All spec sections covered. Note: the spec assumed `@gcp/langgraph` was empty — it is not; Task 5 *adds to* the existing package rather than filling an empty one.
- **No-auth path:** allow-all provider is the server default; client sends an anonymous `gcp.credentials` so the handler's credential-presence check passes; knowledge nodes carry an open `gcp.accessPolicy` (`[], [], true, "empty-result"`) so node authorization returns allowed.
- **Adapter id = node id:** enforced in every `createMarkdownKnowledgeAdapter` call so `registry.get(targetNodeId)` resolves.
- **Type consistency:** `getGcpServer`, `createFetchHandler({ server })`, `queryRemoteContext({ url, query, ... })`, `createContextQueryTool({ peerUrl, targetNodeId, queryFn })`, `createMarkdownKnowledgeAdapter({ id, filePath })` are used identically across tasks.
- **Residual risk:** exact Nx target names (`typecheck`, `dev`/`serve`) and `createServerError` option shape are verified during the relevant steps, with fallback commands noted inline.
