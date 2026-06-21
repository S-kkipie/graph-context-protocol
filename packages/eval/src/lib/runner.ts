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
import type { ReadProvenance } from "@graph-context-protocol/core";
import { createRole } from "@graph-context-protocol/core";
import {
    createGcpDelegationToolFactory,
    createGcpNode,
    createGcpPeerContextToolFactory,
} from "@graph-context-protocol/scenario";
import {
    type AuditSink,
    createFetchHandler,
    createInMemoryAuditSink,
    createStaticTokenAuthProvider,
    delegateRemoteTask,
    type Principal,
    queryRemoteContext,
} from "@graph-context-protocol/server";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

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
    readonly llm?: { apiKey?: string; model?: string };
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
            const text =
                typeof output === "string"
                    ? output
                    : output != null &&
                        typeof output === "object" &&
                        "content" in output
                      ? String((output as { content: unknown }).content)
                      : String(output);
            transcript.push({ peerId: peer.peerId, output: text });
            return output;
        }) as typeof tool.invoke;
        return tool;
    };
}

async function runGcp(opts: RunOptions): Promise<RunArtifacts> {
    const { scenario } = opts;
    const delegateMode = scenario.mode === "delegate";
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
                    {
                        authProvider,
                        auditSink,
                        // In delegate mode the node accepts delegations; an
                        // authorized delegation runs this executor (returns the
                        // node's work product). Under the eval principal this is
                        // never reached — the gate denies the missing capability.
                        ...(delegateMode
                            ? {
                                  delegationExecutor: async () => node.content,
                              }
                            : {}),
                    },
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
        const baseFactory = delegateMode
            ? createGcpDelegationToolFactory({
                  delegateFn: (o) => delegateRemoteTask({ ...o, fetchImpl }),
              })
            : createGcpPeerContextToolFactory({
                  queryFn: (o) => queryRemoteContext({ ...o, fetchImpl }),
              });
        const agent = createTaskAgent({
            model: opts.model,
            llm: opts.llm ?? {},
            systemPrompt: scenario.agent.systemPrompt,
            peers,
            toolFactory: recordingFactory(baseFactory, transcript),
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
