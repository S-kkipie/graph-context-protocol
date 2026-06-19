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
        it(`${scenario.id}: both arms complete the task and emit metrics`, async () => {
            const gcp = await runGcpArm(scenario, llm);
            const a2a = await runA2aArm(scenario, llm);

            expect(scenario.succeeded(gcp.answer)).toBe(true);
            expect(scenario.succeeded(a2a.answer)).toBe(true);

            expect(gcp.metrics.peersKnown).toBe(scenario.agent.peers.length);
            expect(a2a.metrics.peersKnown).toBe(scenario.agent.peers.length);
            expect(gcp.metrics.messagesSent).toBeGreaterThan(0);
            expect(a2a.metrics.messagesSent).toBeGreaterThan(0);
        }, 120_000);
    }
});
