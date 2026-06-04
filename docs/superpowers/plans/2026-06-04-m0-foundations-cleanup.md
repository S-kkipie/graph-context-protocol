# M0 — Foundations & Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the researcher/executor copy-paste clones with one parameterized node factory + manifest runner, fix workspace config debt, and backfill the missing specs that later milestones depend on — with zero observable change to the existing 2-node demo.

**Architecture:** A new `@graph-context-protocol/scenario` library package holds `createGcpNode(config)` (a started `GraphContextServer` built from config), `createNodeAgent(config)` (a `createReactAgent` built from config), and a Zod-validated node manifest + headless `runManifest()`. The two Next.js apps shrink to thin wrappers that call the factory with their own config. The factory uses the exact same `@graph-context-protocol/*` import surface as the apps do today, so source resolution and demo behavior are unchanged.

**Tech Stack:** Nx 22, pnpm 9 / Node 20, TypeScript strict (project references, `customConditions` source resolution), Zod 4, Vitest 4, Biome, LangChain/LangGraph (`createReactAgent`).

---

## Spec

This plan implements `docs/superpowers/specs/2026-06-04-m0-foundations-cleanup-design.md` (parent roadmap: `docs/superpowers/specs/2026-06-04-gcp-research-migration-design.md`).

**Resolved open question (spec §9):** Factory home = a new package `packages/scenario` (`@graph-context-protocol/scenario`), so M5's eval harness can reuse it. Chosen over `apps/_shared`.

## File Structure

New package `packages/scenario` (mirrors `packages/adapters` layout):

| File | Responsibility |
|---|---|
| `packages/scenario/package.json` | Package manifest; deps on core/server/adapters/langgraph + langchain |
| `packages/scenario/tsconfig.json` | Project-reference root (lib + spec) |
| `packages/scenario/tsconfig.lib.json` | Build config; references core/server/adapters/langgraph lib tsconfigs |
| `packages/scenario/tsconfig.spec.json` | Test typecheck config |
| `packages/scenario/vitest.config.mts` | Vitest config |
| `packages/scenario/src/index.ts` | Public exports |
| `packages/scenario/src/lib/config.ts` | `GcpNodeConfigSchema` (Zod) + `NodeAgentConfig` types |
| `packages/scenario/src/lib/gcp-node.ts` | `createGcpNode(config)` — build + start a server node |
| `packages/scenario/src/lib/node-agent.ts` | `createNodeAgent(config)` — build a react agent |
| `packages/scenario/src/lib/manifest.ts` | `NodeManifestSchema` + `runManifest()` headless runner |
| `packages/scenario/src/lib/gcp-node.spec.ts` | Factory unit tests |
| `packages/scenario/src/lib/node-agent.spec.ts` | Agent factory unit tests |
| `packages/scenario/src/lib/manifest.spec.ts` | Runner integration test (≥3 nodes + context-query) |
| `packages/scenario/src/lib/__fixtures__/context.md` | Fixture markdown for runner test |

Modified (config hygiene):

| File | Change |
|---|---|
| `pnpm-workspace.yaml` | Remove stale `core` glob |
| `package.json` (root) | Add `engines` + `packageManager` |
| `.nvmrc` | New — Node 20 |
| `tsconfig.base.json` | `customConditions` `@org/source` → `@ai-do/source` |
| `packages/{core,server,adapters,langgraph}/package.json` | Add `@ai-do/source` export condition |
| `tsconfig.json` (root) | Add `packages/scenario` reference |

Modified (apps consume factory):

| File | Change |
|---|---|
| `apps/researcher/src/lib/gcp.ts` | Call `createGcpNode(RESEARCHER_CONFIG)` |
| `apps/researcher/src/lib/graph.ts` | Call `createNodeAgent(...)` |
| `apps/executor/src/lib/gcp.ts` | Call `createGcpNode(EXECUTOR_CONFIG)` |
| `apps/executor/src/lib/graph.ts` | Call `createNodeAgent(...)` |
| `apps/{researcher,executor}/package.json` | Add `@graph-context-protocol/scenario` dep |
| `apps/{researcher,executor}/tsconfig.json` | Add `packages/scenario` reference |

Backfilled specs (new test files only; no production code change):

| File | Covers |
|---|---|
| `packages/core/src/lib/discovery/discovery-functions.spec.ts` | BFS traversal, capability gating, path-rule matching, `denied` set, filters |
| `packages/server/src/lib/routing/routing.spec.ts` | Route kinds: local-handler, external-agent, undeliverable |
| `packages/server/src/lib/sync/sync.spec.ts` | run / cancel / status / list |
| `packages/server/src/lib/server/server.spec.ts` | Lifecycle transitions, send guard, receive guard |

---

## Task 1: Workspace config hygiene (non-source)

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (root)
- Create: `.nvmrc`

- [ ] **Step 1: Remove the stale `core` glob from the workspace file**

`pnpm-workspace.yaml` currently lists a top-level `core` package that does not exist. Replace the whole file with:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 2: Add `engines` and `packageManager` to the root `package.json`**

In `package.json`, after the `"license": "MIT",` line, add these two top-level keys (the README states Node 20+/pnpm; CI uses Node 20 / pnpm 9):

```json
    "engines": {
        "node": ">=20",
        "pnpm": ">=9"
    },
    "packageManager": "pnpm@9.0.0",
```

- [ ] **Step 3: Create `.nvmrc`**

Create `.nvmrc` with exactly:

```
20
```

- [ ] **Step 4: Verify the workspace still resolves**

Run: `pnpm install --frozen-lockfile`
Expected: completes without "core" warnings and without lockfile changes (PASS). If it reports the lockfile is out of date, run `pnpm install` (no flag) instead and expect it to succeed.

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml package.json .nvmrc
git commit -m "chore(workspace): drop stale core glob, pin node/pnpm via engines and .nvmrc"
```

---

## Task 2: Reconcile the source-resolution condition name

`tsconfig.base.json` sets `customConditions: ["@org/source"]`, but nothing else uses `@org/source`; the rest of the repo (nx.json release filter) uses `@ai-do/source`. No package declares either condition in `exports`, so today the condition is a no-op (resolution falls through to `default` → `./src/index.ts`). This task standardizes the token on `@ai-do/source` and makes the condition explicit. It is additive and safe — `default` still points to source, so resolution is unchanged.

**Files:**
- Modify: `tsconfig.base.json:19`
- Modify: `packages/core/package.json`
- Modify: `packages/server/package.json`
- Modify: `packages/adapters/package.json`
- Modify: `packages/langgraph/package.json`

- [ ] **Step 1: Rename the custom condition**

In `tsconfig.base.json`, change:

```json
        "customConditions": ["@org/source"]
```

to:

```json
        "customConditions": ["@ai-do/source"]
```

- [ ] **Step 2: Declare the condition in each package's exports**

In each of `packages/core/package.json`, `packages/server/package.json`, `packages/adapters/package.json`, `packages/langgraph/package.json`, change the `"."` export from:

```json
        ".": {
            "types": "./src/index.ts",
            "import": "./src/index.ts",
            "default": "./src/index.ts"
        },
```

to (add `@ai-do/source` as the first key):

```json
        ".": {
            "@ai-do/source": "./src/index.ts",
            "types": "./src/index.ts",
            "import": "./src/index.ts",
            "default": "./src/index.ts"
        },
```

- [ ] **Step 3: Verify typecheck + build still pass across the graph**

Run: `pnpm nx run-many -t typecheck build`
Expected: all projects succeed (PASS). The `@graph-context-protocol/*` imports must still resolve to TS source exactly as before.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.base.json packages/core/package.json packages/server/package.json packages/adapters/package.json packages/langgraph/package.json
git commit -m "chore(config): standardize source-resolution condition on @ai-do/source"
```

---

## Task 3: Scaffold the `@graph-context-protocol/scenario` package

**Files:**
- Create: `packages/scenario/package.json`
- Create: `packages/scenario/tsconfig.json`
- Create: `packages/scenario/tsconfig.lib.json`
- Create: `packages/scenario/tsconfig.spec.json`
- Create: `packages/scenario/vitest.config.mts`
- Create: `packages/scenario/src/index.ts`
- Modify: `tsconfig.json` (root)

- [ ] **Step 1: Create `packages/scenario/package.json`**

```json
{
    "name": "@graph-context-protocol/scenario",
    "version": "0.0.1",
    "private": true,
    "type": "module",
    "main": "./src/index.ts",
    "types": "./src/index.ts",
    "exports": {
        ".": {
            "@ai-do/source": "./src/index.ts",
            "types": "./src/index.ts",
            "import": "./src/index.ts",
            "default": "./src/index.ts"
        },
        "./package.json": "./package.json"
    },
    "dependencies": {
        "@graph-context-protocol/adapters": "workspace:*",
        "@graph-context-protocol/core": "workspace:*",
        "@graph-context-protocol/langgraph": "workspace:*",
        "@graph-context-protocol/server": "workspace:*",
        "@langchain/core": "^0.3.0",
        "@langchain/langgraph": "^0.2.0",
        "zod": "^4.4.3"
    }
}
```

- [ ] **Step 2: Create `packages/scenario/tsconfig.json`**

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

- [ ] **Step 3: Create `packages/scenario/tsconfig.lib.json`**

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
        { "path": "../server/tsconfig.lib.json" },
        { "path": "../adapters/tsconfig.lib.json" },
        { "path": "../langgraph/tsconfig.lib.json" }
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

- [ ] **Step 4: Create `packages/scenario/tsconfig.spec.json`**

```json
{
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "outDir": "./out-tsc/vitest",
        "types": [
            "vitest/globals",
            "vitest/importMeta",
            "vite/client",
            "node",
            "vitest"
        ],
        "forceConsistentCasingInFileNames": true
    },
    "include": [
        "vite.config.ts",
        "vite.config.mts",
        "vitest.config.ts",
        "vitest.config.mts",
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        "src/**/*.test.tsx",
        "src/**/*.spec.tsx",
        "src/**/*.d.ts"
    ],
    "references": [
        {
            "path": "./tsconfig.lib.json"
        }
    ]
}
```

- [ ] **Step 5: Create `packages/scenario/vitest.config.mts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig(() => ({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/packages/scenario",
    test: {
        name: "@graph-context-protocol/scenario",
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

- [ ] **Step 6: Create a placeholder `packages/scenario/src/index.ts`**

```typescript
export {};
```

- [ ] **Step 7: Register the package in the root `tsconfig.json`**

In `tsconfig.json` (root), add a reference to the `references` array (after the `packages/adapters` entry):

```json
      {
        "path": "./packages/scenario"
      }
```

- [ ] **Step 8: Install so pnpm links the new workspace package**

Run: `pnpm install`
Expected: succeeds; `@graph-context-protocol/scenario` linked into the workspace.

- [ ] **Step 9: Verify the empty package typechecks**

Run: `pnpm nx typecheck @graph-context-protocol/scenario`
Expected: PASS (an empty package with valid project references).

- [ ] **Step 10: Commit**

```bash
git add packages/scenario tsconfig.json pnpm-lock.yaml
git commit -m "feat(scenario): scaffold @graph-context-protocol/scenario package"
```

---

## Task 4: `createGcpNode` factory + config schema

**Files:**
- Create: `packages/scenario/src/lib/config.ts`
- Create: `packages/scenario/src/lib/gcp-node.ts`
- Test: `packages/scenario/src/lib/gcp-node.spec.ts`
- Create: `packages/scenario/src/lib/__fixtures__/context.md`

- [ ] **Step 1: Create the fixture markdown the factory tests read**

Create `packages/scenario/src/lib/__fixtures__/context.md`:

```markdown
# Scenario Test Context

TASK: write the M0 plan
NOTE: factory must reproduce the demo
```

- [ ] **Step 2: Write the config schema and types**

Create `packages/scenario/src/lib/config.ts`:

```typescript
import { z } from "zod";

/** Denial behavior for an access policy (mirrors core AccessPolicyDescriptor). */
export const DenialModeSchema = z.enum([
    "error",
    "empty-result",
    "fallback-if-allowed",
]);

/** Declarative description of one GCP server node. */
export const GcpNodeConfigSchema = z.object({
    serverId: z.string().min(1),
    nodeId: z.string().min(1),
    knowledgeId: z.string().min(1),
    graphId: z.string().min(1).optional(),
    role: z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string(),
    }),
    accessPolicy: z
        .object({
            readableByRoles: z.array(z.string()).default([]),
            requiredCapabilities: z.array(z.string()).default([]),
            fallbackAllowed: z.boolean().default(true),
            denialMode: DenialModeSchema.default("empty-result"),
        })
        .default({}),
    knowledge: z.object({
        filePath: z.string().min(1),
        tags: z.array(z.string()).default([]),
        contentType: z.string().default("text/markdown"),
    }),
    shutdownTimeoutMs: z.number().int().positive().default(30000),
});

/** Input accepted by the factory (defaults applied during parse). */
export type GcpNodeConfigInput = z.input<typeof GcpNodeConfigSchema>;
/** Fully-resolved node config after parsing. */
export type GcpNodeConfig = z.infer<typeof GcpNodeConfigSchema>;

/** Config for an LLM react-agent that reads peer context. */
export interface NodeAgentConfig {
    readonly llm: {
        readonly model?: string;
        readonly temperature?: number;
        readonly apiKey?: string;
    };
    readonly peers: ReadonlyArray<{
        readonly peerUrl: string;
        readonly targetNodeId: string;
    }>;
    readonly systemPrompt: string;
}
```

- [ ] **Step 3: Write the failing factory test**

Create `packages/scenario/src/lib/gcp-node.spec.ts`:

```typescript
import { fileURLToPath } from "node:url";
import {
    GCP_ACCESS_POLICY_METADATA_KEY,
    parseAccessPolicyFromMetadata,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { createGcpNode } from "./gcp-node";

const FIXTURE = fileURLToPath(
    new URL("./__fixtures__/context.md", import.meta.url),
);

const baseConfig = {
    serverId: "server:test",
    nodeId: "node:test",
    knowledgeId: "knowledge:test-context",
    role: {
        id: "role:test-context",
        name: "Test Context",
        description: "Test node",
    },
    accessPolicy: { fallbackAllowed: true, denialMode: "empty-result" as const },
    knowledge: { filePath: FIXTURE, tags: ["tasks", "notes"] },
};

describe("createGcpNode", () => {
    it("builds and starts a server with the configured id and node id", async () => {
        const server = await createGcpNode(baseConfig);
        expect(server.id).toBe("server:test");
        expect(server.localNodeId).toBe("node:test");
        expect(server.status).toBe("ready");
    });

    it("seeds an agent node + a knowledge node carrying the access policy and tags", async () => {
        const server = await createGcpNode(baseConfig);
        const snapshot = server.snapshot();
        expect(snapshot.localNodeId).toBe("node:test");
    });

    it("applies schema defaults (graphId, denialMode) when omitted", async () => {
        const server = await createGcpNode({
            serverId: "server:defaults",
            nodeId: "node:defaults",
            knowledgeId: "knowledge:defaults",
            role: { id: "role:d", name: "D", description: "d" },
            knowledge: { filePath: FIXTURE },
        });
        expect(server.status).toBe("ready");
    });

    it("throws a descriptive error when the access policy is invalid", async () => {
        await expect(
            createGcpNode({
                ...baseConfig,
                // @ts-expect-error invalid denialMode on purpose
                accessPolicy: { denialMode: "nonsense" },
            }),
        ).rejects.toThrow();
    });

    it("round-trips the policy through node metadata via core helpers", () => {
        const policyKey = GCP_ACCESS_POLICY_METADATA_KEY;
        const parsed = parseAccessPolicyFromMetadata({
            [policyKey]: {
                readableByRoles: [],
                requiredCapabilities: [],
                fallbackAllowed: true,
                denialMode: "empty-result",
            },
        });
        expect(parsed.success).toBe(true);
    });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: FAIL — `Cannot find module './gcp-node'` (the factory does not exist yet).

- [ ] **Step 5: Implement `createGcpNode`**

Create `packages/scenario/src/lib/gcp-node.ts`:

```typescript
import { createMarkdownKnowledgeAdapter } from "@graph-context-protocol/adapters";
import {
    createAccessPolicyDescriptor,
    createAgentNode,
    createGraph,
    createKnowledgeNode,
    createMetadataWithAccessPolicy,
    createRole,
} from "@graph-context-protocol/core";
import {
    createGraphContextServer,
    createKnowledgeSourceRegistry,
    type GraphContextServer,
} from "@graph-context-protocol/server";
import { type GcpNodeConfigInput, GcpNodeConfigSchema } from "./config";

/**
 * Builds and starts a single GCP server node from declarative config.
 *
 * Parameterized extraction of the (previously duplicated) researcher/executor
 * `buildServer()` logic. Returns a started server; the caller owns its
 * lifecycle (no module-scoped singleton, so N nodes can run in one process).
 */
export async function createGcpNode(
    config: GcpNodeConfigInput,
): Promise<GraphContextServer> {
    const cfg = GcpNodeConfigSchema.parse(config);

    const role = createRole(cfg.role.id, cfg.role.name, cfg.role.description);

    const policy = createAccessPolicyDescriptor(
        cfg.accessPolicy.readableByRoles,
        cfg.accessPolicy.requiredCapabilities,
        cfg.accessPolicy.fallbackAllowed,
        cfg.accessPolicy.denialMode,
    );

    const knowledgeNode = createKnowledgeNode(
        cfg.knowledgeId,
        role,
        createMetadataWithAccessPolicy(policy, {
            tags: cfg.knowledge.tags,
            contentType: cfg.knowledge.contentType,
        }),
    );

    const graph = createGraph(cfg.graphId ?? `graph:${cfg.nodeId}`)
        .addNode(createAgentNode(cfg.nodeId, role))
        .addNode(knowledgeNode);

    const adapter = createMarkdownKnowledgeAdapter({
        id: cfg.knowledgeId,
        filePath: cfg.knowledge.filePath,
    });
    const registered = createKnowledgeSourceRegistry().register(adapter);
    if (!registered.success) {
        throw new Error(
            `Failed to register knowledge adapter: ${registered.error.message}`,
        );
    }

    const server = createGraphContextServer(
        {
            id: cfg.serverId,
            localNodeId: cfg.nodeId,
            shutdownTimeoutMs: cfg.shutdownTimeoutMs,
        },
        { graph, knowledgeSources: registered.data },
    );

    const started = await server.start();
    if (!started.success) {
        throw new Error(`Failed to start GCP server: ${started.error.message}`);
    }
    return server;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: PASS (all `createGcpNode` cases green).

- [ ] **Step 7: Commit**

```bash
git add packages/scenario/src/lib/config.ts packages/scenario/src/lib/gcp-node.ts packages/scenario/src/lib/gcp-node.spec.ts packages/scenario/src/lib/__fixtures__/context.md
git commit -m "feat(scenario): add createGcpNode factory + config schema"
```

---

## Task 5: `createNodeAgent` factory

**Files:**
- Create: `packages/scenario/src/lib/node-agent.ts`
- Test: `packages/scenario/src/lib/node-agent.spec.ts`

- [ ] **Step 1: Write the failing agent-factory test**

Create `packages/scenario/src/lib/node-agent.spec.ts`. Construction does not call the LLM API (a dummy `apiKey` is enough to satisfy `createOpenRouterLLM`):

```typescript
import { describe, expect, it } from "vitest";
import { createNodeAgent } from "./node-agent";

describe("createNodeAgent", () => {
    it("builds a runnable react agent from config", () => {
        const agent = createNodeAgent({
            llm: { model: "openai/gpt-4o-mini", temperature: 0.7, apiKey: "test-key" },
            peers: [
                { peerUrl: "http://localhost:3001/api/gcp", targetNodeId: "knowledge:executor-context" },
            ],
            systemPrompt: "You are the test node.",
        });
        expect(typeof agent.stream).toBe("function");
        expect(typeof agent.invoke).toBe("function");
    });

    it("builds an agent with zero peers (no tools)", () => {
        const agent = createNodeAgent({
            llm: { apiKey: "test-key" },
            peers: [],
            systemPrompt: "No peers.",
        });
        expect(typeof agent.invoke).toBe("function");
    });

    it("throws when no API key is available", () => {
        const prev = process.env.OPENROUTER_API_KEY;
        process.env.OPENROUTER_API_KEY = "";
        try {
            expect(() =>
                createNodeAgent({ llm: {}, peers: [], systemPrompt: "x" }),
            ).toThrow(/OpenRouter API key/);
        } finally {
            if (prev === undefined) {
                delete process.env.OPENROUTER_API_KEY;
            } else {
                process.env.OPENROUTER_API_KEY = prev;
            }
        }
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: FAIL — `Cannot find module './node-agent'`.

- [ ] **Step 3: Implement `createNodeAgent`**

Create `packages/scenario/src/lib/node-agent.ts`:

```typescript
import {
    createContextQueryTool,
    createOpenRouterLLM,
} from "@graph-context-protocol/langgraph";
import { SystemMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { NodeAgentConfig } from "./config";

/**
 * Builds a react agent that can read peer context over GCP.
 *
 * Parameterized extraction of the (previously duplicated) researcher/executor
 * `graph.ts`: one read-only `query_peer_context` tool per configured peer.
 */
export function createNodeAgent(config: NodeAgentConfig) {
    const llm = createOpenRouterLLM({
        apiKey: config.llm.apiKey,
        model: config.llm.model,
        temperature: config.llm.temperature,
    });

    const tools = config.peers.map((peer) =>
        createContextQueryTool({
            peerUrl: peer.peerUrl,
            targetNodeId: peer.targetNodeId,
        }),
    );

    return createReactAgent({
        llm,
        tools,
        prompt: new SystemMessage(config.systemPrompt),
    });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scenario/src/lib/node-agent.ts packages/scenario/src/lib/node-agent.spec.ts
git commit -m "feat(scenario): add createNodeAgent factory"
```

---

## Task 6: Node manifest schema + headless `runManifest`

**Files:**
- Create: `packages/scenario/src/lib/manifest.ts`
- Test: `packages/scenario/src/lib/manifest.spec.ts`

- [ ] **Step 1: Write the failing manifest/runner test**

Create `packages/scenario/src/lib/manifest.spec.ts`. It launches 3 nodes from one manifest and sends each a `context-query` to prove it answers. The query path uses the default allow-all auth provider + the demo's allow-all policy (`readableByRoles: []`, `fallbackAllowed: true`), which `authorizeKnowledgeNodeAccess` permits, yielding `status: "ok"`:

```typescript
import { fileURLToPath } from "node:url";
import {
    type ContextQueryResult,
    createContextQuery,
    createMessageHeader,
    createProtocolMessage,
    createRequesterDescriptor,
    createRole,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { runManifest } from "./manifest";

const FIXTURE = fileURLToPath(
    new URL("./__fixtures__/context.md", import.meta.url),
);

function nodeConfig(n: number) {
    return {
        serverId: `server:n${n}`,
        nodeId: `node:n${n}`,
        knowledgeId: `knowledge:n${n}`,
        role: { id: `role:n${n}`, name: `Node ${n}`, description: "test node" },
        accessPolicy: { fallbackAllowed: true, denialMode: "empty-result" as const },
        knowledge: { filePath: FIXTURE, tags: ["test"] },
    };
}

function contextQueryEnvelope(knowledgeId: string) {
    const query = createContextQuery(
        "query:1",
        createRequesterDescriptor("principal:test"),
        knowledgeId,
        "text",
        "what is here?",
    );
    const header = createMessageHeader(
        "msg:1",
        "node:requester",
        knowledgeId,
        "context-query",
        { correlationId: "corr:1" },
    );
    const ctx = {
        id: "ctx:1",
        graphId: "graph:1",
        currentNode: "node:requester",
        accumulatedData: {},
        role: createRole("role:requester", "Requester", "requester"),
        metadata: {},
        createdAt: new Date().toISOString(),
        path: ["node:requester"],
    };
    const message = createProtocolMessage(header, ctx, query);
    return {
        transportId: "memory",
        payload: message,
        receivedAt: new Date().toISOString(),
        metadata: {
            "gcp.credentials": { type: "token", value: "anon", metadata: {} },
        },
    };
}

describe("runManifest", () => {
    it("launches N nodes headless, each started and addressable", async () => {
        const launched = await runManifest({
            nodes: [nodeConfig(1), nodeConfig(2), nodeConfig(3)],
        });
        expect(launched).toHaveLength(3);
        expect(launched.map((l) => l.server.localNodeId).sort()).toEqual([
            "node:n1",
            "node:n2",
            "node:n3",
        ]);
        for (const { server } of launched) {
            expect(server.status).toBe("ready");
        }
    });

    it("each launched node answers a context-query with status ok", async () => {
        const launched = await runManifest({ nodes: [nodeConfig(1), nodeConfig(2)] });
        for (const { config, server } of launched) {
            const result = await server.receive(
                contextQueryEnvelope(config.knowledgeId),
            );
            expect(result.success).toBe(true);
            if (result.success) {
                const response = (
                    result.data as { response?: { payload: ContextQueryResult } }
                ).response;
                expect(response?.payload.status).toBe("ok");
            }
        }
    });

    it("rejects an empty manifest", () => {
        expect(() => runManifest({ nodes: [] })).toThrow();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: FAIL — `Cannot find module './manifest'`.

- [ ] **Step 3: Implement the manifest schema + runner**

Create `packages/scenario/src/lib/manifest.ts`:

```typescript
import type { GraphContextServer } from "@graph-context-protocol/server";
import { z } from "zod";
import { type GcpNodeConfig, GcpNodeConfigSchema } from "./config";
import { createGcpNode } from "./gcp-node";

/** A set of GCP nodes to launch together. */
export const NodeManifestSchema = z.object({
    nodes: z.array(GcpNodeConfigSchema).min(1),
});

/** Input accepted by `runManifest` (defaults applied during parse). */
export type NodeManifestInput = z.input<typeof NodeManifestSchema>;

/** A node after it has been built and started. */
export interface LaunchedNode {
    readonly config: GcpNodeConfig;
    readonly server: GraphContextServer;
}

/**
 * Builds and starts every node in the manifest. Decoupled from Next.js so
 * later milestones (M3/M5) can launch many nodes headless.
 */
export async function runManifest(
    manifest: NodeManifestInput,
): Promise<LaunchedNode[]> {
    const parsed = NodeManifestSchema.parse(manifest);
    const launched: LaunchedNode[] = [];
    for (const node of parsed.nodes) {
        const server = await createGcpNode(node);
        launched.push({ config: node, server });
    }
    return launched;
}
```

Note: `runManifest` validates synchronously (`NodeManifestSchema.parse`) before any async work, so the empty-manifest case throws when the promise is created — `expect(() => runManifest(...)).toThrow()` is correct because `.parse` runs before the first `await`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: PASS (3 nodes launch; each answers `status: "ok"`).

- [ ] **Step 5: Wire the public exports**

Replace `packages/scenario/src/index.ts` with:

```typescript
export type {
    GcpNodeConfig,
    GcpNodeConfigInput,
    NodeAgentConfig,
} from "./lib/config";
export { DenialModeSchema, GcpNodeConfigSchema } from "./lib/config";
export { createGcpNode } from "./lib/gcp-node";
export type { LaunchedNode, NodeManifestInput } from "./lib/manifest";
export { NodeManifestSchema, runManifest } from "./lib/manifest";
export { createNodeAgent } from "./lib/node-agent";
```

- [ ] **Step 6: Verify package typecheck + test + build**

Run: `pnpm nx run-many -t typecheck test build -p @graph-context-protocol/scenario`
Expected: PASS for all three targets.

- [ ] **Step 7: Commit**

```bash
git add packages/scenario/src/lib/manifest.ts packages/scenario/src/lib/manifest.spec.ts packages/scenario/src/index.ts
git commit -m "feat(scenario): add node manifest schema + headless runManifest"
```

---

## Task 7: Rewrite the researcher app onto the factory

**Files:**
- Modify: `apps/researcher/package.json`
- Modify: `apps/researcher/tsconfig.json`
- Modify: `apps/researcher/src/lib/gcp.ts`
- Modify: `apps/researcher/src/lib/graph.ts`

- [ ] **Step 1: Add the scenario dependency**

In `apps/researcher/package.json`, add to `dependencies` (keep alphabetical grouping near the other `@graph-context-protocol/*` entries):

```json
        "@graph-context-protocol/scenario": "workspace:*",
```

- [ ] **Step 2: Add the project reference**

In `apps/researcher/tsconfig.json`, add to the `references` array:

```json
      {
        "path": "../../packages/scenario"
      }
```

- [ ] **Step 3: Install to link the dependency**

Run: `pnpm install`
Expected: succeeds.

- [ ] **Step 4: Rewrite `apps/researcher/src/lib/gcp.ts`**

Replace the entire file with the thin wrapper (keeps the lazy per-process singleton; the build logic now lives in the factory):

```typescript
import path from "node:path";
import { createGcpNode } from "@graph-context-protocol/scenario";
import type { GraphContextServer } from "@graph-context-protocol/server";

let serverPromise: Promise<GraphContextServer> | undefined;

/** Returns the started researcher GCP server, building it once per process. */
export function getGcpServer(): Promise<GraphContextServer> {
    if (serverPromise === undefined) {
        serverPromise = createGcpNode({
            serverId: "server:researcher",
            nodeId: "node:researcher",
            knowledgeId: "knowledge:researcher-context",
            graphId: "graph:researcher",
            role: {
                id: "role:researcher-context",
                name: "Researcher Context",
                description: "Public read-only context for the researcher node",
            },
            accessPolicy: {
                readableByRoles: [],
                requiredCapabilities: [],
                fallbackAllowed: true,
                denialMode: "empty-result",
            },
            knowledge: {
                filePath: path.join(process.cwd(), "CONTEXT-1.md"),
                tags: ["tasks", "notes"],
                contentType: "text/markdown",
            },
        });
    }
    return serverPromise;
}
```

- [ ] **Step 5: Rewrite `apps/researcher/src/lib/graph.ts`**

Replace the entire file with:

```typescript
import { createNodeAgent } from "@graph-context-protocol/scenario";
import { env } from "@/env";

export const graph = createNodeAgent({
    llm: { model: env.OPENROUTER_MODEL, temperature: 0.7 },
    peers: [
        { peerUrl: env.PEER_GCP_URL, targetNodeId: "knowledge:executor-context" },
    ],
    systemPrompt: `You are the RESEARCHER node in a Graph Context Protocol network.
You own a list of pending tasks and research notes.
When the user asks about what the executor has done or its status, use the
"query_peer_context" tool to read the executor node's shared context, then
answer based on what you learn.`,
});
```

- [ ] **Step 6: Verify the researcher app typechecks + builds**

Run: `pnpm nx run-many -t typecheck build -p researcher`
Expected: PASS. Demo behavior is identical — the wrapper produces the same node ids, policy, tags, peer target, and temperature as the previous hand-written version.

- [ ] **Step 7: Commit**

```bash
git add apps/researcher/package.json apps/researcher/tsconfig.json apps/researcher/src/lib/gcp.ts apps/researcher/src/lib/graph.ts pnpm-lock.yaml
git commit -m "refactor(researcher): build node + agent from @graph-context-protocol/scenario factory"
```

---

## Task 8: Rewrite the executor app onto the factory

**Files:**
- Modify: `apps/executor/package.json`
- Modify: `apps/executor/tsconfig.json`
- Modify: `apps/executor/src/lib/gcp.ts`
- Modify: `apps/executor/src/lib/graph.ts`

- [ ] **Step 1: Add the scenario dependency**

In `apps/executor/package.json`, add to `dependencies`:

```json
        "@graph-context-protocol/scenario": "workspace:*",
```

- [ ] **Step 2: Add the project reference**

In `apps/executor/tsconfig.json`, add to the `references` array:

```json
      {
        "path": "../../packages/scenario"
      }
```

- [ ] **Step 3: Install to link the dependency**

Run: `pnpm install`
Expected: succeeds.

- [ ] **Step 4: Rewrite `apps/executor/src/lib/gcp.ts`**

Replace the entire file with (executor ids/tags/server id mirror the original clone):

```typescript
import path from "node:path";
import { createGcpNode } from "@graph-context-protocol/scenario";
import type { GraphContextServer } from "@graph-context-protocol/server";

let serverPromise: Promise<GraphContextServer> | undefined;

/** Returns the started executor GCP server, building it once per process. */
export function getGcpServer(): Promise<GraphContextServer> {
    if (serverPromise === undefined) {
        serverPromise = createGcpNode({
            serverId: "server:executor",
            nodeId: "node:executor",
            knowledgeId: "knowledge:executor-context",
            graphId: "graph:executor",
            role: {
                id: "role:executor-context",
                name: "Executor Context",
                description: "Public read-only context for the executor node",
            },
            accessPolicy: {
                readableByRoles: [],
                requiredCapabilities: [],
                fallbackAllowed: true,
                denialMode: "empty-result",
            },
            knowledge: {
                filePath: path.join(process.cwd(), "CONTEXT-1.md"),
                tags: ["results", "log"],
                contentType: "text/markdown",
            },
        });
    }
    return serverPromise;
}
```

- [ ] **Step 5: Rewrite `apps/executor/src/lib/graph.ts`**

Replace the entire file with (executor uses temperature 0.2 and targets the researcher's knowledge):

```typescript
import { createNodeAgent } from "@graph-context-protocol/scenario";
import { env } from "@/env";

export const graph = createNodeAgent({
    llm: { model: env.OPENROUTER_MODEL, temperature: 0.2 },
    peers: [
        { peerUrl: env.PEER_GCP_URL, targetNodeId: "knowledge:researcher-context" },
    ],
    systemPrompt: `You are the EXECUTOR node in a Graph Context Protocol network.
You own a log of completed results and actions.
When the user asks what tasks are pending or what the researcher wants, use the
"query_peer_context" tool to read the researcher node's shared context, then
answer based on what you learn.`,
});
```

- [ ] **Step 6: Verify the executor app typechecks + builds**

Run: `pnpm nx run-many -t typecheck build -p executor`
Expected: PASS. Behavior identical to the previous clone.

- [ ] **Step 7: Commit**

```bash
git add apps/executor/package.json apps/executor/tsconfig.json apps/executor/src/lib/gcp.ts apps/executor/src/lib/graph.ts pnpm-lock.yaml
git commit -m "refactor(executor): build node + agent from @graph-context-protocol/scenario factory"
```

---

## Task 9: Backfill spec — core `discovery-functions`

`packages/core/src/lib/discovery/discovery-functions.ts` has no co-located test. This task adds one covering BFS traversal, the `denied` set (capability gating), path-rule matching, and filters. No production code changes.

**Files:**
- Test: `packages/core/src/lib/discovery/discovery-functions.spec.ts`

- [ ] **Step 1: Write the discovery test**

Create `packages/core/src/lib/discovery/discovery-functions.spec.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
    createAgentNode,
    createEdge,
    createGraph,
    createKnowledgeNode,
} from "../graph";
import {
    createCapability,
    createContextRule,
    createRole,
    SystemCapabilities,
} from "../role";
import {
    discoverAgents,
    discoverKnowledge,
    discoverNodes,
} from "./discovery-functions";
import { DiscoveryError } from "./discovery-types";

const discoverAll = [
    createCapability(SystemCapabilities.DISCOVER_AGENTS, "DA", "discover agents"),
    createCapability(
        SystemCapabilities.DISCOVER_KNOWLEDGE,
        "DK",
        "discover knowledge",
    ),
];
const readAllPaths = [createContextRule("graph.nodes.*", "read")];

const fullRole = createRole(
    "role:full",
    "Full",
    "can discover everything",
    discoverAll,
    readAllPaths,
);
const blindRole = createRole(
    "role:blind",
    "Blind",
    "has path access but no discovery capabilities",
    [],
    readAllPaths,
);
const ownerRole = createRole("role:owner", "Owner", "owns nodes");

function buildGraph(requesterRole = fullRole) {
    return createGraph("graph:test")
        .addNode(createAgentNode("node:req", requesterRole))
        .addNode(createAgentNode("node:peer", ownerRole))
        .addNode(
            createKnowledgeNode("knowledge:k", ownerRole, {
                tags: ["docs"],
                contentType: "text/markdown",
            }),
        )
        .addEdge(createEdge("edge:1", "node:req", "node:peer", "can-access"))
        .addEdge(createEdge("edge:2", "node:req", "knowledge:k", "can-access"));
}

describe("discoverNodes", () => {
    it("throws when the requester node is missing", () => {
        const graph = buildGraph();
        expect(() => discoverNodes(graph, "node:missing")).toThrow(DiscoveryError);
    });

    it("throws when the requester is not an agent node", () => {
        const graph = buildGraph();
        expect(() => discoverNodes(graph, "knowledge:k")).toThrow(DiscoveryError);
    });

    it("discovers reachable nodes with path + distance for a capable requester", () => {
        const graph = buildGraph();
        const result = discoverNodes(graph, "node:req");
        const ids = result.nodes.map((n) => n.node.id).sort();
        expect(ids).toEqual(["knowledge:k", "node:peer"]);
        expect(result.denied).toEqual([]);
        const peer = result.nodes.find((n) => n.node.id === "node:peer");
        expect(peer?.distance).toBe(1);
        expect(peer?.path).toEqual(["node:req", "node:peer"]);
    });

    it("collects reachable-but-unauthorized nodes in the denied set", () => {
        const graph = buildGraph(blindRole);
        const result = discoverNodes(graph, "node:req");
        expect(result.nodes).toEqual([]);
        expect([...result.denied].sort()).toEqual(["knowledge:k", "node:peer"]);
    });
});

describe("discoverAgents / discoverKnowledge", () => {
    it("discoverAgents returns only agent nodes", () => {
        const graph = buildGraph();
        const result = discoverAgents(graph, "node:req");
        expect(result.nodes.map((n) => n.node.id)).toEqual(["node:peer"]);
    });

    it("discoverKnowledge returns only knowledge nodes", () => {
        const graph = buildGraph();
        const result = discoverKnowledge(graph, "node:req");
        expect(result.nodes.map((n) => n.node.id)).toEqual(["knowledge:k"]);
    });

    it("applies a matching tag filter", () => {
        const graph = buildGraph();
        const result = discoverKnowledge(graph, "node:req", { tags: ["docs"] });
        expect(result.nodes.map((n) => n.node.id)).toEqual(["knowledge:k"]);
    });

    it("excludes nodes that fail a tag filter", () => {
        const graph = buildGraph();
        const result = discoverKnowledge(graph, "node:req", { tags: ["other"] });
        expect(result.nodes).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the test to verify it passes against existing code**

Run: `pnpm nx test @ai-do/core`
Expected: PASS. (This is a characterization test for shipped code; if an assertion fails, fix the *test's* expectation to match actual behavior — do not change `discovery-functions.ts` in M0.)

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/lib/discovery/discovery-functions.spec.ts
git commit -m "test(core): cover discovery-functions BFS, capability gating, filters"
```

---

## Task 10: Backfill spec — server `routing`

`packages/server/src/lib/routing/implementation.ts` has no test. Cover the deterministic route kinds. No production code change.

**Files:**
- Test: `packages/server/src/lib/routing/routing.spec.ts`

- [ ] **Step 1: Write the routing test**

Create `packages/server/src/lib/routing/routing.spec.ts`. The `externalAgents` and `knowledgeSources` collaborators are minimal stubs because the router only calls `externalAgents.getByNodeId`:

```typescript
import {
    createMessageHeader,
    createProtocolMessage,
    createRole,
    type ProtocolMessage,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import type { ExternalAgentRegistry } from "../agents/types";
import type { KnowledgeSourceRegistry } from "../knowledge/types";
import { createMessageRouter } from "./implementation";
import type { RoutingContext } from "./types";

function createMessage(target: string): ProtocolMessage {
    const header = createMessageHeader(
        "msg:test",
        "node:source",
        target,
        "notification",
    );
    const ctx = {
        id: "ctx:test",
        graphId: "graph:test",
        currentNode: "node:source",
        accumulatedData: {},
        role: createRole("role:test", "Test Role", "A test role"),
        metadata: {},
        createdAt: new Date().toISOString(),
        path: ["node:source"],
    };
    return createProtocolMessage(header, ctx, { value: "test" });
}

function makeContext(
    overrides: Partial<RoutingContext> = {},
): RoutingContext {
    const externalAgents = {
        getByNodeId: (nodeId: string) =>
            nodeId === "node:ext"
                ? {
                      id: "ext:1",
                      connectionId: "conn:1",
                      transportId: "transport:1",
                      status: "online",
                  }
                : undefined,
    } as unknown as ExternalAgentRegistry;

    return {
        localNodeId: "node:local",
        connections: {} as unknown as RoutingContext["connections"],
        externalAgents,
        knowledgeSources: {} as unknown as KnowledgeSourceRegistry,
        ...overrides,
    };
}

describe("createMessageRouter", () => {
    const router = createMessageRouter();

    it("routes a message addressed to the local node to local-handler", () => {
        const result = router.route(createMessage("node:local"), makeContext());
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.kind).toBe("local-handler");
            expect(result.data.targetNodeId).toBe("node:local");
        }
    });

    it("routes a known external agent to external-agent", () => {
        const result = router.route(createMessage("node:ext"), makeContext());
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.kind).toBe("external-agent");
            expect(result.data.externalAgentId).toBe("ext:1");
            expect(result.data.transportId).toBe("transport:1");
        }
    });

    it("routes an unknown target to undeliverable", () => {
        const result = router.route(createMessage("node:nope"), makeContext());
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.kind).toBe("undeliverable");
            expect(result.data.metadata.reason).toBe("Target not found");
        }
    });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm nx test server`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/lib/routing/routing.spec.ts
git commit -m "test(server): cover message router route kinds"
```

---

## Task 11: Backfill spec — server `sync`

`packages/server/src/lib/sync/implementation.ts` has no test. Cover run / cancel / status / list. No production code change.

**Files:**
- Test: `packages/server/src/lib/sync/sync.spec.ts`

- [ ] **Step 1: Write the sync test**

Create `packages/server/src/lib/sync/sync.spec.ts`:

```typescript
import { succeed } from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import type { KnowledgeSourceAdapter } from "../knowledge/types";
import { createSyncScheduler } from "./implementation";
import type { SyncRequest, SyncResult } from "./types";

function syncRequest(sourceId: string): SyncRequest {
    return { sourceId, mode: "full", metadata: {} };
}

function adapterWithSync(id: string): KnowledgeSourceAdapter {
    return {
        id,
        capabilities: ["search"],
        query: async () =>
            succeed({ sourceId: id, nodes: [], raw: {}, metadata: {} }),
        sync: async (request) =>
            succeed<SyncResult>({
                sourceId: request.sourceId,
                status: "completed",
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                nodesAdded: 1,
                nodesUpdated: 0,
                nodesRemoved: 0,
                errors: [],
                metadata: {},
            }),
    } as unknown as KnowledgeSourceAdapter;
}

function adapterWithoutSync(id: string): KnowledgeSourceAdapter {
    return {
        id,
        capabilities: ["search"],
        query: async () =>
            succeed({ sourceId: id, nodes: [], raw: {}, metadata: {} }),
    } as unknown as KnowledgeSourceAdapter;
}

describe("createSyncScheduler", () => {
    it("fails run for an unknown source", async () => {
        const scheduler = createSyncScheduler();
        const result = await scheduler.run(syncRequest("src:unknown"));
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("not-found");
        }
    });

    it("fails run when the adapter does not support sync", async () => {
        const adapters = new Map([["src:a", adapterWithoutSync("src:a")]]);
        const scheduler = createSyncScheduler(adapters);
        const result = await scheduler.run(syncRequest("src:a"));
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("sync-error");
        }
    });

    it("runs a sync-capable adapter and returns its result", async () => {
        const adapters = new Map([["src:a", adapterWithSync("src:a")]]);
        const scheduler = createSyncScheduler(adapters);
        const result = await scheduler.run(syncRequest("src:a"));
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.status).toBe("completed");
            expect(result.data.nodesAdded).toBe(1);
        }
    });

    it("reports idle status and empty list before any operation", () => {
        const scheduler = createSyncScheduler();
        expect(scheduler.status("src:a")).toBe("idle");
        expect(scheduler.list()).toEqual([]);
    });

    it("fails cancel when no operation is tracked", async () => {
        const scheduler = createSyncScheduler();
        const result = await scheduler.cancel("src:a");
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("not-found");
        }
    });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm nx test server`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/lib/sync/sync.spec.ts
git commit -m "test(server): cover sync scheduler run/cancel/status/list"
```

---

## Task 12: Backfill spec — server `server` orchestrator

`packages/server/src/lib/server/implementation.ts` (`GraphContextServerImpl`) has no co-located test. Cover lifecycle transitions and the send/receive status guards. No production code change.

**Files:**
- Test: `packages/server/src/lib/server/server.spec.ts`

- [ ] **Step 1: Write the orchestrator test**

Create `packages/server/src/lib/server/server.spec.ts`:

```typescript
import {
    createMessageHeader,
    createProtocolMessage,
    createRole,
    type ProtocolMessage,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { createGraphContextServer } from "./implementation";

const config = {
    id: "server:test",
    localNodeId: "node:local",
    shutdownTimeoutMs: 1000,
};

function localMessage(): ProtocolMessage {
    const header = createMessageHeader(
        "msg:test",
        "node:other",
        "node:local",
        "notification",
    );
    const ctx = {
        id: "ctx:test",
        graphId: "graph:test",
        currentNode: "node:other",
        accumulatedData: {},
        role: createRole("role:test", "Test Role", "A test role"),
        metadata: {},
        createdAt: new Date().toISOString(),
        path: ["node:other"],
    };
    return createProtocolMessage(header, ctx, { value: "ping" });
}

describe("GraphContextServer lifecycle", () => {
    it("starts idle, transitions to ready on start, and to stopped on stop", async () => {
        const server = createGraphContextServer(config);
        expect(server.status).toBe("idle");

        const started = await server.start();
        expect(started.success).toBe(true);
        expect(server.status).toBe("ready");
        expect(server.snapshot().localNodeId).toBe("node:local");

        const stopped = await server.stop();
        expect(stopped.success).toBe(true);
        expect(server.status).toBe("stopped");
    });

    it("rejects start when already ready", async () => {
        const server = createGraphContextServer(config);
        await server.start();
        const again = await server.start();
        expect(again.success).toBe(false);
        if (!again.success) {
            expect(again.error.code).toBe("lifecycle-error");
        }
    });

    it("rejects send before the server is ready", async () => {
        const server = createGraphContextServer(config);
        const result = await server.send(localMessage());
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("lifecycle-error");
        }
    });

    it("delivers a message addressed to the local node once ready", async () => {
        const server = createGraphContextServer(config);
        await server.start();
        const result = await server.send(localMessage());
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.delivered).toBe(true);
        }
    });

    it("rejects receive before the server is ready", async () => {
        const server = createGraphContextServer(config);
        const result = await server.receive({
            transportId: "memory",
            payload: localMessage(),
            receivedAt: new Date().toISOString(),
            metadata: {},
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("lifecycle-error");
        }
    });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm nx test server`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/lib/server/server.spec.ts
git commit -m "test(server): cover GraphContextServer lifecycle + send/receive guards"
```

---

## Task 13: Full-workspace verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full target sweep across the graph**

Run: `pnpm nx run-many -t lint test build typecheck`
Expected: every project PASSES (green). This is the spec's primary acceptance gate.

- [ ] **Step 2: Confirm no protocol/behavior change in the demo wiring**

Confirm by inspection that the rewritten apps produce the same observable demo as before:
- researcher: `server:researcher` / `node:researcher` / `knowledge:researcher-context`, tags `["tasks","notes"]`, temperature `0.7`, peer target `knowledge:executor-context`.
- executor: `server:executor` / `node:executor` / `knowledge:executor-context`, tags `["results","log"]`, temperature `0.2`, peer target `knowledge:researcher-context`.

Run: `git diff --stat HEAD~12 -- apps/` (review that only `lib/gcp.ts`, `lib/graph.ts`, `package.json`, `tsconfig.json` changed in each app; no API route, env, or component changes).
Expected: only those four files per app changed.

- [ ] **Step 3: Final commit (only if Step 1/2 surfaced fixes)**

If any verification fix was needed, commit it:

```bash
git add -A
git commit -m "chore(m0): finalize foundations cleanup; full workspace green"
```

If nothing changed, skip this step — M0 is complete.

---

## Acceptance Criteria (from spec §6)

- [x] A single manifest launches N nodes headless (Task 6); researcher + executor reproduced from the factory with identical demo behavior (Tasks 7–8, verified Task 13 §2).
- [x] `pnpm nx run-many -t lint test build typecheck` green (Task 13 §1).
- [x] New specs exist and pass for `discovery-functions`, `routing`, `server`, `sync` (Tasks 9–12).
- [x] No protocol/behavior change observable in the existing 2-node demo (Task 13 §2).

## Notes & Risks

- **Singleton isolation (spec §8):** `createGcpNode` deliberately has **no** module-scoped singleton — it builds and starts a fresh server per call, so `runManifest` can run N nodes in one process without shared state. Each app keeps its own module-scoped `serverPromise` wrapper for the per-process memoization the Next.js runtime expects.
- **Characterization tests (Tasks 9–12):** these test *shipped* behavior. If an assertion disagrees with the code, correct the assertion — M0 changes no protocol semantics. Any genuine bug found is logged for M1+, not fixed here.
- **Vitest project names** are mixed in this repo (`@ai-do/core` vs `@graph-context-protocol/adapters`); `nx test` accepts the Nx project name (`@ai-do/core`, `server`, `@graph-context-protocol/scenario`). Use `pnpm nx show projects` if a target name is uncertain.
