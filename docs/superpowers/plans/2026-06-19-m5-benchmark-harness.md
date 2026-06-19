# M5 Benchmark Harness + Metrics + Canary Leakage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/eval` — the evidence engine that runs the three scenarios under both arms (GCP vs A2A), holding the shared brain/LLM/task fixed and swapping only the interop layer, and emits the article's comparison tables: a structural coupling/scaling curve (A2A ~O(N²) vs GCP ~O(N)), behavioral cost over seeds, and canary leakage rates.

**Architecture:** A `ScenarioRunner` (generalized from M4b's parity harness) instantiates a scenario for `arm ∈ {gcp, a2a}`, runs agent-core's shared `createTaskAgent`/`runTaskAgent`, and returns a `RunArtifacts` bundle (answer, coupling snapshot, tool-I/O transcript, audit events). Focused collector modules turn artifacts + an explicit topology model into metrics; a results emitter renders JSON + markdown. A deterministic mock chat model (a `BaseChatModel` subclass) drives a hermetic CI smoke over both arms; full real-LLM runs over K seeds are gated.

**Tech Stack:** Nx 22, pnpm 9, Node 20, TypeScript 5.9 strict, Zod 4, Vitest 4, Biome 2 (4-space), LangChain (`@langchain/core`, `@langchain/openai`), the existing `@graph-context-protocol/{agent-core,scenario,baseline,server,core}` packages.

## Global Constraints

- Node ≥20, pnpm ≥9; TS 5.9 strict; project references; `@ai-do/source` customCondition.
- Zod 4: `.default([])` for arrays; `.prefault({})` for omitted objects.
- Biome 2, 4-space indent. `pnpm biome check --write <files>` before each commit; commit only the task's files (+ `pnpm-lock.yaml` when deps change).
- Vitest 4. nx project names are scoped: `pnpm nx test @graph-context-protocol/eval`, `pnpm nx typecheck @graph-context-protocol/eval`. **LANDMINE:** never run one nx target against two projects (`nx test A B` breaks → `error TS5083`); use `pnpm nx run-many -t <target> -p A B`. After creating a new `package.json`, run `pnpm install`. nx `@nx/js/typescript` sync may rewrite tsconfig project references from the workspace dep graph — this is expected; don't fight it.
- New package mirrors the existing scaffold exactly: `package.json` (type module, `@ai-do/source` export condition), `tsconfig.json` + `tsconfig.lib.json` + `tsconfig.spec.json`, `vitest.config.mts`, `src/index.ts`.
- **Fairness invariant (paper-critical):** both arms run agent-core's `createTaskAgent`/`runTaskAgent`; they differ ONLY in the injected `PeerContextToolFactory` and node hosting. The `ScenarioRunner` is the single place that builds both arms from one `ScenarioDef` + one injected model. Never duplicate or diverge the brain.
- **Additive only:** the two `agent-core` changes (Task 1) are additive and behavior-preserving — existing callers (both apps, both arms, all existing tests) must stay green. No edits to `core`/`server` source. No `ContractVersion` bump.
- **Security:** OpenRouter key ONLY in git-ignored `.env.local`; full runs gated on `RUN_EVAL=1` + `OPENROUTER_API_KEY` and skip cleanly without them; never commit a key; no key in CI. A2A servers bind localhost ephemeral ports, closed in teardown. `packages/eval/results/` is git-ignored. Never commit build artifacts (`.next/`, `*.tsbuildinfo`, `next-env.d.ts`), `.claude/`, `dist/`, or results.

## File Structure

**Modified `packages/agent-core`:**
- `src/lib/types.ts` (Modify) — add optional `model?: BaseChatModel` to `TaskAgentConfig`.
- `src/lib/task-agent.ts` (Modify) — use the injected model if present.
- `src/lib/scenarios/marketplace.ts` (Modify) — add `marketplaceScenario(n)` generator.
- `src/lib/scenarios/index.ts`, `src/index.ts` (Modify) — export it.

**New `packages/eval` (`@graph-context-protocol/eval`):**
- `src/lib/runner.ts` — `Arm`, `RunArtifacts`, `runScenario` (the cross-arm runner).
- `src/lib/topology.ts` — `acquaintanceGraph` / `structuralMetrics` (the O(N²) vs O(N) model).
- `src/lib/behavioral.ts` — `createTokenCountingModel`, `taskSuccess`, round-trip/latency helpers.
- `src/lib/provenance.ts` — `provenanceCompleteness`.
- `src/lib/canary.ts` — `detectLeaks`.
- `src/lib/results.ts` — `MetricsResult`, `aggregate`, `renderTable`.
- `src/lib/mock-model.ts` — `createMockChatModel` (deterministic `BaseChatModel`).
- `src/lib/run-eval.ts` — gated full-run entrypoint (sweep + 3 scenarios).
- `src/index.ts` — barrel.

---

### Task 1: agent-core additive changes — injectable model + `marketplaceScenario(n)`

**Files:**
- Modify: `packages/agent-core/src/lib/types.ts`, `src/lib/task-agent.ts`, `src/lib/scenarios/marketplace.ts`, `src/lib/scenarios/index.ts`, `src/index.ts`
- Test: `packages/agent-core/src/lib/task-agent.spec.ts` (extend), `src/lib/scenarios/scenarios.spec.ts` (extend)

**Interfaces:**
- Produces:
  - `TaskAgentConfig.model?: BaseChatModel` (from `@langchain/core/language_models/chat_models`) — when present, `createTaskAgent` uses it instead of building `ChatOpenAI`.
  - `marketplaceScenario(n: number): ScenarioDef` — 1 buyer + `n` sellers; cheapest seller is the last (`gamma`-style) at a known low price; `SCENARIOS.marketplace === marketplaceScenario(3)` behavior preserved.

- [ ] **Step 1: Write the failing injectable-model test**

Append to `packages/agent-core/src/lib/task-agent.spec.ts`:

```ts
import { ChatOpenAI } from "@langchain/openai";

describe("createTaskAgent injected model", () => {
    it("uses an injected model and ignores missing llm.apiKey", () => {
        const { factory } = fakeToolFactory();
        const metrics = createCouplingMetrics();
        const injected = new ChatOpenAI({ apiKey: "test-key", model: "x" });
        // llm:{} has no apiKey: if createTaskAgent built its own LLM it would
        // throw. Succeeding proves the injected model was used.
        const agent = createTaskAgent({
            model: injected,
            llm: {},
            systemPrompt: "t",
            peers: [{ peerId: "p", targetNodeId: "k", endpoint: "http://a" }],
            toolFactory: factory,
            metrics,
        });
        expect(agent).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test @graph-context-protocol/agent-core`
Expected: FAIL — `model` not on `TaskAgentConfig` (type error) or runtime throw on missing apiKey.

- [ ] **Step 3: Add the optional model to the type**

In `packages/agent-core/src/lib/types.ts`, add the import and the field:

```ts
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
```

and inside `TaskAgentConfig`, after the `llm` field:

```ts
    /** Optional pre-built chat model. When set, used instead of building one
     * from `llm` — lets a harness inject a deterministic mock or a
     * token-counting wrapper while keeping the SAME brain. */
    readonly model?: BaseChatModel;
```

- [ ] **Step 4: Use the injected model in the brain**

In `packages/agent-core/src/lib/task-agent.ts`, replace the `const llm = createOpenRouterLLM({...})` block with:

```ts
    const llm =
        config.model ??
        createOpenRouterLLM({
            apiKey: config.llm.apiKey,
            model: config.llm.model,
            temperature: config.llm.temperature,
        });
```

- [ ] **Step 5: Run the injectable-model test to verify it passes**

Run: `pnpm nx test @graph-context-protocol/agent-core`
Expected: PASS (the new test + all prior agent-core tests stay green).

- [ ] **Step 6: Write the failing `marketplaceScenario(n)` test**

Append to `packages/agent-core/src/lib/scenarios/scenarios.spec.ts`:

```ts
import { marketplaceScenario } from "./marketplace";

describe("marketplaceScenario(n)", () => {
    it("builds n sellers and a buyer that peers with all of them", () => {
        const s = marketplaceScenario(5);
        expect(s.knowledgeNodes).toHaveLength(5);
        expect(s.agent.peers).toHaveLength(5);
        expect(s.id).toBe("marketplace");
    });

    it("has a satisfiable cheapest-seller success predicate", () => {
        const s = marketplaceScenario(4);
        // cheapest seller id + its price both appear in a correct answer
        const cheapest = s.knowledgeNodes[s.knowledgeNodes.length - 1];
        const price = cheapest.content.match(/\$(\d+)/)?.[1];
        const id = cheapest.nodeId.split("-").pop();
        expect(s.succeeded(`cheapest is ${id} at $${price}`)).toBe(true);
        expect(s.succeeded("no idea")).toBe(false);
    });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm nx test @graph-context-protocol/agent-core`
Expected: FAIL — `marketplaceScenario` not exported.

- [ ] **Step 8: Implement `marketplaceScenario(n)`**

Replace the body of `packages/agent-core/src/lib/scenarios/marketplace.ts` with:

```ts
/**
 * Marketplace scenario — coupling/scaling (Claim 1). One buyer agent gathers
 * offers from n seller knowledge nodes. The structural O(N^2)-vs-O(N) curve is
 * computed separately by the eval topology model; this is the behavioral task.
 *
 * @module scenarios/marketplace
 */

import { PROVIDE_CONTEXT_SKILL, type ScenarioDef } from "./types";

/** Builds a marketplace with `n` sellers; the last seller is the cheapest. */
export function marketplaceScenario(n: number): ScenarioDef {
    const count = Math.max(2, n);
    // Descending prices so the LAST seller is always the unique cheapest.
    const sellers = Array.from({ length: count }, (_v, i) => ({
        id: `s${i}`,
        price: 10 + (count - 1 - i),
    }));
    const cheapest = sellers[sellers.length - 1];
    return {
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
        succeeded: (answer: string): boolean =>
            new RegExp(cheapest.id, "i").test(answer) &&
            new RegExp(`${cheapest.price}`).test(answer),
        forbiddenCanaries: [],
    };
}

/** The default fixed 3-seller marketplace (back-compat). */
export const marketplace: ScenarioDef = marketplaceScenario(3);
```

- [ ] **Step 9: Export the generator**

In `packages/agent-core/src/lib/scenarios/index.ts`, add `marketplaceScenario` to the re-export from `./marketplace` (it currently imports `marketplace`):

```ts
import { marketplace, marketplaceScenario } from "./marketplace";
```

and add to the bottom export block:

```ts
export { marketplaceScenario } from "./marketplace";
```

In `packages/agent-core/src/index.ts`, add to the scenarios export:

```ts
export { marketplaceScenario } from "./lib/scenarios/index";
```

- [ ] **Step 10: Run tests + typecheck**

Run: `pnpm nx test @graph-context-protocol/agent-core`
Expected: PASS (all agent-core tests incl. the 2 new groups).
Run: `pnpm nx typecheck @graph-context-protocol/agent-core`
Expected: PASS.

- [ ] **Step 11: Verify the existing scenario consumers still pass (back-compat)**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: PASS — `SCENARIOS.marketplace` still satisfies its existing tests (now `marketplaceScenario(3)`).

- [ ] **Step 12: Format + commit**

```bash
pnpm biome check --write packages/agent-core/src
git add packages/agent-core/src
git commit -m "feat(agent-core): injectable chat model + marketplaceScenario(n) generator"
```

---

### Task 2: eval package scaffold + `ScenarioRunner` + arm selector

**Files:**
- Create: `packages/eval/package.json`, `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`, `vitest.config.mts`, `src/index.ts`
- Create: `packages/eval/src/lib/runner.ts`
- Test: `packages/eval/src/lib/runner.spec.ts`

**Interfaces:**
- Consumes (Task 1): agent-core `createTaskAgent`/`runTaskAgent`/`createCouplingMetrics`/`PeerRef`/`ScenarioDef`/`CouplingMetricsSnapshot`/`TaskAgentConfig`; scenario `createGcpNode`/`createGcpPeerContextToolFactory`; baseline `createBaselineNode`/`createA2aPeerContextToolFactory`; server `createFetchHandler`/`createStaticTokenAuthProvider`/`createInMemoryAuditSink`/`queryRemoteContext`/`Principal`/`AuditSink`/`ReadProvenance`; core `createRole`.
- Produces:
  - `type Arm = "gcp" | "a2a"`
  - `interface RunArtifacts { answer: string; coupling: CouplingMetricsSnapshot; toolTranscript: ReadonlyArray<{ peerId: string; output: string }>; auditEvents: ReadonlyArray<ReadProvenance> }`
  - `interface RunOptions { arm: Arm; scenario: ScenarioDef; model?: BaseChatModel; llm?: { apiKey?: string }; }`
  - `runScenario(opts: RunOptions): Promise<RunArtifacts>`

- [ ] **Step 1: Scaffold the package**

Create `packages/eval/package.json`:

```json
{
    "name": "@graph-context-protocol/eval",
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
        "@graph-context-protocol/agent-core": "workspace:*",
        "@graph-context-protocol/baseline": "workspace:*",
        "@graph-context-protocol/core": "workspace:*",
        "@graph-context-protocol/scenario": "workspace:*",
        "@graph-context-protocol/server": "workspace:*",
        "@langchain/core": "^0.3.0",
        "zod": "^4.4.3"
    }
}
```

Create `packages/eval/tsconfig.json`:

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

Create `packages/eval/tsconfig.lib.json`:

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
        { "path": "../agent-core/tsconfig.lib.json" },
        { "path": "../baseline/tsconfig.lib.json" },
        { "path": "../core/tsconfig.lib.json" },
        { "path": "../scenario/tsconfig.lib.json" },
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

Create `packages/eval/tsconfig.spec.json`:

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

Create `packages/eval/vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig(() => ({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/packages/eval",
    test: {
        name: "@graph-context-protocol/eval",
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

Create `packages/eval/results/.gitignore` with a single line so the dir exists but its contents are ignored:

```
*
!.gitignore
```

- [ ] **Step 2: `pnpm install`**

Run: `pnpm install`
Expected: links `@graph-context-protocol/eval` into the workspace.

- [ ] **Step 3: Write the failing runner test (offline, construction-only arm isolation)**

Create `packages/eval/src/lib/runner.spec.ts`:

```ts
import { marketplaceScenario } from "@graph-context-protocol/agent-core";
import { ChatOpenAI } from "@langchain/openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runScenario } from "./runner";

// A non-network model: construction only, never invoked in this test because
// we stub runTaskAgent. Proves the runner builds each arm without a key.
const model = new ChatOpenAI({ apiKey: "test-key", model: "x" });

vi.mock("@graph-context-protocol/agent-core", async (orig) => {
    const actual =
        await orig<typeof import("@graph-context-protocol/agent-core")>();
    return { ...actual, runTaskAgent: vi.fn(async () => "stub answer") };
});

describe("runScenario arm isolation", () => {
    it("runs the GCP arm and returns artifacts", async () => {
        const art = await runScenario({
            arm: "gcp",
            scenario: marketplaceScenario(2),
            model,
        });
        expect(art.answer).toBe("stub answer");
        expect(art.coupling).toBeDefined();
        expect(Array.isArray(art.toolTranscript)).toBe(true);
        expect(Array.isArray(art.auditEvents)).toBe(true);
    });

    it("runs the A2A arm and closes its servers", async () => {
        const art = await runScenario({
            arm: "a2a",
            scenario: marketplaceScenario(2),
            model,
        });
        expect(art.answer).toBe("stub answer");
        // A2A arm has no GCP audit sink → no audit events.
        expect(art.auditEvents).toHaveLength(0);
    });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: FAIL — cannot find module `./runner`.

- [ ] **Step 5: Implement the runner**

Create `packages/eval/src/lib/runner.ts`:

```ts
/**
 * Cross-arm scenario runner. Builds the SAME scenario for arm ∈ {gcp, a2a} from
 * one ScenarioDef + one injected model, runs the shared agent-core brain, and
 * returns the artifacts the collectors need. The ONLY per-arm difference is the
 * tool factory and node hosting.
 *
 * @module runner
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
    type CouplingMetrics,
    type CouplingMetricsSnapshot,
    createCouplingMetrics,
    createTaskAgent,
    type PeerContextToolFactory,
    type PeerRef,
    runTaskAgent,
    type ScenarioDef,
} from "@graph-context-protocol/agent-core";
import {
    type BaselineNodeHandle,
    createA2aPeerContextToolFactory,
    createBaselineNode,
} from "@graph-context-protocol/baseline";
import { createRole } from "@graph-context-protocol/core";
import {
    type AuditSink,
    createFetchHandler,
    createInMemoryAuditSink,
    createStaticTokenAuthProvider,
    type Principal,
    queryRemoteContext,
    type ReadProvenance,
} from "@graph-context-protocol/server";
import { createGcpNode } from "@graph-context-protocol/scenario";
import { createGcpPeerContextToolFactory } from "@graph-context-protocol/scenario";

export type Arm = "gcp" | "a2a";

export interface RunArtifacts {
    readonly answer: string;
    readonly coupling: CouplingMetricsSnapshot;
    readonly toolTranscript: ReadonlyArray<{ peerId: string; output: string }>;
    readonly auditEvents: ReadonlyArray<ReadProvenance>;
}

export interface RunOptions {
    readonly arm: Arm;
    readonly scenario: ScenarioDef;
    /** Injected model (mock or token-wrapped). When omitted, `llm` is used. */
    readonly model?: BaseChatModel;
    readonly llm?: { apiKey?: string };
}

const TOKEN = "tok:agent";

/** Wraps a tool factory so every tool output is appended to a transcript. */
function recordingFactory(
    base: PeerContextToolFactory,
    transcript: { peerId: string; output: string }[],
): PeerContextToolFactory {
    return (peer: PeerRef, metrics: CouplingMetrics) => {
        const tool = base(peer, metrics);
        const originalInvoke = tool.invoke.bind(tool);
        // biome-ignore lint/suspicious/noExplicitAny: LangChain tool invoke is loosely typed
        tool.invoke = (async (input: any, config?: any) => {
            const output = await originalInvoke(input, config);
            transcript.push({ peerId: peer.peerId, output: String(output) });
            return output;
        }) as typeof tool.invoke;
        return tool;
    };
}

async function runGcp(opts: RunOptions): Promise<RunArtifacts> {
    const { scenario } = opts;
    const dir = mkdtempSync(join(tmpdir(), "eval-gcp-"));
    const auditSink: AuditSink = createInMemoryAuditSink();
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
                    { authProvider, auditSink },
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
        const transcript: { peerId: string; output: string }[] = [];
        const agent = createTaskAgent({
            model: opts.model,
            llm: opts.llm ?? {},
            systemPrompt: scenario.agent.systemPrompt,
            peers,
            toolFactory: recordingFactory(
                createGcpPeerContextToolFactory({
                    queryFn: (o) => queryRemoteContext({ ...o, fetchImpl }),
                }),
                transcript,
            ),
            metrics,
        });
        const answer = await runTaskAgent(agent, scenario.agent.goal);
        return {
            answer,
            coupling: metrics.snapshot(),
            toolTranscript: transcript,
            auditEvents: auditSink.list(),
        };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

async function runA2a(opts: RunOptions): Promise<RunArtifacts> {
    const { scenario } = opts;
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
        const transcript: { peerId: string; output: string }[] = [];
        const agent = createTaskAgent({
            model: opts.model,
            llm: opts.llm ?? {},
            systemPrompt: scenario.agent.systemPrompt,
            peers,
            toolFactory: recordingFactory(
                createA2aPeerContextToolFactory(),
                transcript,
            ),
            metrics,
        });
        const answer = await runTaskAgent(agent, scenario.agent.goal);
        return {
            answer,
            coupling: metrics.snapshot(),
            toolTranscript: transcript,
            auditEvents: [],
        };
    } finally {
        await Promise.all(handles.map((h) => h.close()));
    }
}

/** Runs a scenario under the chosen arm; returns artifacts for the collectors. */
export function runScenario(opts: RunOptions): Promise<RunArtifacts> {
    return opts.arm === "gcp" ? runGcp(opts) : runA2a(opts);
}
```

> Note: this lifts and generalizes M4b's `scenario-parity.spec.ts` harness (now an importable runner that also injects a model, records the tool transcript, and wires an AuditSink for the GCP arm).

- [ ] **Step 6: Create the barrel**

Create `packages/eval/src/index.ts`:

```ts
export type { Arm, RunArtifacts, RunOptions } from "./lib/runner";
export { runScenario } from "./lib/runner";
```

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: PASS (both arm tests; the GCP arm runs in-process, the A2A arm starts + closes real ephemeral servers).
Run: `pnpm nx typecheck @graph-context-protocol/eval`
Expected: PASS.

- [ ] **Step 8: Format + commit**

```bash
pnpm biome check --write packages/eval
git add packages/eval pnpm-lock.yaml
git commit -m "feat(eval): cross-arm ScenarioRunner + arm selector + RunArtifacts"
```

---

### Task 3: structural collector — acquaintance graph + integration effort

**Files:**
- Create: `packages/eval/src/lib/topology.ts`
- Modify: `packages/eval/src/index.ts`
- Test: `packages/eval/src/lib/topology.spec.ts`

**Interfaces:**
- Produces:
  - `interface StructuralMetrics { readonly pairwiseConnections: number; readonly integrationEffort: number }`
  - `structuralMetrics(arm: Arm, n: number): StructuralMetrics` — models an n-participant federation: A2A all-to-all acquaintance `n*(n-1)` (~O(n²)); GCP register-once `n` (~O(n)). `integrationEffort` = pairwiseConnections(n+1) − pairwiseConnections(n).

- [ ] **Step 1: Write the failing test**

Create `packages/eval/src/lib/topology.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { structuralMetrics } from "./topology";

describe("structuralMetrics", () => {
    it("A2A acquaintance grows quadratically (n*(n-1))", () => {
        expect(structuralMetrics("a2a", 2).pairwiseConnections).toBe(2);
        expect(structuralMetrics("a2a", 5).pairwiseConnections).toBe(20);
        expect(structuralMetrics("a2a", 10).pairwiseConnections).toBe(90);
    });

    it("GCP acquaintance grows linearly (n)", () => {
        expect(structuralMetrics("gcp", 2).pairwiseConnections).toBe(2);
        expect(structuralMetrics("gcp", 5).pairwiseConnections).toBe(5);
        expect(structuralMetrics("gcp", 50).pairwiseConnections).toBe(50);
    });

    it("integration effort: A2A ~O(n), GCP ~O(1)", () => {
        // add one node: A2A delta = (n+1)n - n(n-1) = 2n ; GCP delta = 1
        expect(structuralMetrics("a2a", 10).integrationEffort).toBe(20);
        expect(structuralMetrics("gcp", 10).integrationEffort).toBe(1);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: FAIL — cannot find module `./topology`.

- [ ] **Step 3: Implement**

Create `packages/eval/src/lib/topology.ts`:

```ts
/**
 * Structural coupling metrics — the headline Claim-1 curve. Models an
 * n-participant federation's acquaintance graph (who-must-know-whom),
 * independent of the LLM. A2A point-to-point requires every participant to hold
 * a card for every peer → ~O(n^2); GCP register-once + discover → ~O(n).
 *
 * @module topology
 */

import type { Arm } from "./runner";

export interface StructuralMetrics {
    /** Acquaintance-graph edge count for an n-participant ecosystem. */
    readonly pairwiseConnections: number;
    /** Edges added to onboard participant n+1 (marginal of the curve). */
    readonly integrationEffort: number;
}

function pairwise(arm: Arm, n: number): number {
    const size = Math.max(0, n);
    // A2A: directed acquaintance, each of n holds a card for the other n-1.
    // GCP: each registers once with the discovery substrate.
    return arm === "a2a" ? size * (size - 1) : size;
}

/** Structural metrics for an n-participant federation under `arm`. */
export function structuralMetrics(arm: Arm, n: number): StructuralMetrics {
    return {
        pairwiseConnections: pairwise(arm, n),
        integrationEffort: pairwise(arm, n + 1) - pairwise(arm, n),
    };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: PASS.

- [ ] **Step 5: Export + commit**

In `packages/eval/src/index.ts` add:

```ts
export type { StructuralMetrics } from "./lib/topology";
export { structuralMetrics } from "./lib/topology";
```

```bash
pnpm biome check --write packages/eval/src
git add packages/eval/src
git commit -m "feat(eval): structural acquaintance-graph + integration-effort collector"
```

---

### Task 4: behavioral collectors — token-counting model, task success, provenance

**Files:**
- Create: `packages/eval/src/lib/behavioral.ts`, `src/lib/provenance.ts`
- Modify: `packages/eval/src/index.ts`
- Test: `packages/eval/src/lib/behavioral.spec.ts`, `src/lib/provenance.spec.ts`

**Interfaces:**
- Consumes: `RunArtifacts` (Task 2); `ScenarioDef` (agent-core); `BaseChatModel` (`@langchain/core`); `ReadProvenance` (server).
- Produces:
  - `interface TokenCounter { readonly model: BaseChatModel; total(): number }`
  - `createTokenCountingModel(inner: BaseChatModel): TokenCounter` — wraps a model; sums `response_metadata.usage`/`usage_metadata` total tokens across calls.
  - `taskSuccess(scenario: ScenarioDef, artifacts: RunArtifacts): boolean`
  - `provenanceCompleteness(artifacts: RunArtifacts, readDecisions: number): number` — `auditEvents.length / readDecisions` clamped to [0,1]; `readDecisions === 0 → 1`.

- [ ] **Step 1: Write the failing provenance test**

Create `packages/eval/src/lib/provenance.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { provenanceCompleteness } from "./provenance";

const base = { answer: "", coupling: { peersKnown: 0, connectionsOpened: 0, messagesSent: 0 }, toolTranscript: [] };

describe("provenanceCompleteness", () => {
    it("is 1.0 when every read decision was audited (GCP)", () => {
        const art = { ...base, auditEvents: [{}, {}, {}] as never };
        expect(provenanceCompleteness(art, 3)).toBe(1);
    });
    it("is 0 when nothing was audited (A2A)", () => {
        const art = { ...base, auditEvents: [] as never };
        expect(provenanceCompleteness(art, 3)).toBe(0);
    });
    it("is 1.0 vacuously when there were no read decisions", () => {
        const art = { ...base, auditEvents: [] as never };
        expect(provenanceCompleteness(art, 0)).toBe(1);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: FAIL — cannot find module `./provenance`.

- [ ] **Step 3: Implement provenance**

Create `packages/eval/src/lib/provenance.ts`:

```ts
/**
 * Provenance-completeness metric: fraction of read decisions that produced an
 * audit record. GCP wires an AuditSink (→ ~1.0); A2A has none (→ 0).
 *
 * @module provenance
 */

import type { RunArtifacts } from "./runner";

/** auditEvents / readDecisions, clamped to [0,1]; 0 decisions → 1 (vacuous). */
export function provenanceCompleteness(
    artifacts: RunArtifacts,
    readDecisions: number,
): number {
    if (readDecisions <= 0) return 1;
    return Math.min(1, artifacts.auditEvents.length / readDecisions);
}
```

- [ ] **Step 4: Write the failing behavioral test**

Create `packages/eval/src/lib/behavioral.spec.ts`:

```ts
import { marketplaceScenario } from "@graph-context-protocol/agent-core";
import { AIMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { createTokenCountingModel, taskSuccess, usageTokens } from "./behavioral";

const baseArt = {
    coupling: { peersKnown: 0, connectionsOpened: 0, messagesSent: 0 },
    toolTranscript: [],
    auditEvents: [] as never,
};

describe("taskSuccess", () => {
    it("delegates to the scenario success predicate", () => {
        const s = marketplaceScenario(2);
        const cheapest = s.knowledgeNodes[s.knowledgeNodes.length - 1];
        const price = cheapest.content.match(/\$(\d+)/)?.[1];
        const id = cheapest.nodeId.split("-").pop();
        expect(
            taskSuccess(s, { ...baseArt, answer: `${id} at $${price}` }),
        ).toBe(true);
        expect(taskSuccess(s, { ...baseArt, answer: "nope" })).toBe(false);
    });
});

describe("usageTokens", () => {
    it("reads usage_metadata.total_tokens", () => {
        const m = new AIMessage({ content: "x" });
        // biome-ignore lint/suspicious/noExplicitAny: attaching provider metadata
        (m as any).usage_metadata = { total_tokens: 42 };
        expect(usageTokens(m)).toBe(42);
    });
    it("falls back to response_metadata prompt+completion", () => {
        const m = new AIMessage({ content: "x" });
        // biome-ignore lint/suspicious/noExplicitAny: attaching provider metadata
        (m as any).response_metadata = {
            usage: { prompt_tokens: 5, completion_tokens: 7 },
        };
        expect(usageTokens(m)).toBe(12);
    });
    it("returns 0 when no usage is present", () => {
        expect(usageTokens(new AIMessage({ content: "x" }))).toBe(0);
    });
});

describe("createTokenCountingModel", () => {
    it("wraps the inner model and starts at zero", () => {
        // A non-network model: construction only, never invoked here.
        const inner = new ChatOpenAI({ apiKey: "test-key", model: "x" });
        const counter = createTokenCountingModel(inner);
        expect(counter.model).toBe(inner);
        expect(counter.total()).toBe(0);
    });
});
```

Add the import at the top of the test file:

```ts
import { ChatOpenAI } from "@langchain/openai";
```

> Note: the extraction logic (`usageTokens`) is unit-tested directly against fake message metadata; the accumulation across real calls is exercised in the gated full runs. `@langchain/openai` is already an agent-core dep available transitively, but if the eval `tsconfig`/deps don't resolve it, add `@langchain/openai` to `packages/eval/package.json` devDependencies.

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: FAIL — cannot find module `./behavioral`.

- [ ] **Step 6: Implement behavioral**

Create `packages/eval/src/lib/behavioral.ts`:

```ts
/**
 * Behavioral collectors: task success (delegates to the scenario oracle) and a
 * token-counting chat-model wrapper that sums usage across calls. messages,
 * connections, round-trips and latency are read by the caller from the
 * CouplingMetrics snapshot / wall-clock around runScenario.
 *
 * @module behavioral
 */

import type { ScenarioDef } from "@graph-context-protocol/agent-core";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import type { RunArtifacts } from "./runner";

/** True iff the run's answer satisfies the scenario's success oracle. */
export function taskSuccess(
    scenario: ScenarioDef,
    artifacts: RunArtifacts,
): boolean {
    return scenario.succeeded(artifacts.answer);
}

export interface TokenCounter {
    readonly model: BaseChatModel;
    total(): number;
}

/** Extracts total token usage from a generated message (provider-agnostic). */
export function usageTokens(message: BaseMessage): number {
    // LangChain places token usage on usage_metadata (preferred) or
    // response_metadata.usage / .tokenUsage depending on provider.
    // biome-ignore lint/suspicious/noExplicitAny: provider-specific metadata
    const m = message as any;
    const u = m.usage_metadata;
    if (u && typeof u.total_tokens === "number") return u.total_tokens;
    const r = m.response_metadata ?? {};
    const usage = r.usage ?? r.tokenUsage ?? {};
    const total =
        usage.total_tokens ??
        (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
    return typeof total === "number" ? total : 0;
}

/**
 * Wraps a chat model so every generated message's token usage is accumulated.
 * Hooks the model's callbacks so it works regardless of how the brain invokes
 * it. The returned `model` is passed to createTaskAgent as the injected model.
 */
export function createTokenCountingModel(inner: BaseChatModel): TokenCounter {
    let total = 0;
    inner.callbacks = [
        {
            handleLLMEnd: (output: {
                generations: { message?: BaseMessage }[][];
            }) => {
                for (const row of output.generations ?? []) {
                    for (const gen of row) {
                        if (gen.message) total += usageTokens(gen.message);
                    }
                }
            },
        },
    ];
    return { model: inner, total: () => total };
}
```

> Note: reconcile the callback shape (`handleLLMEnd`'s `LLMResult`) against the installed `@langchain/core` types; the `generations[][].message` path is the chat-model result shape. If `inner.callbacks` is read-only on the installed type, pass the handler via `inner.withConfig({ callbacks: [...] })` and return that as `model`.

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: PASS.
Run: `pnpm nx typecheck @graph-context-protocol/eval`
Expected: PASS.

- [ ] **Step 8: Export + commit**

In `packages/eval/src/index.ts` add:

```ts
export type { TokenCounter } from "./lib/behavioral";
export { createTokenCountingModel, taskSuccess } from "./lib/behavioral";
export { provenanceCompleteness } from "./lib/provenance";
```

```bash
pnpm biome check --write packages/eval/src
git add packages/eval/src
git commit -m "feat(eval): behavioral collectors (token wrapper, task success, provenance)"
```

---

### Task 5: canary leakage detector

**Files:**
- Create: `packages/eval/src/lib/canary.ts`
- Modify: `packages/eval/src/index.ts`
- Test: `packages/eval/src/lib/canary.spec.ts`

**Interfaces:**
- Consumes: `ScenarioDef` (for `forbiddenCanaries`); `RunArtifacts` (`answer` + `toolTranscript`).
- Produces:
  - `interface LeakageMetrics { readonly canariesReached: number; readonly totalCanaries: number; readonly leakageRate: number }`
  - `detectLeaks(scenario: ScenarioDef, artifacts: RunArtifacts): LeakageMetrics` — exact-match scan of the answer + every tool output for each forbidden canary.

- [ ] **Step 1: Write the failing test**

Create `packages/eval/src/lib/canary.spec.ts`:

```ts
import type { ScenarioDef } from "@graph-context-protocol/agent-core";
import { describe, expect, it } from "vitest";
import { detectLeaks } from "./canary";

const scenario = {
    forbiddenCanaries: ["CANARY-X", "CANARY-Y"],
} as ScenarioDef;

const base = { coupling: { peersKnown: 0, connectionsOpened: 0, messagesSent: 0 }, auditEvents: [] as never };

describe("detectLeaks", () => {
    it("flags a canary that reached the agent via tool output", () => {
        const art = {
            ...base,
            answer: "summary",
            toolTranscript: [{ peerId: "p", output: "secret CANARY-X here" }],
        };
        const r = detectLeaks(scenario, art);
        expect(r.canariesReached).toBe(1);
        expect(r.totalCanaries).toBe(2);
        expect(r.leakageRate).toBeCloseTo(0.5);
    });

    it("flags a canary that appears in the final answer", () => {
        const art = { ...base, answer: "leaked CANARY-Y", toolTranscript: [] };
        expect(detectLeaks(scenario, art).canariesReached).toBe(1);
    });

    it("reports zero leakage on an authorized/clean run (GCP)", () => {
        const art = {
            ...base,
            answer: "clean public summary",
            toolTranscript: [{ peerId: "p", output: "public info only" }],
        };
        const r = detectLeaks(scenario, art);
        expect(r.canariesReached).toBe(0);
        expect(r.leakageRate).toBe(0);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: FAIL — cannot find module `./canary`.

- [ ] **Step 3: Implement**

Create `packages/eval/src/lib/canary.ts`:

```ts
/**
 * Canary leakage detection (Claim 2). Exact-match scan of the agent's answer
 * and every tool output for each scenario forbidden canary. A forbidden canary
 * present = a leak. Exact-match catches verbatim leaks only → a lower bound.
 *
 * @module canary
 */

import type { ScenarioDef } from "@graph-context-protocol/agent-core";
import type { RunArtifacts } from "./runner";

export interface LeakageMetrics {
    readonly canariesReached: number;
    readonly totalCanaries: number;
    readonly leakageRate: number;
}

/** Counts how many forbidden canaries reached the agent (answer or tool I/O). */
export function detectLeaks(
    scenario: ScenarioDef,
    artifacts: RunArtifacts,
): LeakageMetrics {
    const haystack = [
        artifacts.answer,
        ...artifacts.toolTranscript.map((t) => t.output),
    ].join("\n");
    const total = scenario.forbiddenCanaries.length;
    const reached = scenario.forbiddenCanaries.filter((c) =>
        haystack.includes(c),
    ).length;
    return {
        canariesReached: reached,
        totalCanaries: total,
        leakageRate: total === 0 ? 0 : reached / total,
    };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: PASS.

- [ ] **Step 5: Export + commit**

In `packages/eval/src/index.ts` add:

```ts
export type { LeakageMetrics } from "./lib/canary";
export { detectLeaks } from "./lib/canary";
```

```bash
pnpm biome check --write packages/eval/src
git add packages/eval/src
git commit -m "feat(eval): canary leakage detector"
```

---

### Task 6: results emitter — MetricsResult, aggregation, table rendering

**Files:**
- Create: `packages/eval/src/lib/results.ts`
- Modify: `packages/eval/src/index.ts`
- Test: `packages/eval/src/lib/results.spec.ts`

**Interfaces:**
- Consumes: `StructuralMetrics` (Task 3), `LeakageMetrics` (Task 5).
- Produces:
  - `interface BehavioralSample { messages: number; connections: number; tokens: number; roundTrips: number; latencyMs: number; taskSuccess: boolean }`
  - `interface MetricsResult { scenarioId: string; arm: Arm; n: number; seed: number; structural: StructuralMetrics; behavioral: BehavioralSample; leakage: LeakageMetrics; provenance: number }`
  - `interface Aggregate { mean: number; stdev: number; n: number }`
  - `aggregateBehavioral(results: MetricsResult[]): Record<string, Aggregate>` — per numeric behavioral field, mean±stdev across seeds.
  - `renderTable(scenarioId: string, results: MetricsResult[]): string` — a markdown GCP-vs-A2A table.

- [ ] **Step 1: Write the failing test**

Create `packages/eval/src/lib/results.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aggregateBehavioral, type MetricsResult, renderTable } from "./results";

function mk(arm: "gcp" | "a2a", seed: number, tokens: number, success: boolean): MetricsResult {
    return {
        scenarioId: "marketplace",
        arm,
        n: 3,
        seed,
        structural: { pairwiseConnections: arm === "a2a" ? 6 : 3, integrationEffort: arm === "a2a" ? 6 : 1 },
        behavioral: { messages: 3, connections: 3, tokens, roundTrips: 3, latencyMs: 10, taskSuccess: success },
        leakage: { canariesReached: 0, totalCanaries: 0, leakageRate: 0 },
        provenance: arm === "gcp" ? 1 : 0,
    };
}

describe("aggregateBehavioral", () => {
    it("computes mean and stdev of a numeric field across seeds", () => {
        const agg = aggregateBehavioral([mk("a2a", 1, 100, true), mk("a2a", 2, 200, true)]);
        expect(agg.tokens.mean).toBe(150);
        expect(agg.tokens.n).toBe(2);
        expect(agg.tokens.stdev).toBeCloseTo(50);
    });
});

describe("renderTable", () => {
    it("renders a markdown table naming both arms", () => {
        const md = renderTable("marketplace", [mk("gcp", 1, 50, true), mk("a2a", 1, 80, true)]);
        expect(md).toContain("marketplace");
        expect(md).toContain("gcp");
        expect(md).toContain("a2a");
        expect(md).toContain("|");
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: FAIL — cannot find module `./results`.

- [ ] **Step 3: Implement**

Create `packages/eval/src/lib/results.ts`:

```ts
/**
 * Results model + aggregation + markdown rendering. Behavioral metrics are
 * aggregated across seeds as mean±stdev (LLM nondeterminism); structural
 * metrics are exact.
 *
 * @module results
 */

import type { LeakageMetrics } from "./canary";
import type { Arm } from "./runner";
import type { StructuralMetrics } from "./topology";

export interface BehavioralSample {
    readonly messages: number;
    readonly connections: number;
    readonly tokens: number;
    readonly roundTrips: number;
    readonly latencyMs: number;
    readonly taskSuccess: boolean;
}

export interface MetricsResult {
    readonly scenarioId: string;
    readonly arm: Arm;
    readonly n: number;
    readonly seed: number;
    readonly structural: StructuralMetrics;
    readonly behavioral: BehavioralSample;
    readonly leakage: LeakageMetrics;
    readonly provenance: number;
}

export interface Aggregate {
    readonly mean: number;
    readonly stdev: number;
    readonly n: number;
}

const NUMERIC_FIELDS = [
    "messages",
    "connections",
    "tokens",
    "roundTrips",
    "latencyMs",
] as const;

function agg(values: number[]): Aggregate {
    const n = values.length;
    if (n === 0) return { mean: 0, stdev: 0, n: 0 };
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance =
        values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    return { mean, stdev: Math.sqrt(variance), n };
}

/** Per numeric behavioral field, mean±stdev across the given results. */
export function aggregateBehavioral(
    results: MetricsResult[],
): Record<string, Aggregate> {
    const out: Record<string, Aggregate> = {};
    for (const field of NUMERIC_FIELDS) {
        out[field] = agg(results.map((r) => r.behavioral[field]));
    }
    out.successRate = agg(
        results.map((r) => (r.behavioral.taskSuccess ? 1 : 0)),
    );
    return out;
}

/** Renders a GCP-vs-A2A markdown comparison table for one scenario. */
export function renderTable(
    scenarioId: string,
    results: MetricsResult[],
): string {
    const arms: Arm[] = ["gcp", "a2a"];
    const byArm = (arm: Arm) => results.filter((r) => r.arm === arm);
    const lines: string[] = [];
    lines.push(`### ${scenarioId}`);
    lines.push("");
    lines.push("| metric | gcp | a2a |");
    lines.push("| --- | --- | --- |");
    const fmt = (a: Aggregate) =>
        a.n > 1
            ? `${a.mean.toFixed(1)} ± ${a.stdev.toFixed(1)}`
            : `${a.mean.toFixed(1)}`;
    const gcpAgg = aggregateBehavioral(byArm("gcp"));
    const a2aAgg = aggregateBehavioral(byArm("a2a"));
    for (const field of [...NUMERIC_FIELDS, "successRate"]) {
        lines.push(`| ${field} | ${fmt(gcpAgg[field])} | ${fmt(a2aAgg[field])} |`);
    }
    const struct = (arm: Arm) => byArm(arm)[0]?.structural;
    lines.push(
        `| pairwiseConnections (struct) | ${struct("gcp")?.pairwiseConnections ?? "-"} | ${struct("a2a")?.pairwiseConnections ?? "-"} |`,
    );
    lines.push(
        `| integrationEffort (struct) | ${struct("gcp")?.integrationEffort ?? "-"} | ${struct("a2a")?.integrationEffort ?? "-"} |`,
    );
    const leak = (arm: Arm) => byArm(arm)[0]?.leakage.leakageRate ?? 0;
    lines.push(`| leakageRate | ${leak("gcp")} | ${leak("a2a")} |`);
    const prov = (arm: Arm) => byArm(arm)[0]?.provenance ?? 0;
    lines.push(`| provenanceCompleteness | ${prov("gcp")} | ${prov("a2a")} |`);
    lines.push("");
    return lines.join("\n");
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: PASS.

- [ ] **Step 5: Export + commit**

In `packages/eval/src/index.ts` add:

```ts
export type {
    Aggregate,
    BehavioralSample,
    MetricsResult,
} from "./lib/results";
export { aggregateBehavioral, renderTable } from "./lib/results";
```

```bash
pnpm biome check --write packages/eval/src
git add packages/eval/src
git commit -m "feat(eval): results model + seed aggregation + markdown table"
```

---

### Task 7: deterministic mock chat model

**Files:**
- Create: `packages/eval/src/lib/mock-model.ts`
- Modify: `packages/eval/src/index.ts`
- Test: `packages/eval/src/lib/mock-model.spec.ts`

**Interfaces:**
- Consumes: `createTaskAgent`/`runTaskAgent`/`createCouplingMetrics`/`PeerContextToolFactory` (agent-core).
- Produces:
  - `createMockChatModel(opts: { finalAnswer: string }): BaseChatModel` — a deterministic model that, on its first call with bound tools, emits one tool call per bound tool (`{ question }`), then on the next call (tool results present) returns `finalAnswer`. Drives a react agent through exactly one round of parallel tool calls.

- [ ] **Step 1: Write the failing test**

Create `packages/eval/src/lib/mock-model.spec.ts`:

```ts
import {
    createCouplingMetrics,
    createTaskAgent,
    type PeerContextToolFactory,
    type PeerRef,
    runTaskAgent,
} from "@graph-context-protocol/agent-core";
import { tool } from "@langchain/core/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMockChatModel } from "./mock-model";

const schema = z.object({ question: z.string() });
const factory: PeerContextToolFactory = (peer: PeerRef, metrics) => {
    metrics.recordPeerContacted(peer.peerId);
    return tool(
        async () => {
            metrics.recordMessageSent();
            return `answer from ${peer.peerId}`;
        },
        { name: "query_peer_context", description: "d", schema },
    );
};

describe("createMockChatModel", () => {
    it("drives a react agent through one tool call per peer then answers", async () => {
        const metrics = createCouplingMetrics();
        const agent = createTaskAgent({
            model: createMockChatModel({ finalAnswer: "cheapest is s1 at $10" }),
            llm: {},
            systemPrompt: "t",
            peers: [
                { peerId: "p1", targetNodeId: "k1", endpoint: "x" },
                { peerId: "p2", targetNodeId: "k2", endpoint: "y" },
            ],
            toolFactory: factory,
            metrics,
        });
        const answer = await runTaskAgent(agent, "go");
        expect(answer).toContain("cheapest is s1 at $10");
        expect(metrics.snapshot().messagesSent).toBe(2);
        expect(metrics.snapshot().connectionsOpened).toBe(2);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: FAIL — cannot find module `./mock-model`.

- [ ] **Step 3: Implement the mock model**

Create `packages/eval/src/lib/mock-model.ts`:

```ts
/**
 * Deterministic mock chat model for hermetic CI. On the first call (no tool
 * results yet) it emits one tool call per bound tool; on the next call it
 * returns the fixed finalAnswer. Drives a react agent through exactly one round
 * of parallel tool calls — no network, no key.
 *
 * @module mock-model
 */

import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
    BaseChatModel,
    type BaseChatModelParams,
} from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
// biome-ignore lint/suspicious/noExplicitAny: LangChain tool/binding shapes are loose
type AnyTool = any;

class MockChatModel extends BaseChatModel {
    private boundTools: AnyTool[] = [];
    constructor(
        private readonly finalAnswer: string,
        params: BaseChatModelParams = {},
    ) {
        super(params);
    }

    _llmType(): string {
        return "mock";
    }

    // createReactAgent calls bindTools(tools); we keep them and return self.
    override bindTools(tools: AnyTool[]): this {
        this.boundTools = tools;
        return this;
    }

    async _generate(
        messages: BaseMessage[],
        _options: this["ParsedCallOptions"],
        _runManager?: CallbackManagerForLLMRun,
    ): Promise<ChatResult> {
        const toolsRan = messages.some((m) => m.getType() === "tool");
        if (!toolsRan && this.boundTools.length > 0) {
            const toolCalls = this.boundTools.map((t, i) => ({
                name: t.name as string,
                args: { question: "what is your price?" },
                id: `call_${i}`,
                type: "tool_call" as const,
            }));
            const message = new AIMessage({ content: "", tool_calls: toolCalls });
            return { generations: [{ message, text: "" }] };
        }
        const message = new AIMessage({ content: this.finalAnswer });
        return { generations: [{ message, text: this.finalAnswer }] };
    }
}

/** Builds a deterministic mock chat model that answers `finalAnswer`. */
export function createMockChatModel(opts: {
    finalAnswer: string;
}): BaseChatModel {
    return new MockChatModel(opts.finalAnswer);
}
```

> Note: reconcile against the installed `@langchain/core` — `_generate`'s options type (`this["ParsedCallOptions"]`), `message.getType()` vs `_getType()`, and the `tool_calls` shape (`{ name, args, id, type: "tool_call" }`). The contract the test pins is: one tool call per bound tool on the first turn, then `finalAnswer`. If `bindTools` must return a distinct runnable rather than `this`, return a shallow clone that shares `boundTools` + `finalAnswer`. If `_generate` is not the right override (some versions want `_generateMessages`/`invoke`), match the installed `BaseChatModel` abstract surface — the test is the source of truth for behavior.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: PASS — the agent calls both peer tools (messagesSent 2, connectionsOpened 2) and returns the final answer.

- [ ] **Step 5: Export + commit**

In `packages/eval/src/index.ts` add:

```ts
export { createMockChatModel } from "./lib/mock-model";
```

```bash
pnpm biome check --write packages/eval/src
git add packages/eval/src
git commit -m "feat(eval): deterministic mock chat model for hermetic runs"
```

---

### Task 8: hermetic CI smoke (both arms, end-to-end) + gated full-run entrypoint

**Files:**
- Create: `packages/eval/src/lib/run-eval.ts`
- Create: `packages/eval/src/lib/smoke.spec.ts`
- Create: `packages/eval/src/lib/run-eval.spec.ts`
- Modify: `packages/eval/src/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–7.
- Produces:
  - `collectResult(opts: { scenario: ScenarioDef; arm: Arm; n: number; seed: number; model?: BaseChatModel; llm?: { apiKey?: string } }): Promise<MetricsResult>` — runs one scenario+arm and assembles a full `MetricsResult`.
  - `runFullEval(opts?: { seeds?: number; sweep?: number[]; anchors?: number[] }): Promise<string>` — gated entrypoint; runs the 3 scenarios over both arms + seeds, returns the rendered markdown report.

- [ ] **Step 1: Write the failing hermetic smoke test (mock LLM, both arms)**

Create `packages/eval/src/lib/smoke.spec.ts`:

```ts
import { marketplaceScenario, SCENARIOS } from "@graph-context-protocol/agent-core";
import { describe, expect, it } from "vitest";
import { createMockChatModel } from "./mock-model";
import { collectResult } from "./run-eval";

describe("hermetic eval smoke (mock LLM)", () => {
    it("marketplace: both arms complete and produce metrics", async () => {
        const scenario = marketplaceScenario(2);
        // cheapest is the last seller (s1) at $10 per marketplaceScenario rules
        const model = createMockChatModel({ finalAnswer: "cheapest is s1 at $10" });
        for (const arm of ["gcp", "a2a"] as const) {
            const r = await collectResult({ scenario, arm, n: 2, seed: 1, model });
            expect(r.behavioral.messages).toBe(2);
            expect(r.behavioral.taskSuccess).toBe(true);
            expect(r.structural.pairwiseConnections).toBe(arm === "a2a" ? 2 : 2);
        }
    });

    it("software-org: GCP denies the canary, A2A leaks it", async () => {
        const scenario = SCENARIOS["software-org"];
        const model = createMockChatModel({
            finalAnswer: "Aurora public summary, release 2.1.0",
        });
        const gcp = await collectResult({ scenario, arm: "gcp", n: 2, seed: 1, model });
        const a2a = await collectResult({ scenario, arm: "a2a", n: 2, seed: 1, model });
        // GCP role-gating denies the under-privileged read → no canary reaches the agent.
        expect(gcp.leakage.canariesReached).toBe(0);
        // A2A coarse card exposes the confidential node → canary leaks via tool I/O.
        expect(a2a.leakage.canariesReached).toBeGreaterThan(0);
        // GCP audited its read decisions; A2A did not.
        expect(gcp.provenance).toBeGreaterThan(0);
        expect(a2a.provenance).toBe(0);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: FAIL — cannot find module `./run-eval`.

- [ ] **Step 3: Implement the entrypoint + `collectResult`**

Create `packages/eval/src/lib/run-eval.ts`:

```ts
/**
 * Assembles a full MetricsResult from one scenario+arm run, and the gated
 * full-run entrypoint that produces the article's markdown report. CI uses
 * collectResult with the mock model (hermetic); full runs use the real LLM over
 * seeds (gated on RUN_EVAL=1 + OPENROUTER_API_KEY).
 *
 * @module run-eval
 */

import {
    marketplaceScenario,
    SCENARIOS,
    type ScenarioDef,
} from "@graph-context-protocol/agent-core";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { detectLeaks } from "./canary";
import { createTokenCountingModel, taskSuccess } from "./behavioral";
import { provenanceCompleteness } from "./provenance";
import { type Arm, runScenario } from "./runner";
import { type MetricsResult, renderTable } from "./results";
import { structuralMetrics } from "./topology";

export interface CollectOptions {
    readonly scenario: ScenarioDef;
    readonly arm: Arm;
    readonly n: number;
    readonly seed: number;
    readonly model?: BaseChatModel;
    readonly llm?: { apiKey?: string };
}

/** Runs one scenario+arm and assembles the full MetricsResult. */
export async function collectResult(
    opts: CollectOptions,
): Promise<MetricsResult> {
    const counter = opts.model
        ? createTokenCountingModel(opts.model)
        : undefined;
    const started = performance.now();
    const artifacts = await runScenario({
        arm: opts.arm,
        scenario: opts.scenario,
        model: counter?.model ?? opts.model,
        llm: opts.llm,
    });
    const latencyMs = performance.now() - started;
    const readDecisions = artifacts.coupling.messagesSent;
    return {
        scenarioId: opts.scenario.id,
        arm: opts.arm,
        n: opts.n,
        seed: opts.seed,
        structural: structuralMetrics(opts.arm, opts.n),
        behavioral: {
            messages: artifacts.coupling.messagesSent,
            connections: artifacts.coupling.connectionsOpened,
            tokens: counter ? counter.total() : 0,
            roundTrips: artifacts.toolTranscript.length,
            latencyMs,
            taskSuccess: taskSuccess(opts.scenario, artifacts),
        },
        leakage: detectLeaks(opts.scenario, artifacts),
        provenance: provenanceCompleteness(artifacts, readDecisions),
    };
}

/**
 * Gated full evaluation across the three scenarios, both arms, K seeds. Returns
 * the rendered markdown report. Requires RUN_EVAL=1 + OPENROUTER_API_KEY.
 */
export async function runFullEval(opts?: {
    seeds?: number;
    sweep?: number[];
    anchors?: number[];
}): Promise<string> {
    const key = process.env.OPENROUTER_API_KEY;
    if (process.env.RUN_EVAL !== "1" || key === undefined) {
        throw new Error(
            "runFullEval requires RUN_EVAL=1 and OPENROUTER_API_KEY",
        );
    }
    const seeds = opts?.seeds ?? 5;
    const anchors = opts?.anchors ?? [2, 5, 10];
    const llm = { apiKey: key };
    const scenarios: ScenarioDef[] = [
        SCENARIOS["software-org"],
        SCENARIOS["supply-chain"],
    ];
    const sections: string[] = [];

    // Behavioral scenarios (software-org, supply-chain) at fixed topology.
    for (const scenario of scenarios) {
        const results: MetricsResult[] = [];
        for (const arm of ["gcp", "a2a"] as const) {
            for (let seed = 1; seed <= seeds; seed++) {
                results.push(
                    await collectResult({
                        scenario,
                        arm,
                        n: scenario.knowledgeNodes.length,
                        seed,
                        llm,
                    }),
                );
            }
        }
        sections.push(renderTable(scenario.id, results));
    }

    // Marketplace: behavioral at anchor N + structural curve at every N.
    const mkt: MetricsResult[] = [];
    for (const n of anchors) {
        for (const arm of ["gcp", "a2a"] as const) {
            for (let seed = 1; seed <= seeds; seed++) {
                mkt.push(
                    await collectResult({
                        scenario: marketplaceScenario(n),
                        arm,
                        n,
                        seed,
                        llm,
                    }),
                );
            }
        }
    }
    sections.push(renderTable("marketplace", mkt));

    sections.push("### marketplace structural curve (pairwiseConnections)");
    sections.push("");
    sections.push("| N | gcp | a2a |");
    sections.push("| --- | --- | --- |");
    for (let n = 2; n <= 50; n++) {
        sections.push(
            `| ${n} | ${structuralMetrics("gcp", n).pairwiseConnections} | ${structuralMetrics("a2a", n).pairwiseConnections} |`,
        );
    }
    sections.push("");
    return sections.join("\n");
}
```

> Note: `provenanceCompleteness` is imported from `./provenance` (its defining module); `./behavioral` exports only `createTokenCountingModel` and `taskSuccess`. The package barrel re-exports `provenanceCompleteness` from `./lib/provenance` (Task 4 Step 8) — that re-export is for external consumers, not for `run-eval.ts`.

- [ ] **Step 4: Run the smoke test to verify it passes**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: PASS — marketplace both arms (messages 2, success true); software-org GCP `canariesReached 0` + `provenance > 0`, A2A `canariesReached > 0` + `provenance 0`.

- [ ] **Step 5: Write the gated full-run guard test**

Create `packages/eval/src/lib/run-eval.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runFullEval } from "./run-eval";

describe("runFullEval gating", () => {
    it("refuses to run without RUN_EVAL + key", async () => {
        const prev = process.env.RUN_EVAL;
        delete process.env.RUN_EVAL;
        await expect(runFullEval()).rejects.toThrow("RUN_EVAL");
        if (prev !== undefined) process.env.RUN_EVAL = prev;
    });
});
```

- [ ] **Step 6: Run it + typecheck**

Run: `pnpm nx test @graph-context-protocol/eval`
Expected: PASS (smoke + gating).
Run: `pnpm nx typecheck @graph-context-protocol/eval`
Expected: PASS.

- [ ] **Step 7: Export + commit**

In `packages/eval/src/index.ts` add:

```ts
export type { CollectOptions } from "./lib/run-eval";
export { collectResult, runFullEval } from "./lib/run-eval";
```

```bash
pnpm biome check --write packages/eval/src
git add packages/eval/src
git commit -m "feat(eval): hermetic CI smoke (both arms) + gated full-run entrypoint"
```

---

## Final Verification (after all tasks)

- [ ] Full suite: `pnpm nx run-many -t test`
  Expected: all 8 projects green (agent-core, baseline, scenario, eval, core, server, adapters, langgraph); eval smoke green hermetically (no key).
- [ ] Typecheck: `pnpm nx run-many -t typecheck -p @graph-context-protocol/agent-core @graph-context-protocol/baseline @graph-context-protocol/scenario @graph-context-protocol/eval @graph-context-protocol/core server @graph-context-protocol/langgraph`
  Expected: PASS.
- [ ] App builds unaffected: `pnpm nx run-many -t build -p researcher executor`
  Expected: PASS (agent-core change is additive).
- [ ] Confirm no key / results / artifacts staged: `git status` shows only intended source.

## Self-Review Notes (author)

- **Spec coverage:** §3.4 agent-core changes → Task 1; §3.1/3.2 runner+arm → Task 2; §4.1 structural → Task 3; §4.2 behavioral+provenance → Task 4; §4.3 canary → Task 5; §6 results emitter → Task 6; §5 mock → Task 7; §5/§8 CI smoke + §6 gated runs → Task 8. Acceptance §7: (1) tables → Task 6/8; (2) leakage → Task 5/8 smoke; (3) reproducible counts → structural exact (Task 3) + mock-exact (Task 8); (4) marketplace 2→50 curve → Task 8; (5) hermetic CI + gated full → Task 8; (6) fairness assertion → Task 2 runner builds both arms from one def+model.
- **Deliberate spec refinement (flag at review):** the structural O(N²)-vs-O(N) curve is computed by an explicit topology model `structuralMetrics(arm, n)` (n-participant federation: A2A `n*(n-1)`, GCP `n`), NOT derived from the single-agent `ScenarioDef.knowledgeNodes` (which would be O(n) in both arms). This realizes spec §4.1's intent ("ecosystem acquaintance graph, N×N integration") correctly; the behavioral `marketplaceScenario(n)` (1 buyer + n sellers) supplies the per-task behavioral anchors. The two are complementary, both shown in the marketplace table.
- **External-API caveats:** the mock chat model (Task 7) and the token-counting callback (Task 4) carry reconcile-against-installed-`@langchain/core` notes; the behavior each pins is in its test.
- **Type consistency:** `Arm`, `RunArtifacts`, `MetricsResult`, `StructuralMetrics`, `LeakageMetrics`, `TokenCounter`, `BehavioralSample` names are consistent across tasks; `provenanceCompleteness` lives in `provenance.ts` and is re-exported via the barrel (Task 4) — Task 8 imports it from `./provenance`.

## Execution Handoff

Two execution options — Subagent-Driven (recommended) or Inline.
