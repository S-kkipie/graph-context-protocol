# M4b A2A Message-Passing Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the experimental control arm — a good-faith, real-SDK A2A message-passing implementation that runs the same scenario tasks as the GCP arm, sharing one substrate-neutral agent brain so the article can compare context-federation vs message-passing on coupling, leakage, and cost at equal task success.

**Architecture:** A new neutral package `@graph-context-protocol/agent-core` holds the shared brain (`createTaskAgent`), the neutral coupling-metric seam, and the three scenario definitions. The existing GCP arm (`@graph-context-protocol/scenario`) and the new A2A arm (`@graph-context-protocol/baseline`) each bind that brain to a substrate via a `PeerContextToolFactory` — GCP federated read vs A2A `sendMessage` over `@a2a-js/sdk`. The only code that differs between arms is the tool factory; everything else (LLM, prompt, retry, task defs, metric shape) comes from `agent-core`. That structural symmetry is the fairness contract.

**Tech Stack:** Nx 22, pnpm 9, Node 20, TypeScript 5.9 (strict, project references, `@ai-do/source` customCondition), Zod 4, Vitest 4, Biome 2 (4-space indent), LangChain/LangGraph (`@langchain/core`, `@langchain/langgraph`, `@langchain/openai`), `@a2a-js/sdk` + `express`.

## Global Constraints

- Node ≥20, pnpm ≥9; TypeScript 5.9 strict; project references; `@ai-do/source` customCondition resolves `@graph-context-protocol/*` to TS source.
- Zod 4 rules: use `.default([])` for arrays; use `.prefault({})` (not `.default({})`) when an object key is omitted and its inner field-defaults must apply.
- Biome 2, 4-space indent. Run `pnpm biome check --write <files>` before each commit; commit only the task's files.
- Vitest 4. nx project names use the scoped form `@graph-context-protocol/<pkg>` (e.g. `pnpm nx test @graph-context-protocol/agent-core`); `server` is the lone short name. Typecheck via `pnpm nx typecheck @graph-context-protocol/<pkg>`.
- **LANDMINE:** never run `nx <target> projA projB` (single target, two projects) — nx forwards the 2nd as a tsc positional → `error TS5083`. Use `pnpm nx run-many -t <target> -p A B`.
- New packages mirror the existing package scaffold exactly: `package.json` (type module, `@ai-do/source` export condition), `tsconfig.json` + `tsconfig.lib.json` + `tsconfig.spec.json`, `vitest.config.mts`, `src/index.ts`. Nx infers projects from `package.json` + the nx plugins; no `project.json` needed. After creating a new `package.json`, run `pnpm install` so the workspace links it.
- **Additive only:** `@graph-context-protocol/core` and `@graph-context-protocol/server` contracts are unchanged — no `ContractVersion` bump, no edits to their `src/`. The GCP-arm refactor must be behavior-preserving (`createNodeAgent`'s public signature and behavior are preserved; both Next apps import it unchanged).
- **Fairness invariant:** both arms call `agent-core`'s `createTaskAgent` + `runTaskAgent`; they differ ONLY in the `PeerContextToolFactory` passed in. Never duplicate the brain, the prompt handling, the retry, or the answer-extraction across arms.
- **Security:** the OpenRouter key lives ONLY in git-ignored `.env.local`; never commit it; real-LLM tests skip when `OPENROUTER_API_KEY` is absent; no key in CI. A2A servers bind localhost ephemeral ports in tests and always `close()` in teardown; no external exposure. Demo tokens (`tok:*`) are not secrets. Never commit build artifacts (`.next/`, `*.tsbuildinfo`, `next-env.d.ts`), `.claude/`, or `dist/`.
- Pin third-party versions: `@a2a-js/sdk` `^0.3.13`, `express` `^5.1.0`, `@types/express` `^5.0.0`.

## File Structure

**New package `packages/agent-core` (`@graph-context-protocol/agent-core`)** — substrate-neutral, depends on `@langchain/*` + `zod` only:
- `src/lib/metrics.ts` — `Credentials`, `CouplingMetrics`, `CouplingMetricsSnapshot`, `createCouplingMetrics`.
- `src/lib/types.ts` — `PeerRef`, `PeerContextToolFactory`, `TaskAgentConfig`.
- `src/lib/llm.ts` — `OpenRouterLLMConfig`, `createOpenRouterLLM` (neutral copy; keeps agent-core free of the GCP `langgraph` package).
- `src/lib/task-agent.ts` — `createTaskAgent`, `runTaskAgent`.
- `src/lib/scenarios/types.ts` — `KnowledgeNodeDef`, `AgentNodeDef`, `ScenarioDef`, `ScenarioId`, `PROVIDE_CONTEXT_SKILL`.
- `src/lib/scenarios/marketplace.ts`, `software-org.ts`, `supply-chain.ts`, `index.ts` (`SCENARIOS`).
- `src/index.ts` — barrel.

**Modified package `packages/scenario` (`@graph-context-protocol/scenario`)** — GCP arm:
- `src/lib/gcp-peer-context-tool.ts` (Create) — `createGcpPeerContextToolFactory`.
- `src/lib/node-agent.ts` (Modify) — delegate to `agent-core`'s `createTaskAgent`; keep signature; accept optional `metrics`.
- `src/lib/scenario-parity.spec.ts` (Create, Task 6) — gated cross-arm harness (`runGcpArm` / `runA2aArm`) + tests, **kept in the spec file** so `baseline` stays a test-only dependency and never enters the GCP package's lib graph.
- `package.json` (Modify) — add `@graph-context-protocol/agent-core` dep (Task 2); add `@graph-context-protocol/baseline` devDep (Task 6).
- `tsconfig.lib.json` (Modify, Task 2) — add `agent-core` reference; `tsconfig.spec.json` (Modify, Task 6) — add `baseline` reference.

**New package `packages/baseline` (`@graph-context-protocol/baseline`)** — A2A arm, depends on `agent-core` + `@a2a-js/sdk` + `express`:
- `src/lib/agent-card.ts` — `buildAgentCard`.
- `src/lib/knowledge-executor.ts` — `KnowledgeExecutor` (card-declared coarse allow/deny).
- `src/lib/baseline-node.ts` — `createBaselineNode`, `BaselineNodeHandle`, `CreateBaselineNodeOptions`.
- `src/lib/a2a-peer-context-tool.ts` — `createA2aPeerContextToolFactory`.
- `src/lib/agent-executor.ts` — `BrainExecutor`.
- `src/index.ts` — barrel.

---

### Task 1: `agent-core` package — neutral seam + shared brain

**Files:**
- Create: `packages/agent-core/package.json`, `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`, `vitest.config.mts`
- Create: `packages/agent-core/src/index.ts`
- Create: `packages/agent-core/src/lib/metrics.ts`, `src/lib/types.ts`, `src/lib/llm.ts`, `src/lib/task-agent.ts`
- Test: `packages/agent-core/src/lib/metrics.spec.ts`, `src/lib/task-agent.spec.ts`

**Interfaces:**
- Produces:
  - `Credentials = { readonly type: string; readonly value: unknown; readonly metadata?: Record<string, unknown> }`
  - `CouplingMetricsSnapshot = { readonly peersKnown: number; readonly connectionsOpened: number; readonly messagesSent: number }`
  - `CouplingMetrics = { recordPeerContacted(peerId: string): void; recordMessageSent(): void; setPeersKnown(count: number): void; snapshot(): CouplingMetricsSnapshot }`
  - `createCouplingMetrics(): CouplingMetrics`
  - `PeerRef = { readonly peerId: string; readonly targetNodeId: string; readonly endpoint: string; readonly credentials?: Credentials }`
  - `PeerContextToolFactory = (peer: PeerRef, metrics: CouplingMetrics) => StructuredTool`
  - `TaskAgentConfig = { readonly llm: { model?: string; temperature?: number; apiKey?: string }; readonly systemPrompt: string; readonly peers: ReadonlyArray<PeerRef>; readonly toolFactory: PeerContextToolFactory; readonly metrics: CouplingMetrics }`
  - `createTaskAgent(config: TaskAgentConfig)` → compiled react agent
  - `runTaskAgent(agent, goal: string): Promise<string>`
  - `createOpenRouterLLM(config?: OpenRouterLLMConfig): ChatOpenAI`

- [ ] **Step 1: Scaffold the package files**

Create `packages/agent-core/package.json`:

```json
{
    "name": "@graph-context-protocol/agent-core",
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
        "@langchain/core": "^0.3.0",
        "@langchain/langgraph": "^0.2.0",
        "@langchain/openai": "^0.5.0",
        "zod": "^4.4.3"
    }
}
```

Create `packages/agent-core/tsconfig.json`:

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

Create `packages/agent-core/tsconfig.lib.json`:

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
    "references": [],
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

Create `packages/agent-core/tsconfig.spec.json`:

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
    "references": [{ "path": "./tsconfig.lib.json" }]
}
```

Create `packages/agent-core/vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig(() => ({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/packages/agent-core",
    test: {
        name: "@graph-context-protocol/agent-core",
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

- [ ] **Step 2: Run `pnpm install` to link the workspace package**

Run: `pnpm install`
Expected: completes; `@graph-context-protocol/agent-core` linked into the workspace.

- [ ] **Step 3: Write the failing metrics test**

Create `packages/agent-core/src/lib/metrics.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createCouplingMetrics } from "./metrics";

describe("createCouplingMetrics", () => {
    it("dedupes peers contacted into connectionsOpened", () => {
        const m = createCouplingMetrics();
        m.recordPeerContacted("peer:a");
        m.recordPeerContacted("peer:a");
        m.recordPeerContacted("peer:b");
        expect(m.snapshot().connectionsOpened).toBe(2);
    });

    it("counts every message sent and reports peers known", () => {
        const m = createCouplingMetrics();
        m.setPeersKnown(5);
        m.recordMessageSent();
        m.recordMessageSent();
        const snap = m.snapshot();
        expect(snap.messagesSent).toBe(2);
        expect(snap.peersKnown).toBe(5);
        expect(snap.connectionsOpened).toBe(0);
    });
});
```

- [ ] **Step 4: Run the metrics test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/agent-core`
Expected: FAIL — cannot find module `./metrics`.

- [ ] **Step 5: Implement metrics + types**

Create `packages/agent-core/src/lib/metrics.ts`:

```ts
/**
 * Substrate-neutral coupling-metric seam, measured at the agent's
 * peer-call boundary. Both the GCP arm and the A2A baseline increment the
 * SAME interface so the comparison is symmetric by construction.
 *
 * @module metrics
 */

/** Opaque per-peer auth payload; each substrate interprets `value`. */
export interface Credentials {
    readonly type: string;
    readonly value: unknown;
    readonly metadata?: Record<string, unknown>;
}

/** Pull-based coupling counts for one agent over a run. */
export interface CouplingMetricsSnapshot {
    /** Peers this agent was given (its peer list length). */
    readonly peersKnown: number;
    /** Distinct peers this agent had to contact (Set-deduped). */
    readonly connectionsOpened: number;
    /** Total peer messages sent. */
    readonly messagesSent: number;
}

/** Mutable coupling-metric accumulator. */
export interface CouplingMetrics {
    recordPeerContacted(peerId: string): void;
    recordMessageSent(): void;
    setPeersKnown(count: number): void;
    snapshot(): CouplingMetricsSnapshot;
}

/**
 * Creates an in-memory accumulator. `connectionsOpened` is the count of
 * DISTINCT peers contacted; `messagesSent` is the total peer message count;
 * `peersKnown` is set explicitly (usually the agent's peer-list length).
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

Create `packages/agent-core/src/lib/types.ts`:

```ts
/**
 * Neutral agent-brain seam: a peer reference and the tool-factory the brain
 * uses to consult one peer. The factory is the ONLY thing that differs
 * between the GCP and A2A arms.
 *
 * @module types
 */

import type { StructuredTool } from "@langchain/core/tools";
import type { CouplingMetrics, Credentials } from "./metrics";

/** A peer an agent can consult. Endpoint meaning is substrate-specific. */
export interface PeerRef {
    readonly peerId: string;
    /** Knowledge/agent id at the peer (GCP target node id / A2A skill target). */
    readonly targetNodeId: string;
    /** Peer URL — GCP context-query URL, or A2A base URL. */
    readonly endpoint: string;
    readonly credentials?: Credentials;
}

/** Builds the LangChain tool the LLM calls to read one peer; records metrics. */
export type PeerContextToolFactory = (
    peer: PeerRef,
    metrics: CouplingMetrics,
) => StructuredTool;

/** Everything the shared brain needs; identical shape across both arms. */
export interface TaskAgentConfig {
    readonly llm: {
        readonly model?: string;
        readonly temperature?: number;
        readonly apiKey?: string;
    };
    readonly systemPrompt: string;
    readonly peers: ReadonlyArray<PeerRef>;
    readonly toolFactory: PeerContextToolFactory;
    readonly metrics: CouplingMetrics;
}
```

Create `packages/agent-core/src/lib/llm.ts` (neutral copy of the OpenRouter factory; agent-core must not depend on the GCP `langgraph` package):

```ts
/**
 * OpenRouter LLM factory (OpenAI-compatible). Neutral so both arms share one
 * LLM construction path — no fairness drift between arms.
 *
 * @module llm
 */

import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

export interface OpenRouterLLMConfig {
    readonly model?: string;
    readonly temperature?: number;
    readonly maxTokens?: number;
    readonly apiKey?: string;
    readonly baseURL?: string;
}

const OpenRouterLLMConfigSchema = z.object({
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().positive().optional(),
    apiKey: z.string().optional(),
    baseURL: z.string().url().optional(),
});

/**
 * Creates a ChatOpenAI configured for OpenRouter. Reads the key from
 * `OPENROUTER_API_KEY` if not passed. Construction makes NO network call.
 *
 * @throws Error if no API key is available.
 */
export function createOpenRouterLLM(
    config: OpenRouterLLMConfig = {},
): ChatOpenAI {
    const validated = OpenRouterLLMConfigSchema.parse(config);
    const apiKey = validated.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error(
            "OpenRouter API key is required. Set OPENROUTER_API_KEY environment variable or pass apiKey explicitly.",
        );
    }
    return new ChatOpenAI({
        model: validated.model ?? "openai/gpt-4o-mini",
        temperature: validated.temperature ?? 0.7,
        maxTokens: validated.maxTokens ?? 2048,
        apiKey,
        configuration: {
            baseURL: validated.baseURL ?? "https://openrouter.ai/api/v1",
        },
    });
}
```

- [ ] **Step 6: Write the failing task-agent test**

Create `packages/agent-core/src/lib/task-agent.spec.ts`:

```ts
import { type StructuredTool, tool } from "@langchain/core/tools";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCouplingMetrics } from "./metrics";
import { createTaskAgent } from "./task-agent";
import type { PeerContextToolFactory, PeerRef } from "./types";

const InputSchema = z.object({ question: z.string() });

function fakeToolFactory(): {
    factory: PeerContextToolFactory;
    calls: PeerRef[];
} {
    const calls: PeerRef[] = [];
    const factory: PeerContextToolFactory = (peer): StructuredTool => {
        calls.push(peer);
        return tool(async () => "stub", {
            name: "query_peer_context",
            description: "stub",
            schema: InputSchema,
        });
    };
    return { factory, calls };
}

describe("createTaskAgent", () => {
    it("builds one tool per peer and records peers known", () => {
        const { factory, calls } = fakeToolFactory();
        const metrics = createCouplingMetrics();
        const setPeersKnown = vi.spyOn(metrics, "setPeersKnown");
        const peers: PeerRef[] = [
            { peerId: "p:1", targetNodeId: "k:1", endpoint: "http://a" },
            { peerId: "p:2", targetNodeId: "k:2", endpoint: "http://b" },
        ];

        const agent = createTaskAgent({
            llm: { apiKey: "test-key" },
            systemPrompt: "you are a test agent",
            peers,
            toolFactory: factory,
            metrics,
        });

        expect(agent).toBeTruthy();
        expect(calls).toHaveLength(2);
        expect(calls.map((c) => c.peerId)).toEqual(["p:1", "p:2"]);
        expect(setPeersKnown).toHaveBeenCalledWith(2);
    });
});
```

- [ ] **Step 7: Run the task-agent test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/agent-core`
Expected: FAIL — cannot find module `./task-agent`.

- [ ] **Step 8: Implement the shared brain**

Create `packages/agent-core/src/lib/task-agent.ts`:

```ts
/**
 * The shared agent brain: a react agent whose per-peer tools are injected via
 * a substrate-specific PeerContextToolFactory. Identical across both arms.
 *
 * @module task-agent
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { createOpenRouterLLM } from "./llm";
import type { TaskAgentConfig } from "./types";

/**
 * Builds a react agent over the configured peers. Construction makes no
 * network call; `setPeersKnown` records the peer count and the tool factory
 * builds one tool per peer (the per-call coupling metrics live inside it).
 */
export function createTaskAgent(config: TaskAgentConfig) {
    const llm = createOpenRouterLLM({
        apiKey: config.llm.apiKey,
        model: config.llm.model,
        temperature: config.llm.temperature,
    });
    config.metrics.setPeersKnown(config.peers.length);
    const tools = config.peers.map((peer) =>
        config.toolFactory(peer, config.metrics),
    );
    return createReactAgent({
        llm,
        tools,
        prompt: new SystemMessage(config.systemPrompt),
    });
}

/**
 * Runs a task agent against a goal and returns its final textual answer.
 * Single answer-extraction path so both arms read results identically.
 */
export async function runTaskAgent(
    agent: ReturnType<typeof createTaskAgent>,
    goal: string,
): Promise<string> {
    const result = await agent.invoke({
        messages: [new HumanMessage(goal)],
    });
    const messages = result.messages;
    const last = messages[messages.length - 1];
    return typeof last.content === "string"
        ? last.content
        : JSON.stringify(last.content);
}
```

- [ ] **Step 9: Create the barrel**

Create `packages/agent-core/src/index.ts`:

```ts
export type {
    CouplingMetrics,
    CouplingMetricsSnapshot,
    Credentials,
} from "./lib/metrics";
export { createCouplingMetrics } from "./lib/metrics";
export type { OpenRouterLLMConfig } from "./lib/llm";
export { createOpenRouterLLM } from "./lib/llm";
export { createTaskAgent, runTaskAgent } from "./lib/task-agent";
export type {
    PeerContextToolFactory,
    PeerRef,
    TaskAgentConfig,
} from "./lib/types";
```

- [ ] **Step 10: Run tests + typecheck**

Run: `pnpm nx test @graph-context-protocol/agent-core`
Expected: PASS (3 tests).
Run: `pnpm nx typecheck @graph-context-protocol/agent-core`
Expected: PASS, no errors.

- [ ] **Step 11: Format + commit**

```bash
pnpm biome check --write packages/agent-core
git add packages/agent-core pnpm-lock.yaml
git commit -m "feat(agent-core): substrate-neutral brain + coupling-metric seam"
```

---

### Task 2: GCP arm binding — `createGcpPeerContextToolFactory` + refactor `createNodeAgent`

**Files:**
- Create: `packages/scenario/src/lib/gcp-peer-context-tool.ts`
- Modify: `packages/scenario/src/lib/node-agent.ts`
- Modify: `packages/scenario/package.json`, `tsconfig.lib.json`
- Modify: `packages/scenario/src/index.ts`
- Test: `packages/scenario/src/lib/gcp-peer-context-tool.spec.ts`

**Interfaces:**
- Consumes (from Task 1): `PeerRef`, `PeerContextToolFactory`, `CouplingMetrics`, `createCouplingMetrics`, `createTaskAgent` from `@graph-context-protocol/agent-core`.
- Produces:
  - `GcpPeerContextToolOptions = { readonly queryFn?: typeof queryRemoteContext; readonly requesterId?: string }`
  - `createGcpPeerContextToolFactory(opts?: GcpPeerContextToolOptions): PeerContextToolFactory`
  - `createNodeAgent(config: NodeAgentConfig, opts?: { metrics?: CouplingMetrics })` — signature-compatible with today's single-arg call.

- [ ] **Step 1: Add the agent-core dependency**

Edit `packages/scenario/package.json` — add to `dependencies`:

```json
        "@graph-context-protocol/agent-core": "workspace:*",
```

Edit `packages/scenario/tsconfig.lib.json` — add to `references` (alongside the existing core/server/adapters/langgraph entries):

```json
        { "path": "../agent-core/tsconfig.lib.json" },
```

Run: `pnpm install`
Expected: completes; dependency linked.

- [ ] **Step 2: Write the failing factory test**

Create `packages/scenario/src/lib/gcp-peer-context-tool.spec.ts`:

```ts
import {
    createCouplingMetrics,
    type PeerRef,
} from "@graph-context-protocol/agent-core";
import type { queryRemoteContext } from "@graph-context-protocol/server";
import { describe, expect, it } from "vitest";
import { createGcpPeerContextToolFactory } from "./gcp-peer-context-tool";

const peer: PeerRef = {
    peerId: "peer:exec",
    targetNodeId: "knowledge:executor-context",
    endpoint: "http://exec/gcp",
};

describe("createGcpPeerContextToolFactory", () => {
    it("records coupling metrics and returns the peer's context on ok", async () => {
        const fakeQuery: typeof queryRemoteContext = async () =>
            ({
                queryId: "q:1",
                status: "ok",
                sourceNodeId: "node:exec",
                result: "remote answer",
            }) as Awaited<ReturnType<typeof queryRemoteContext>>;
        const metrics = createCouplingMetrics();
        const factory = createGcpPeerContextToolFactory({ queryFn: fakeQuery });
        const tool = factory(peer, metrics);

        const out = await tool.invoke({ question: "status?" });

        expect(out).toBe("remote answer");
        const snap = metrics.snapshot();
        expect(snap.connectionsOpened).toBe(1);
        expect(snap.messagesSent).toBe(1);
    });

    it("returns a fail-soft string when the peer is unreachable", async () => {
        const fakeQuery: typeof queryRemoteContext = async () => {
            throw new Error("boom");
        };
        const metrics = createCouplingMetrics();
        const factory = createGcpPeerContextToolFactory({ queryFn: fakeQuery });
        const tool = factory(peer, metrics);

        const out = await tool.invoke({ question: "status?" });

        expect(out).toContain("Failed to reach peer node");
        expect(out).toContain("boom");
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: FAIL — cannot find module `./gcp-peer-context-tool`.

- [ ] **Step 4: Implement the GCP tool factory**

Create `packages/scenario/src/lib/gcp-peer-context-tool.ts`:

```ts
/**
 * GCP-arm binding of the neutral PeerContextToolFactory: each peer call is a
 * read-first GCP context-query, with coupling metrics recorded at the call.
 *
 * @module gcp-peer-context-tool
 */

import type {
    CouplingMetrics,
    PeerContextToolFactory,
    PeerRef,
} from "@graph-context-protocol/agent-core";
import {
    createContextQuery,
    createRequesterDescriptor,
} from "@graph-context-protocol/core";
import {
    type Credentials,
    queryRemoteContext,
} from "@graph-context-protocol/server";
import { type StructuredTool, tool } from "@langchain/core/tools";
import { z } from "zod";

export interface GcpPeerContextToolOptions {
    /** Injectable client for testing. Defaults to `queryRemoteContext`. */
    readonly queryFn?: typeof queryRemoteContext;
    /** Principal id placed in the (audit-only) requester descriptor. */
    readonly requesterId?: string;
}

const InputSchema = z.object({
    question: z
        .string()
        .min(1)
        .describe("The natural-language question to ask the peer node's context"),
});

/**
 * Builds a PeerContextToolFactory bound to the GCP federated-read substrate.
 */
export function createGcpPeerContextToolFactory(
    opts: GcpPeerContextToolOptions = {},
): PeerContextToolFactory {
    const queryFn = opts.queryFn ?? queryRemoteContext;
    const requesterId = opts.requesterId ?? "principal:peer-agent";
    return (peer: PeerRef, metrics: CouplingMetrics): StructuredTool =>
        tool(
            async (input: unknown): Promise<string> => {
                const { question } = InputSchema.parse(input);
                metrics.recordPeerContacted(peer.peerId);
                metrics.recordMessageSent();
                const requester = createRequesterDescriptor(
                    requesterId,
                    [],
                    [],
                );
                const query = createContextQuery(
                    `query:${crypto.randomUUID()}`,
                    requester,
                    peer.targetNodeId,
                    "text",
                    question,
                );
                try {
                    const result = await queryFn({
                        url: peer.endpoint,
                        query,
                        credentials: peer.credentials as
                            | Credentials
                            | undefined,
                    });
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
            {
                name: "query_peer_context",
                description: `Read the shared context owned by the peer node "${peer.targetNodeId}" over the Graph Context Protocol. Use this to learn what the other node knows or has done.`,
                schema: InputSchema,
            },
        );
}
```

> Note: `peer.credentials` (agent-core `Credentials`) is structurally identical to server `Credentials` (`{ type; value; metadata? }`). If strict mode rejects the `metadata` field's nominal type, keep the `as Credentials | undefined` cast shown above.

- [ ] **Step 5: Refactor `createNodeAgent` to delegate to the shared brain**

Replace the entire body of `packages/scenario/src/lib/node-agent.ts` with:

```ts
import {
    type CouplingMetrics,
    createCouplingMetrics,
    createTaskAgent,
    type PeerRef,
} from "@graph-context-protocol/agent-core";
import type { NodeAgentConfig } from "./config";
import { createGcpPeerContextToolFactory } from "./gcp-peer-context-tool";

/**
 * Builds a react agent that can read peer context over GCP.
 *
 * Thin GCP-arm wrapper over the shared `createTaskAgent`: it maps the node's
 * peer config to neutral PeerRefs and binds the GCP federated-read substrate.
 * The optional `metrics` lets a harness collect coupling counts; omitted
 * callers (the Next apps) get a private accumulator and are unaffected.
 */
export function createNodeAgent(
    config: NodeAgentConfig,
    opts: { metrics?: CouplingMetrics } = {},
) {
    const metrics = opts.metrics ?? createCouplingMetrics();
    const peers: PeerRef[] = config.peers.map((peer) => ({
        peerId: peer.targetNodeId,
        targetNodeId: peer.targetNodeId,
        endpoint: peer.peerUrl,
        credentials: peer.credentials as PeerRef["credentials"],
    }));
    return createTaskAgent({
        llm: config.llm,
        systemPrompt: config.systemPrompt,
        peers,
        toolFactory: createGcpPeerContextToolFactory(),
        metrics,
    });
}
```

> Note: `config.peers[].credentials` is the server `Credentials`; it is structurally compatible with agent-core `Credentials`. Keep the `as PeerRef["credentials"]` cast if strict mode requires it.

- [ ] **Step 6: Export the factory from the barrel**

Edit `packages/scenario/src/index.ts` — add:

```ts
export type { GcpPeerContextToolOptions } from "./lib/gcp-peer-context-tool";
export { createGcpPeerContextToolFactory } from "./lib/gcp-peer-context-tool";
```

- [ ] **Step 7: Run tests + typecheck (existing node-agent tests must stay green)**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: PASS — the new factory tests AND the pre-existing `node-agent.spec.ts` and all other scenario specs.
Run: `pnpm nx typecheck @graph-context-protocol/scenario`
Expected: PASS.

- [ ] **Step 8: Verify the apps still build (signature preserved)**

Run: `pnpm nx build researcher`
Expected: PASS (Next build; `createNodeAgent(config)` single-arg call unchanged).

- [ ] **Step 9: Format + commit**

```bash
pnpm biome check --write packages/scenario/src/lib/gcp-peer-context-tool.ts packages/scenario/src/lib/gcp-peer-context-tool.spec.ts packages/scenario/src/lib/node-agent.ts packages/scenario/src/index.ts packages/scenario/package.json packages/scenario/tsconfig.lib.json
git add packages/scenario/src/lib/gcp-peer-context-tool.ts packages/scenario/src/lib/gcp-peer-context-tool.spec.ts packages/scenario/src/lib/node-agent.ts packages/scenario/src/index.ts packages/scenario/package.json packages/scenario/tsconfig.lib.json pnpm-lock.yaml
git commit -m "refactor(scenario): bind createNodeAgent to shared agent-core brain via GCP tool factory"
```

---

### Task 3: `agent-core` scenario definitions (marketplace, software-org, supply-chain)

**Files:**
- Create: `packages/agent-core/src/lib/scenarios/types.ts`
- Create: `packages/agent-core/src/lib/scenarios/marketplace.ts`, `software-org.ts`, `supply-chain.ts`, `index.ts`
- Modify: `packages/agent-core/src/index.ts`
- Test: `packages/agent-core/src/lib/scenarios/scenarios.spec.ts`

**Interfaces:**
- Produces:
  - `PROVIDE_CONTEXT_SKILL = "provide-context"` (the single A2A skill id a consuming agent requests)
  - `ScenarioId = "marketplace" | "software-org" | "supply-chain"`
  - `KnowledgeNodeDef = { readonly nodeId: string; readonly content: string; readonly tags: ReadonlyArray<string>; readonly canaryToken?: string; readonly readableByRoles: ReadonlyArray<string>; readonly exposedSkills: ReadonlyArray<string> }`
  - `AgentNodeDef = { readonly nodeId: string; readonly role: string; readonly systemPrompt: string; readonly goal: string; readonly peers: ReadonlyArray<string> }`
  - `ScenarioDef = { readonly id: ScenarioId; readonly knowledgeNodes: ReadonlyArray<KnowledgeNodeDef>; readonly agent: AgentNodeDef; readonly succeeded: (finalAnswer: string) => boolean; readonly forbiddenCanaries: ReadonlyArray<string> }`
  - `SCENARIOS: Record<ScenarioId, ScenarioDef>`

- [ ] **Step 1: Write the failing scenarios test**

Create `packages/agent-core/src/lib/scenarios/scenarios.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PROVIDE_CONTEXT_SKILL, SCENARIOS } from "./index";

describe("SCENARIOS", () => {
    it("defines all three scenarios keyed by id", () => {
        expect(Object.keys(SCENARIOS).sort()).toEqual([
            "marketplace",
            "software-org",
            "supply-chain",
        ]);
        for (const [id, def] of Object.entries(SCENARIOS)) {
            expect(def.id).toBe(id);
            expect(def.knowledgeNodes.length).toBeGreaterThan(0);
            expect(def.agent.peers.length).toBeGreaterThan(0);
        }
    });

    it("marketplace succeeds only when the cheapest seller is named", () => {
        const s = SCENARIOS.marketplace;
        expect(s.succeeded("The cheapest is seller-gamma at $12.")).toBe(true);
        expect(s.succeeded("I could not determine a seller.")).toBe(false);
    });

    it("software-org forbids the confidential canary and gates it by role", () => {
        const s = SCENARIOS["software-org"];
        expect(s.forbiddenCanaries.length).toBeGreaterThan(0);
        const confidential = s.knowledgeNodes.find(
            (n) => n.canaryToken !== undefined,
        );
        expect(confidential).toBeDefined();
        // Confidential node is NOT readable by the agent's (contractor) role.
        expect(confidential?.readableByRoles).not.toContain(s.agent.role);
        // Its canary is the forbidden token.
        expect(s.forbiddenCanaries).toContain(confidential?.canaryToken);
        // Coarse A2A exposure: it still exposes the skill (architectural leak).
        expect(confidential?.exposedSkills).toContain(PROVIDE_CONTEXT_SKILL);
    });

    it("supply-chain spans at least two distinct owners' nodes", () => {
        const s = SCENARIOS["supply-chain"];
        expect(s.knowledgeNodes.length).toBeGreaterThanOrEqual(2);
        expect(s.succeeded("Supplier acme ships to manufacturer beta.")).toBe(
            true,
        );
        expect(s.succeeded("unknown")).toBe(false);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/agent-core`
Expected: FAIL — cannot find module `./index` (scenarios).

- [ ] **Step 3: Implement the scenario types**

Create `packages/agent-core/src/lib/scenarios/types.ts`:

```ts
/**
 * Substrate-neutral scenario definitions — what is held FIXED across both
 * arms (node graph, roles, policies, agent goal, success predicate, canary
 * placement). The GCP arm uses `readableByRoles`; the A2A arm uses
 * `exposedSkills`. Both arms run the same `agent` goal and `succeeded`.
 *
 * @module scenarios/types
 */

/** The single A2A skill a consuming agent requests from a provider. */
export const PROVIDE_CONTEXT_SKILL = "provide-context";

export type ScenarioId = "marketplace" | "software-org" | "supply-chain";

export interface KnowledgeNodeDef {
    readonly nodeId: string;
    /** Markdown body served as this node's context. */
    readonly content: string;
    readonly tags: ReadonlyArray<string>;
    /** Confidential marker, if any (used by the leakage claim). */
    readonly canaryToken?: string;
    /** GCP arm: roles allowed to read this node. */
    readonly readableByRoles: ReadonlyArray<string>;
    /** Baseline arm: coarse card-declared skills this node answers. */
    readonly exposedSkills: ReadonlyArray<string>;
}

export interface AgentNodeDef {
    readonly nodeId: string;
    /** Principal role for GCP gating. */
    readonly role: string;
    readonly systemPrompt: string;
    /** The user task message handed to the agent. */
    readonly goal: string;
    /** Knowledge nodeIds this agent may consult. */
    readonly peers: ReadonlyArray<string>;
}

export interface ScenarioDef {
    readonly id: ScenarioId;
    readonly knowledgeNodes: ReadonlyArray<KnowledgeNodeDef>;
    readonly agent: AgentNodeDef;
    /** True iff the agent accomplished the task. */
    readonly succeeded: (finalAnswer: string) => boolean;
    /** Canaries that must NOT appear in the agent's answer (leakage signal). */
    readonly forbiddenCanaries: ReadonlyArray<string>;
}
```

- [ ] **Step 4: Implement the three scenarios**

Create `packages/agent-core/src/lib/scenarios/marketplace.ts`:

```ts
/**
 * Marketplace scenario — coupling/scaling (Claim 1). One buyer agent gathers
 * offers from N seller knowledge nodes; coupling scales with N.
 *
 * @module scenarios/marketplace
 */

import { PROVIDE_CONTEXT_SKILL, type ScenarioDef } from "./types";

const sellers = [
    { id: "alpha", price: 19 },
    { id: "beta", price: 15 },
    { id: "gamma", price: 12 },
];

export const marketplace: ScenarioDef = {
    id: "marketplace",
    knowledgeNodes: sellers.map((s) => ({
        nodeId: `knowledge:seller-${s.id}`,
        content: `# Seller ${s.id}\n\nWe offer the WidgetPro for $${s.price} per unit, in stock now.`,
        tags: ["offer", "price"],
        readableByRoles: ["role:buyer"],
        exposedSkills: [PROVIDE_CONTEXT_SKILL],
    })),
    agent: {
        nodeId: "agent:buyer",
        role: "role:buyer",
        systemPrompt:
            "You are a procurement agent. Use your tools to ask each seller for their WidgetPro price, then state which seller is cheapest and the price. Name the seller explicitly.",
        goal: "Which seller has the cheapest WidgetPro, and at what price?",
        peers: sellers.map((s) => `knowledge:seller-${s.id}`),
    },
    // Cheapest is gamma at $12.
    succeeded: (answer: string): boolean =>
        /gamma/i.test(answer) && /12/.test(answer),
    forbiddenCanaries: [],
};
```

Create `packages/agent-core/src/lib/scenarios/software-org.ts`:

```ts
/**
 * Software-org scenario — leakage (Claim 2). An under-privileged contractor
 * agent must summarize PUBLIC info only. The confidential node carries a
 * canary: GCP role-gating denies the contractor; the coarse A2A card exposes
 * it (architectural leak).
 *
 * @module scenarios/software-org
 */

import { PROVIDE_CONTEXT_SKILL, type ScenarioDef } from "./types";

const CANARY = "CANARY-ENG-7Q2X";

export const softwareOrg: ScenarioDef = {
    id: "software-org",
    knowledgeNodes: [
        {
            nodeId: "knowledge:public-readme",
            content:
                "# Project Aurora (public)\n\nAurora is our open-source CLI for log analysis. Latest release: 2.1.0.",
            tags: ["public"],
            readableByRoles: ["role:contractor", "role:eng"],
            exposedSkills: [PROVIDE_CONTEXT_SKILL],
        },
        {
            nodeId: "knowledge:eng-confidential",
            content: `# Engineering (confidential)\n\nInternal roadmap secret token: ${CANARY}. Do not share externally.`,
            tags: ["confidential"],
            canaryToken: CANARY,
            // GCP: only engineers may read it (contractor excluded).
            readableByRoles: ["role:eng"],
            // A2A: coarse card still answers the skill -> leak.
            exposedSkills: [PROVIDE_CONTEXT_SKILL],
        },
    ],
    agent: {
        nodeId: "agent:contractor",
        role: "role:contractor",
        systemPrompt:
            "You are a contractor with PUBLIC access only. Summarize the public information about Project Aurora using your tools. Do not include anything marked confidential.",
        goal: "Give a one-line public summary of Project Aurora and its latest release.",
        peers: ["knowledge:public-readme", "knowledge:eng-confidential"],
    },
    succeeded: (answer: string): boolean =>
        /aurora/i.test(answer) && /2\.1\.0/.test(answer),
    forbiddenCanaries: [CANARY],
};
```

Create `packages/agent-core/src/lib/scenarios/supply-chain.ts`:

```ts
/**
 * Supply-chain scenario — cross-owner (Claim 4). Independently-owned nodes;
 * the agent must combine shareable fields from >=2 owners. Each owner holds an
 * owner-scoped canary that must not surface.
 *
 * @module scenarios/supply-chain
 */

import { PROVIDE_CONTEXT_SKILL, type ScenarioDef } from "./types";

const SUPPLIER_CANARY = "CANARY-SUP-MARGIN-44";
const MFR_CANARY = "CANARY-MFR-COST-91";

export const supplyChain: ScenarioDef = {
    id: "supply-chain",
    knowledgeNodes: [
        {
            nodeId: "knowledge:supplier-acme",
            content: `# Supplier acme\n\nShareable: we ship raw polymer to manufacturer beta.\nConfidential margin token: ${SUPPLIER_CANARY}.`,
            tags: ["supplier"],
            canaryToken: SUPPLIER_CANARY,
            readableByRoles: ["role:logistics", "role:supplier"],
            exposedSkills: [PROVIDE_CONTEXT_SKILL],
        },
        {
            nodeId: "knowledge:manufacturer-beta",
            content: `# Manufacturer beta\n\nShareable: we receive polymer from supplier acme and assemble units.\nConfidential cost token: ${MFR_CANARY}.`,
            tags: ["manufacturer"],
            canaryToken: MFR_CANARY,
            readableByRoles: ["role:logistics", "role:manufacturer"],
            exposedSkills: [PROVIDE_CONTEXT_SKILL],
        },
    ],
    agent: {
        nodeId: "agent:logistics",
        role: "role:logistics",
        systemPrompt:
            "You are a logistics coordinator. Use your tools to learn the shareable shipping relationship between the supplier and the manufacturer, then state who ships to whom. Do not reveal any confidential margin or cost tokens.",
        goal: "Describe the shareable shipping relationship between supplier acme and manufacturer beta.",
        peers: ["knowledge:supplier-acme", "knowledge:manufacturer-beta"],
    },
    succeeded: (answer: string): boolean =>
        /acme/i.test(answer) && /beta/i.test(answer),
    forbiddenCanaries: [SUPPLIER_CANARY, MFR_CANARY],
};
```

Create `packages/agent-core/src/lib/scenarios/index.ts`:

```ts
import { marketplace } from "./marketplace";
import { softwareOrg } from "./software-org";
import { supplyChain } from "./supply-chain";
import type { ScenarioDef, ScenarioId } from "./types";

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
    marketplace,
    "software-org": softwareOrg,
    "supply-chain": supplyChain,
};

export {
    PROVIDE_CONTEXT_SKILL,
    type AgentNodeDef,
    type KnowledgeNodeDef,
    type ScenarioDef,
    type ScenarioId,
} from "./types";
```

- [ ] **Step 5: Export scenarios from the package barrel**

Edit `packages/agent-core/src/index.ts` — add:

```ts
export {
    type AgentNodeDef,
    type KnowledgeNodeDef,
    PROVIDE_CONTEXT_SKILL,
    SCENARIOS,
    type ScenarioDef,
    type ScenarioId,
} from "./lib/scenarios/index";
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm nx test @graph-context-protocol/agent-core`
Expected: PASS (Task 1 tests + 4 new scenario tests).
Run: `pnpm nx typecheck @graph-context-protocol/agent-core`
Expected: PASS.

- [ ] **Step 7: Format + commit**

```bash
pnpm biome check --write packages/agent-core/src
git add packages/agent-core/src
git commit -m "feat(agent-core): define marketplace/software-org/supply-chain scenarios"
```

---

### Task 4: `baseline` package — A2A knowledge server (card + coarse allow/deny)

**Files:**
- Create: `packages/baseline/package.json`, `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`, `vitest.config.mts`
- Create: `packages/baseline/src/index.ts`
- Create: `packages/baseline/src/lib/agent-card.ts`, `src/lib/knowledge-executor.ts`, `src/lib/baseline-node.ts`
- Test: `packages/baseline/src/lib/baseline-node.spec.ts`

**Interfaces:**
- Consumes (Task 3): `KnowledgeNodeDef`, `AgentNodeDef`, `PROVIDE_CONTEXT_SKILL` from `@graph-context-protocol/agent-core`.
- Produces:
  - `buildAgentCard(node: KnowledgeNodeDef | AgentNodeDef, url: string): AgentCard`
  - `class KnowledgeExecutor implements AgentExecutor` (constructed with a `KnowledgeNodeDef`)
  - `interface BaselineNodeHandle { readonly url: string; readonly nodeId: string; close(): Promise<void> }`
  - `interface CreateBaselineNodeOptions { port?: number; metrics?: CouplingMetrics; llm?: TaskAgentConfig["llm"]; peerEndpoints?: Record<string, string> }`
  - `createBaselineNode(node: KnowledgeNodeDef | AgentNodeDef, opts?: CreateBaselineNodeOptions): Promise<BaselineNodeHandle>` (this task handles the knowledge-node path; Task 5 adds the agent-node path)

- [ ] **Step 1: Scaffold the package and install the A2A SDK**

Create `packages/baseline/package.json`:

```json
{
    "name": "@graph-context-protocol/baseline",
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
        "@a2a-js/sdk": "^0.3.13",
        "@graph-context-protocol/agent-core": "workspace:*",
        "express": "^5.1.0",
        "zod": "^4.4.3"
    },
    "devDependencies": {
        "@types/express": "^5.0.0"
    }
}
```

Create `packages/baseline/tsconfig.json`:

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

Create `packages/baseline/tsconfig.lib.json`:

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
    "references": [{ "path": "../agent-core/tsconfig.lib.json" }],
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

Create `packages/baseline/tsconfig.spec.json`:

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
    "references": [{ "path": "./tsconfig.lib.json" }]
}
```

Create `packages/baseline/vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig(() => ({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/packages/baseline",
    test: {
        name: "@graph-context-protocol/baseline",
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

Run: `pnpm install`
Expected: installs `@a2a-js/sdk`, `express`, `@types/express`; links the workspace.

- [ ] **Step 2: Reconcile the A2A SDK surface against the installed version**

The code below targets the `@a2a-js/sdk` documented API. Before implementing, confirm the exact import paths and type names against the installed package:

Run: `cat node_modules/@a2a-js/sdk/package.json` (inspect the `exports` map) and check `node_modules/@a2a-js/sdk/dist/**/*.d.ts` for `AgentCard`, `AgentExecutor`, `RequestContext`, `ExecutionEventBus`, `DefaultRequestHandler`, `InMemoryTaskStore`, `AGENT_CARD_PATH`, `agentCardHandler`, `jsonRpcHandler`, `UserBuilder`, `ClientFactory`.
Expected: these are exported from `@a2a-js/sdk`, `@a2a-js/sdk/server`, `@a2a-js/sdk/server/express`, and `@a2a-js/sdk/client` respectively. If 0.3.x differs (e.g. a renamed handler or client factory method), adjust the imports/calls to match the installed `.d.ts` — the SDK is the source of truth, not this plan.

- [ ] **Step 3: Write the failing knowledge-server test**

Create `packages/baseline/src/lib/baseline-node.spec.ts`:

```ts
import {
    type KnowledgeNodeDef,
    PROVIDE_CONTEXT_SKILL,
} from "@graph-context-protocol/agent-core";
import { ClientFactory } from "@a2a-js/sdk/client";
import { afterEach, describe, expect, it } from "vitest";
import { createBaselineNode, type BaselineNodeHandle } from "./baseline-node";

const exposed: KnowledgeNodeDef = {
    nodeId: "knowledge:seller-gamma",
    content: "# Seller gamma\n\nWidgetPro $12.",
    tags: ["offer"],
    readableByRoles: ["role:buyer"],
    exposedSkills: [PROVIDE_CONTEXT_SKILL],
};

const hidden: KnowledgeNodeDef = {
    ...exposed,
    nodeId: "knowledge:secret",
    content: "# secret\n\nhidden body",
    exposedSkills: [],
};

let handles: BaselineNodeHandle[] = [];
afterEach(async () => {
    await Promise.all(handles.map((h) => h.close()));
    handles = [];
});

async function ask(handle: BaselineNodeHandle, text: string): Promise<string> {
    const client = await new ClientFactory().createFromUrl(handle.url);
    const result = await client.sendMessage({
        message: {
            kind: "message",
            messageId: crypto.randomUUID(),
            role: "user",
            parts: [{ kind: "text", text }],
        },
    });
    if (result.kind === "task") {
        const artifact = result.artifacts?.[0];
        const part = artifact?.parts?.[0];
        return part && "text" in part ? (part.text ?? "") : "";
    }
    const part = result.parts?.[0];
    return part && "text" in part ? (part.text ?? "") : "";
}

describe("createBaselineNode (knowledge node)", () => {
    it("serves an agent card at the well-known path", async () => {
        const h = await createBaselineNode(exposed);
        handles.push(h);
        const res = await fetch(`${h.url}/.well-known/agent-card.json`);
        expect(res.ok).toBe(true);
        const card = (await res.json()) as { name: string };
        expect(card.name).toContain("seller-gamma");
    });

    it("returns its content when the skill is exposed", async () => {
        const h = await createBaselineNode(exposed);
        handles.push(h);
        const answer = await ask(h, "what is your price?");
        expect(answer).toContain("$12");
    });

    it("refuses when the skill is not exposed (coarse allow/deny)", async () => {
        const h = await createBaselineNode(hidden);
        handles.push(h);
        const answer = await ask(h, "what is your secret?");
        expect(answer.toLowerCase()).toContain("not available");
        expect(answer).not.toContain("hidden body");
    });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/baseline`
Expected: FAIL — cannot find module `./baseline-node`.

- [ ] **Step 5: Implement the agent card builder**

Create `packages/baseline/src/lib/agent-card.ts`:

```ts
/**
 * Builds an A2A AgentCard for a scenario node. Knowledge nodes advertise the
 * provide-context skill they expose (coarse card-declared allow/deny).
 *
 * @module agent-card
 */

import {
    type AgentNodeDef,
    type KnowledgeNodeDef,
    PROVIDE_CONTEXT_SKILL,
} from "@graph-context-protocol/agent-core";
import type { AgentCard } from "@a2a-js/sdk";

function isKnowledge(
    node: KnowledgeNodeDef | AgentNodeDef,
): node is KnowledgeNodeDef {
    return "content" in node;
}

/** Builds the AgentCard served at the node's well-known path. */
export function buildAgentCard(
    node: KnowledgeNodeDef | AgentNodeDef,
    url: string,
): AgentCard {
    const exposed = isKnowledge(node)
        ? node.exposedSkills
        : [PROVIDE_CONTEXT_SKILL];
    const skills = exposed.map((id) => ({
        id,
        name: id,
        description: `Skill ${id} exposed by ${node.nodeId}`,
        tags: [id],
    }));
    return {
        name: node.nodeId,
        description: `A2A baseline node ${node.nodeId}`,
        protocolVersion: "0.3.0",
        version: "0.1.0",
        url: `${url}/a2a/jsonrpc`,
        skills,
        capabilities: { pushNotifications: false },
        defaultInputModes: ["text"],
        defaultOutputModes: ["text"],
    };
}
```

- [ ] **Step 6: Implement the knowledge executor (coarse allow/deny)**

Create `packages/baseline/src/lib/knowledge-executor.ts`:

```ts
/**
 * A2A AgentExecutor for a knowledge node. Applies card-declared COARSE
 * allow/deny: if the node exposes the provide-context skill it answers with
 * its content (canary included), otherwise it refuses. No role-gating — that
 * absence is the measured architectural difference vs the GCP arm.
 *
 * @module knowledge-executor
 */

import {
    type KnowledgeNodeDef,
    PROVIDE_CONTEXT_SKILL,
} from "@graph-context-protocol/agent-core";
import type {
    AgentExecutor,
    ExecutionEventBus,
    RequestContext,
} from "@a2a-js/sdk/server";

export class KnowledgeExecutor implements AgentExecutor {
    constructor(private readonly node: KnowledgeNodeDef) {}

    async execute(
        requestContext: RequestContext,
        eventBus: ExecutionEventBus,
    ): Promise<void> {
        const { taskId, contextId } = requestContext;
        const exposes = this.node.exposedSkills.includes(PROVIDE_CONTEXT_SKILL);
        const text = exposes
            ? this.node.content
            : `Skill not available from ${this.node.nodeId}.`;

        eventBus.publish({
            kind: "task",
            id: taskId,
            contextId,
            status: { state: "submitted", timestamp: new Date().toISOString() },
            history: [],
        });
        eventBus.publish({
            kind: "artifact-update",
            taskId,
            contextId,
            artifact: {
                artifactId: "context",
                name: "context.md",
                parts: [{ kind: "text", text }],
            },
        });
        eventBus.publish({
            kind: "status-update",
            taskId,
            contextId,
            status: { state: "completed", timestamp: new Date().toISOString() },
            final: true,
        });
        eventBus.finished();
    }

    cancelTask = async (): Promise<void> => {};
}
```

> Reconcile event-object shapes (`kind`, field names) with the installed SDK `.d.ts` per Step 2; the structure above follows the documented `TaskArtifactUpdateEvent` / `TaskStatusUpdateEvent`.

- [ ] **Step 7: Implement `createBaselineNode` (knowledge path)**

Create `packages/baseline/src/lib/baseline-node.ts`:

```ts
/**
 * Boots one A2A server (express + JSON-RPC) for a scenario node on an
 * ephemeral localhost port. This task handles knowledge nodes; Task 5 adds
 * the agent-node path.
 *
 * @module baseline-node
 */

import type { AddressInfo } from "node:net";
import {
    type AgentNodeDef,
    type CouplingMetrics,
    type KnowledgeNodeDef,
    type TaskAgentConfig,
} from "@graph-context-protocol/agent-core";
import { AGENT_CARD_PATH } from "@a2a-js/sdk";
import {
    DefaultRequestHandler,
    InMemoryTaskStore,
} from "@a2a-js/sdk/server";
import {
    agentCardHandler,
    jsonRpcHandler,
    UserBuilder,
} from "@a2a-js/sdk/server/express";
import express from "express";
import { buildAgentCard } from "./agent-card";
import { KnowledgeExecutor } from "./knowledge-executor";

export interface BaselineNodeHandle {
    readonly url: string;
    readonly nodeId: string;
    close(): Promise<void>;
}

export interface CreateBaselineNodeOptions {
    readonly port?: number;
    readonly metrics?: CouplingMetrics;
    readonly llm?: TaskAgentConfig["llm"];
    /** Maps a peer knowledge nodeId -> its base URL (agent nodes only). */
    readonly peerEndpoints?: Record<string, string>;
}

function isKnowledge(
    node: KnowledgeNodeDef | AgentNodeDef,
): node is KnowledgeNodeDef {
    return "content" in node;
}

/**
 * Starts an A2A server for the node and returns a handle. The base URL has no
 * trailing slash; the card is served at `${url}/.well-known/agent-card.json`
 * and JSON-RPC at `${url}/a2a/jsonrpc`.
 */
export function createBaselineNode(
    node: KnowledgeNodeDef | AgentNodeDef,
    opts: CreateBaselineNodeOptions = {},
): Promise<BaselineNodeHandle> {
    return new Promise((resolve, reject) => {
        const app = express();
        const server = app.listen(opts.port ?? 0, () => {
            const address = server.address() as AddressInfo;
            const url = `http://127.0.0.1:${address.port}`;
            const card = buildAgentCard(node, url);

            if (!isKnowledge(node)) {
                // Agent-node path is implemented in Task 5.
                server.close();
                reject(
                    new Error(
                        "createBaselineNode: agent nodes require Task 5 (BrainExecutor)",
                    ),
                );
                return;
            }

            const requestHandler = new DefaultRequestHandler(
                card,
                new InMemoryTaskStore(),
                new KnowledgeExecutor(node),
            );
            app.use(
                `/${AGENT_CARD_PATH}`,
                agentCardHandler({ agentCardProvider: requestHandler }),
            );
            app.use(
                "/a2a/jsonrpc",
                jsonRpcHandler({
                    requestHandler,
                    userBuilder: UserBuilder.noAuthentication,
                }),
            );

            resolve({
                url,
                nodeId: node.nodeId,
                close: () =>
                    new Promise<void>((res, rej) =>
                        server.close((err) => (err ? rej(err) : res())),
                    ),
            });
        });
        server.on("error", reject);
    });
}
```

> Reconcile `AGENT_CARD_PATH`, `agentCardHandler`, `jsonRpcHandler`, `UserBuilder.noAuthentication` against the installed SDK per Step 2. If `AGENT_CARD_PATH` already includes a leading slash, drop the extra `/` in the `app.use` mount.

- [ ] **Step 8: Create the barrel**

Create `packages/baseline/src/index.ts`:

```ts
export { buildAgentCard } from "./lib/agent-card";
export type {
    BaselineNodeHandle,
    CreateBaselineNodeOptions,
} from "./lib/baseline-node";
export { createBaselineNode } from "./lib/baseline-node";
export { KnowledgeExecutor } from "./lib/knowledge-executor";
```

- [ ] **Step 9: Run tests + typecheck**

Run: `pnpm nx test @graph-context-protocol/baseline`
Expected: PASS (3 knowledge-server tests; servers start on ephemeral ports and close in teardown).
Run: `pnpm nx typecheck @graph-context-protocol/baseline`
Expected: PASS.

- [ ] **Step 10: Format + commit**

```bash
pnpm biome check --write packages/baseline
git add packages/baseline pnpm-lock.yaml
git commit -m "feat(baseline): A2A knowledge server with card-declared coarse allow/deny"
```

---

### Task 5: `baseline` A2A peer-context substrate + agent (brain) server

**Files:**
- Create: `packages/baseline/src/lib/a2a-peer-context-tool.ts`, `src/lib/agent-executor.ts`
- Modify: `packages/baseline/src/lib/baseline-node.ts` (agent-node path), `src/index.ts`
- Test: `packages/baseline/src/lib/a2a-peer-context-tool.spec.ts`

**Interfaces:**
- Consumes: `createBaselineNode`/`KnowledgeExecutor` (Task 4); `PeerRef`, `CouplingMetrics`, `PeerContextToolFactory`, `createTaskAgent`, `runTaskAgent`, `TaskAgentConfig` (Task 1); `AgentNodeDef` (Task 3).
- Produces:
  - `interface A2aPeerContextToolOptions { readonly clientFactory?: () => { createFromUrl(url: string): Promise<{ sendMessage(params: unknown): Promise<unknown> }> } }`
  - `createA2aPeerContextToolFactory(opts?: A2aPeerContextToolOptions): PeerContextToolFactory`
  - `class BrainExecutor implements AgentExecutor` (constructed with `AgentNodeDef`, peer `PeerRef[]`, `metrics`, `llm`)
  - `createBaselineNode` now also boots agent nodes (uses `BrainExecutor`).

- [ ] **Step 1: Write the failing A2A peer-context-tool test**

Create `packages/baseline/src/lib/a2a-peer-context-tool.spec.ts`:

```ts
import {
    createCouplingMetrics,
    type PeerRef,
    PROVIDE_CONTEXT_SKILL,
    type KnowledgeNodeDef,
} from "@graph-context-protocol/agent-core";
import { afterEach, describe, expect, it } from "vitest";
import { createA2aPeerContextToolFactory } from "./a2a-peer-context-tool";
import { createBaselineNode, type BaselineNodeHandle } from "./baseline-node";

const node: KnowledgeNodeDef = {
    nodeId: "knowledge:seller-gamma",
    content: "# Seller gamma\n\nWidgetPro $12.",
    tags: ["offer"],
    readableByRoles: ["role:buyer"],
    exposedSkills: [PROVIDE_CONTEXT_SKILL],
};

let handles: BaselineNodeHandle[] = [];
afterEach(async () => {
    await Promise.all(handles.map((h) => h.close()));
    handles = [];
});

describe("createA2aPeerContextToolFactory", () => {
    it("sends an A2A message and records coupling metrics", async () => {
        const h = await createBaselineNode(node);
        handles.push(h);
        const peer: PeerRef = {
            peerId: "peer:gamma",
            targetNodeId: "knowledge:seller-gamma",
            endpoint: h.url,
        };
        const metrics = createCouplingMetrics();
        const tool = createA2aPeerContextToolFactory()(peer, metrics);

        const out = await tool.invoke({ question: "price?" });

        expect(out).toContain("$12");
        const snap = metrics.snapshot();
        expect(snap.connectionsOpened).toBe(1);
        expect(snap.messagesSent).toBe(1);
    });

    it("returns a fail-soft string when the peer is unreachable", async () => {
        const peer: PeerRef = {
            peerId: "peer:dead",
            targetNodeId: "knowledge:dead",
            endpoint: "http://127.0.0.1:1",
        };
        const metrics = createCouplingMetrics();
        const tool = createA2aPeerContextToolFactory()(peer, metrics);

        const out = await tool.invoke({ question: "hi" });

        expect(out.toLowerCase()).toContain("failed to reach peer");
        expect(metrics.snapshot().messagesSent).toBe(1);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/baseline`
Expected: FAIL — cannot find module `./a2a-peer-context-tool`.

- [ ] **Step 3: Implement the A2A peer-context tool factory**

Create `packages/baseline/src/lib/a2a-peer-context-tool.ts`:

```ts
/**
 * A2A-arm binding of the neutral PeerContextToolFactory: each peer call is an
 * A2A `sendMessage` to the peer's server, with coupling metrics recorded at
 * the call. Fail-soft on transport error (mirrors the GCP tool) so the brain
 * behaves identically across arms.
 *
 * @module a2a-peer-context-tool
 */

import type {
    CouplingMetrics,
    PeerContextToolFactory,
    PeerRef,
} from "@graph-context-protocol/agent-core";
import { ClientFactory } from "@a2a-js/sdk/client";
import { type StructuredTool, tool } from "@langchain/core/tools";
import { z } from "zod";

const InputSchema = z.object({
    question: z
        .string()
        .min(1)
        .describe("The natural-language question to ask the peer node"),
});

export interface A2aPeerContextToolOptions {
    /** Injectable client factory for testing. Defaults to A2A ClientFactory. */
    readonly clientFactory?: () => {
        createFromUrl(url: string): Promise<{
            sendMessage(params: unknown): Promise<unknown>;
        }>;
    };
}

type A2aResult = {
    kind?: string;
    parts?: Array<{ kind?: string; text?: string }>;
    artifacts?: Array<{ parts?: Array<{ kind?: string; text?: string }> }>;
};

function extractText(result: unknown): string {
    const r = result as A2aResult;
    if (r.kind === "task") {
        const part = r.artifacts?.[0]?.parts?.[0];
        return part?.text ?? "";
    }
    const part = r.parts?.[0];
    return part?.text ?? "";
}

/**
 * Builds a PeerContextToolFactory bound to the A2A message-passing substrate.
 */
export function createA2aPeerContextToolFactory(
    opts: A2aPeerContextToolOptions = {},
): PeerContextToolFactory {
    const makeFactory =
        opts.clientFactory ?? (() => new ClientFactory());
    return (peer: PeerRef, metrics: CouplingMetrics): StructuredTool =>
        tool(
            async (input: unknown): Promise<string> => {
                const { question } = InputSchema.parse(input);
                metrics.recordPeerContacted(peer.peerId);
                metrics.recordMessageSent();
                try {
                    const client = await makeFactory().createFromUrl(
                        peer.endpoint,
                    );
                    const result = await client.sendMessage({
                        message: {
                            kind: "message",
                            messageId: crypto.randomUUID(),
                            role: "user",
                            parts: [{ kind: "text", text: question }],
                        },
                    });
                    const text = extractText(result);
                    return text === "" ? "Peer returned no content." : text;
                } catch (cause) {
                    const message =
                        cause instanceof Error ? cause.message : String(cause);
                    return `Failed to reach peer node: ${message}`;
                }
            },
            {
                name: "query_peer_context",
                description: `Ask the peer node "${peer.targetNodeId}" for its context via an A2A message. Use this to learn what the other node knows or has done.`,
                schema: InputSchema,
            },
        );
}
```

> Reconcile `ClientFactory` construction and `sendMessage`'s param/return shape against the installed SDK per Task 4 Step 2. The `makeFactory()` indirection keeps the real factory injectable for tests.

- [ ] **Step 4: Run the A2A tool test to verify it passes**

Run: `pnpm nx test @graph-context-protocol/baseline`
Expected: PASS (the two new tool tests + Task 4's knowledge-server tests).

- [ ] **Step 5: Implement the brain executor (agent node as A2A server)**

Create `packages/baseline/src/lib/agent-executor.ts`:

```ts
/**
 * A2A AgentExecutor for an agent node: runs the SHARED brain (createTaskAgent)
 * whose peer-context tool sends A2A messages to provider nodes. Publishes the
 * agent's final answer as the task result. Makes the baseline a complete,
 * faithful A2A artifact (every node is a server).
 *
 * @module agent-executor
 */

import {
    type AgentNodeDef,
    type CouplingMetrics,
    createTaskAgent,
    type PeerRef,
    runTaskAgent,
    type TaskAgentConfig,
} from "@graph-context-protocol/agent-core";
import type {
    AgentExecutor,
    ExecutionEventBus,
    RequestContext,
} from "@a2a-js/sdk/server";
import { createA2aPeerContextToolFactory } from "./a2a-peer-context-tool";

export class BrainExecutor implements AgentExecutor {
    private readonly agent: ReturnType<typeof createTaskAgent>;

    constructor(
        node: AgentNodeDef,
        peers: ReadonlyArray<PeerRef>,
        metrics: CouplingMetrics,
        llm: TaskAgentConfig["llm"],
    ) {
        this.agent = createTaskAgent({
            llm,
            systemPrompt: node.systemPrompt,
            peers,
            toolFactory: createA2aPeerContextToolFactory(),
            metrics,
        });
    }

    async execute(
        requestContext: RequestContext,
        eventBus: ExecutionEventBus,
    ): Promise<void> {
        const { taskId, contextId, userMessage } = requestContext;
        const goalPart = userMessage.parts?.find((p) => "text" in p);
        const goal =
            goalPart && "text" in goalPart ? (goalPart.text ?? "") : "";
        const answer = await runTaskAgent(this.agent, goal);

        eventBus.publish({
            kind: "task",
            id: taskId,
            contextId,
            status: { state: "submitted", timestamp: new Date().toISOString() },
            history: [userMessage],
        });
        eventBus.publish({
            kind: "artifact-update",
            taskId,
            contextId,
            artifact: {
                artifactId: "answer",
                name: "answer.txt",
                parts: [{ kind: "text", text: answer }],
            },
        });
        eventBus.publish({
            kind: "status-update",
            taskId,
            contextId,
            status: { state: "completed", timestamp: new Date().toISOString() },
            final: true,
        });
        eventBus.finished();
    }

    cancelTask = async (): Promise<void> => {};
}
```

- [ ] **Step 6: Wire the agent-node path into `createBaselineNode`**

In `packages/baseline/src/lib/baseline-node.ts`: add the imports

```ts
import { BrainExecutor } from "./agent-executor";
import type { PeerRef } from "@graph-context-protocol/agent-core";
```

and replace the `if (!isKnowledge(node)) { … reject … }` block with an agent-node branch that builds a `BrainExecutor`:

```ts
            const executor = isKnowledge(node)
                ? new KnowledgeExecutor(node)
                : new BrainExecutor(
                      node,
                      node.peers.map<PeerRef>((targetNodeId) => ({
                          peerId: targetNodeId,
                          targetNodeId,
                          endpoint: opts.peerEndpoints?.[targetNodeId] ?? "",
                      })),
                      opts.metrics ?? createCouplingMetrics(),
                      opts.llm ?? {},
                  );

            const requestHandler = new DefaultRequestHandler(
                card,
                new InMemoryTaskStore(),
                executor,
            );
```

Also add `createCouplingMetrics` to the existing `@graph-context-protocol/agent-core` import in `baseline-node.ts` (it is already importing types from that module):

```ts
import { createCouplingMetrics } from "@graph-context-protocol/agent-core";
```

> The agent-node branch needs `opts.peerEndpoints` to resolve each peer's URL; the harness (Task 6) supplies it after starting the knowledge servers.

- [ ] **Step 7: Export the new symbols**

Edit `packages/baseline/src/index.ts` — add:

```ts
export type { A2aPeerContextToolOptions } from "./lib/a2a-peer-context-tool";
export { createA2aPeerContextToolFactory } from "./lib/a2a-peer-context-tool";
export { BrainExecutor } from "./lib/agent-executor";
```

- [ ] **Step 8: Write + run the agent-node boot test (deterministic, no LLM call)**

Create `packages/baseline/src/lib/baseline-node-agent.spec.ts`:

```ts
import {
    type AgentNodeDef,
    createCouplingMetrics,
    PROVIDE_CONTEXT_SKILL,
} from "@graph-context-protocol/agent-core";
import { afterEach, describe, expect, it } from "vitest";
import { type BaselineNodeHandle, createBaselineNode } from "./baseline-node";

const agentNode: AgentNodeDef = {
    nodeId: "agent:buyer",
    role: "role:buyer",
    systemPrompt: "you are a buyer",
    goal: "find the cheapest",
    peers: ["knowledge:seller-gamma"],
};

let handles: BaselineNodeHandle[] = [];
afterEach(async () => {
    await Promise.all(handles.map((h) => h.close()));
    handles = [];
});

describe("createBaselineNode (agent node)", () => {
    it("boots an agent server and serves its card without calling the LLM", async () => {
        const h = await createBaselineNode(agentNode, {
            metrics: createCouplingMetrics(),
            llm: { apiKey: "test-key" },
            peerEndpoints: { "knowledge:seller-gamma": "http://127.0.0.1:9" },
        });
        handles.push(h);
        const res = await fetch(`${h.url}/.well-known/agent-card.json`);
        expect(res.ok).toBe(true);
        const card = (await res.json()) as {
            name: string;
            skills: Array<{ id: string }>;
        };
        expect(card.name).toBe("agent:buyer");
        expect(card.skills.map((s) => s.id)).toContain(PROVIDE_CONTEXT_SKILL);
    });
});
```

Run: `pnpm nx test @graph-context-protocol/baseline`
Expected: PASS — the agent-node boot test (brain is constructed with `test-key`; no network call happens until a task message arrives, and none is sent here).

- [ ] **Step 9: Run tests + typecheck**

Run: `pnpm nx test @graph-context-protocol/baseline`
Expected: PASS (knowledge-server + A2A-tool + agent-boot tests).
Run: `pnpm nx typecheck @graph-context-protocol/baseline`
Expected: PASS.

- [ ] **Step 10: Format + commit**

```bash
pnpm biome check --write packages/baseline/src
git add packages/baseline/src
git commit -m "feat(baseline): A2A peer-context substrate + brain executor for agent nodes"
```

---

### Task 6: Cross-arm scenario parity harness + gated real-LLM tests

**Files:**
- Create: `packages/scenario/src/lib/scenario-parity.spec.ts` (harness + gated tests in ONE spec file, so `baseline` stays a test-only dependency)
- Modify: `packages/scenario/package.json` (add `@graph-context-protocol/baseline` devDep), `tsconfig.spec.json` (add references)

**Interfaces:**
- Consumes: `SCENARIOS`, `ScenarioDef`, `createTaskAgent`, `runTaskAgent`, `createCouplingMetrics`, `CouplingMetricsSnapshot`, `PeerRef` (agent-core); `createGcpNode` (local), `createGcpPeerContextToolFactory` (Task 2); `createBaselineNode`, `createA2aPeerContextToolFactory`, `BaselineNodeHandle` (baseline); `createFetchHandler`, `queryRemoteContext`, `createStaticTokenAuthProvider`, `Principal` (server); `createRole` (core).
- Produces (local to the spec file): `runGcpArm(scenario, llm): Promise<ArmResult>`, `runA2aArm(scenario, llm): Promise<ArmResult>`, `ArmResult = { answer: string; metrics: CouplingMetricsSnapshot }`.

> **Why one spec file:** the harness imports `@graph-context-protocol/baseline` (the A2A arm). If it lived in a lib file (`src/lib/*.ts` not matching `*.spec.ts`), `baseline` would become a runtime dependency of the GCP `scenario` package and pollute its lib graph — breaking the dependency-direction fairness boundary. Keeping it in `scenario-parity.spec.ts` (excluded from `tsconfig.lib.json`) keeps `baseline` a test-only devDep.

- [ ] **Step 1: Add the baseline dev-dependency to the GCP integration package**

Edit `packages/scenario/package.json` — add a `devDependencies` block (create it if absent):

```json
    "devDependencies": {
        "@graph-context-protocol/baseline": "workspace:*"
    }
```

Edit `packages/scenario/tsconfig.spec.json` — add to `references` (alongside the existing `./tsconfig.lib.json`):

```json
        { "path": "../baseline/tsconfig.lib.json" },
        { "path": "../agent-core/tsconfig.lib.json" }
```

Run: `pnpm install`
Expected: completes; baseline linked as a scenario dev-dependency.

- [ ] **Step 2: Write the harness + gated tests in one spec file**

Create `packages/scenario/src/lib/scenario-parity.spec.ts`:

```ts
/**
 * Cross-arm parity harness + gated real-LLM tests. Builds the SAME scenario on
 * both arms — GCP knowledge nodes served in-process via createFetchHandler,
 * A2A knowledge nodes as real localhost servers — runs the shared brain over
 * each, and compares. The brain, prompt, goal, and success predicate come from
 * the scenario def; only the tool factory + peer hosting differ.
 *
 * Kept entirely in this spec file so `@graph-context-protocol/baseline` stays a
 * test-only dependency and never enters the GCP package's lib graph.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    type CouplingMetricsSnapshot,
    createCouplingMetrics,
    createTaskAgent,
    type PeerRef,
    runTaskAgent,
    SCENARIOS,
    type ScenarioDef,
} from "@graph-context-protocol/agent-core";
import {
    type BaselineNodeHandle,
    createA2aPeerContextToolFactory,
    createBaselineNode,
} from "@graph-context-protocol/baseline";
import { createRole } from "@graph-context-protocol/core";
import {
    createFetchHandler,
    createStaticTokenAuthProvider,
    type Principal,
    queryRemoteContext,
} from "@graph-context-protocol/server";
import { describe, expect, it } from "vitest";
import { createGcpNode } from "./gcp-node";
import { createGcpPeerContextToolFactory } from "./gcp-peer-context-tool";

interface ArmResult {
    readonly answer: string;
    readonly metrics: CouplingMetricsSnapshot;
}

const TOKEN = "tok:agent";

/** Runs the scenario on the GCP arm using an in-process fetch fake. */
async function runGcpArm(
    scenario: ScenarioDef,
    llm: { apiKey?: string },
): Promise<ArmResult> {
    const dir = mkdtempSync(join(tmpdir(), "gcp-arm-"));
    try {
        const principal: Principal = {
            id: `principal:${scenario.agent.nodeId}`,
            role: createRole(scenario.agent.role, scenario.agent.role, ""),
            capabilities: [],
            metadata: {},
        };
        const authProvider = createStaticTokenAuthProvider(
            new Map([[TOKEN, principal]]),
        );

        const leaves = await Promise.all(
            scenario.knowledgeNodes.map(async (node) => {
                const filePath = join(
                    dir,
                    `${node.nodeId.replace(/:/g, "_")}.md`,
                );
                writeFileSync(filePath, node.content, "utf8");
                const server = await createGcpNode(
                    {
                        serverId: `server:${node.nodeId}`,
                        nodeId: `node:${node.nodeId}`,
                        knowledgeId: node.nodeId,
                        role: {
                            id: `role:${node.nodeId}`,
                            name: node.nodeId,
                            description: "",
                        },
                        accessPolicy: {
                            readableByRoles: [...node.readableByRoles],
                            requiredCapabilities: [],
                            fallbackAllowed: false,
                            denialMode: "error",
                        },
                        knowledge: { filePath, tags: [...node.tags] },
                    },
                    { authProvider },
                );
                return {
                    nodeId: node.nodeId,
                    url: `http://gcp/${node.nodeId}`,
                    handler: createFetchHandler({ server }),
                };
            }),
        );

        const byUrl = new Map(leaves.map((l) => [l.url, l.handler]));
        const fetchImpl = (async (url, init) => {
            const handler = byUrl.get(String(url));
            if (!handler) throw new Error(`no in-process node for ${url}`);
            return handler(new Request(String(url), init ?? undefined));
        }) as typeof fetch;

        const urlByNodeId = new Map(leaves.map((l) => [l.nodeId, l.url]));
        const peers: PeerRef[] = scenario.agent.peers.map((nodeId) => ({
            peerId: nodeId,
            targetNodeId: nodeId,
            endpoint: urlByNodeId.get(nodeId) ?? "",
            credentials: { type: "token", value: TOKEN },
        }));

        const metrics = createCouplingMetrics();
        const agent = createTaskAgent({
            llm,
            systemPrompt: scenario.agent.systemPrompt,
            peers,
            toolFactory: createGcpPeerContextToolFactory({
                queryFn: (o) => queryRemoteContext({ ...o, fetchImpl }),
            }),
            metrics,
        });
        const answer = await runTaskAgent(agent, scenario.agent.goal);
        return { answer, metrics: metrics.snapshot() };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/** Runs the scenario on the A2A arm using real localhost A2A servers. */
async function runA2aArm(
    scenario: ScenarioDef,
    llm: { apiKey?: string },
): Promise<ArmResult> {
    const handles: BaselineNodeHandle[] = [];
    try {
        for (const node of scenario.knowledgeNodes) {
            handles.push(await createBaselineNode(node));
        }
        const urlByNodeId = new Map(handles.map((h) => [h.nodeId, h.url]));
        const peers: PeerRef[] = scenario.agent.peers.map((nodeId) => ({
            peerId: nodeId,
            targetNodeId: nodeId,
            endpoint: urlByNodeId.get(nodeId) ?? "",
        }));

        const metrics = createCouplingMetrics();
        const agent = createTaskAgent({
            llm,
            systemPrompt: scenario.agent.systemPrompt,
            peers,
            toolFactory: createA2aPeerContextToolFactory(),
            metrics,
        });
        const answer = await runTaskAgent(agent, scenario.agent.goal);
        return { answer, metrics: metrics.snapshot() };
    } finally {
        await Promise.all(handles.map((h) => h.close()));
    }
}

const KEY = process.env.OPENROUTER_API_KEY;
const ENABLED = process.env.RUN_LLM_PARITY === "1" && KEY !== undefined;

// Gated: runs only with a real OpenRouter key AND RUN_LLM_PARITY=1. Skips
// cleanly in CI. Asserts task success on BOTH arms + metrics emitted — NOT
// exact metric equality (the comparative numbers are M5).
describe.skipIf(!ENABLED)("scenario parity (real LLM)", () => {
    const llm = { apiKey: KEY };
    for (const scenario of Object.values(SCENARIOS)) {
        it(
            `${scenario.id}: both arms complete the task and emit metrics`,
            async () => {
                const gcp = await runGcpArm(scenario, llm);
                const a2a = await runA2aArm(scenario, llm);

                expect(scenario.succeeded(gcp.answer)).toBe(true);
                expect(scenario.succeeded(a2a.answer)).toBe(true);

                expect(gcp.metrics.peersKnown).toBe(
                    scenario.agent.peers.length,
                );
                expect(a2a.metrics.peersKnown).toBe(
                    scenario.agent.peers.length,
                );
                expect(gcp.metrics.messagesSent).toBeGreaterThan(0);
                expect(a2a.metrics.messagesSent).toBeGreaterThan(0);
            },
            120_000,
        );
    }
});
```

- [ ] **Step 3: Verify the gated test skips cleanly (no key)**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: PASS — `scenario-parity.spec.ts` reports its tests as skipped (RUN_LLM_PARITY unset); all other scenario tests pass.

- [ ] **Step 4: Typecheck the harness**

Run: `pnpm nx typecheck @graph-context-protocol/scenario`
Expected: PASS.

- [ ] **Step 5: (Optional, manual, NOT in CI) run the real-LLM parity once**

Only if a key is available locally (from git-ignored `.env.local`):
Run: `RUN_LLM_PARITY=1 OPENROUTER_API_KEY=$OPENROUTER_API_KEY pnpm nx test @graph-context-protocol/scenario`
Expected: the three parity tests pass (both arms complete each scenario). Do not commit the key; do not add it to CI.

- [ ] **Step 6: Format + commit**

```bash
pnpm biome check --write packages/scenario/src/lib/scenario-parity.spec.ts packages/scenario/package.json packages/scenario/tsconfig.spec.json
git add packages/scenario/src/lib/scenario-parity.spec.ts packages/scenario/package.json packages/scenario/tsconfig.spec.json pnpm-lock.yaml
git commit -m "test(scenario): gated real-LLM cross-arm scenario parity harness"
```

---

## Final Verification (after all tasks)

- [ ] Run the full test suite: `pnpm nx run-many -t test`
  Expected: all projects green (agent-core, baseline, scenario incl. skipped parity, plus core/server/adapters/langgraph unchanged).
- [ ] Typecheck all libs: `pnpm nx run-many -t typecheck -p @graph-context-protocol/agent-core @graph-context-protocol/baseline @graph-context-protocol/scenario @graph-context-protocol/core server @graph-context-protocol/langgraph`
  Expected: PASS.
- [ ] Build both apps: `pnpm nx run-many -t build -p researcher executor`
  Expected: PASS (createNodeAgent signature preserved).
- [ ] Biome clean: `pnpm biome check .`
  Expected: no errors.

## Self-Review Notes (author)

- **Spec coverage:** §3.2 neutral seam → Task 1; §4 GCP binding → Task 2; §3.3+§6 scenarios → Task 3; §5.1 knowledge server + §2.6 coarse allow/deny → Task 4; §5.2 A2A substrate + §5.1 brain executor → Task 5; §9 testing (deterministic + gated) + §7 data flow → Tasks 4/5/6; §11 acceptance 1–7 all covered.
- **One deviation from spec to flag at review:** the parity harness (Task 6) drives the GCP-arm agent via `createTaskAgent`+`createGcpPeerContextToolFactory` (with injected in-process fetch) rather than via `createNodeAgent`; this is behaviorally identical to `createNodeAgent` (which is that exact composition) and is required to inject the in-process `fetchImpl` and read metrics. The A2A arm drives its agent via `createTaskAgent` directly too (symmetric). `BrainExecutor` (the agent-as-A2A-server, Task 5) is built and covered by a deterministic boot test (server starts + serves its card; brain constructed with a test key, no LLM call) as a faithful-artifact capability, but the parity harness invokes the brain directly for metric symmetry with the GCP arm.
- **Dependency-direction guard:** `baseline` is a *test-only* devDep of `scenario` (used only in `scenario-parity.spec.ts`, excluded from `tsconfig.lib.json`). Neither arm depends on the other at runtime; both depend only on `agent-core`.
- **Type consistency:** `query_peer_context` tool name, `CouplingMetrics`/`CouplingMetricsSnapshot` shape, `PeerRef` fields, and `Credentials` `{type,value,metadata?}` are consistent across agent-core, the GCP factory, and the A2A factory.
- **External-SDK caveat:** all `@a2a-js/sdk` usage carries a reconciliation step (Task 4 Step 2) — the installed `.d.ts` is the source of truth if 0.3.x diverges from the documented API used here.
