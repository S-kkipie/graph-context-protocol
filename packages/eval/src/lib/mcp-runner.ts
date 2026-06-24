/**
 * MCP-interop arm runner (M4a). Runs the SAME mcp-interop scenario through the
 * shared agent-core brain over the MCP read substrate, for arm ∈ {gcp-mcp,
 * raw-mcp}. gcp-mcp wires each MCP client to a createGcpMcpServer that routes
 * reads through the GCP gate (denies the under-privileged agent); raw-mcp wires
 * to an ungated createRawMcpServer (leaks). Hermetic: in-memory MCP transports,
 * mock model, no network, no key. Kept separate from the gcp-vs-a2a runner —
 * MCP interop is a distinct claim.
 *
 * @module mcp-runner
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    createCouplingMetrics,
    createTaskAgent,
    type PeerRef,
    runTaskAgent,
    type ScenarioDef,
} from "@graph-context-protocol/agent-core";
import { createRole } from "@graph-context-protocol/core";
import {
    createGcpMcpServer,
    createMcpPeerContextToolFactory,
    createRawMcpServer,
    type McpClientLike,
} from "@graph-context-protocol/mcp-bridge";
import { createGcpNode } from "@graph-context-protocol/scenario";
import {
    createStaticTokenAuthProvider,
    type Principal,
} from "@graph-context-protocol/server";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { measureGcpDiscovery } from "./discovery";
import { type RunArtifacts, recordingFactory } from "./runner";
import { measureToolBudget } from "./tool-budget";

export type McpArm = "gcp-mcp" | "raw-mcp";

const TOKEN = "tok:agent";

/** Converts a nodeId (may contain colons) to a valid URI-safe slug. */
function nodeUri(nodeId: string): string {
    return `gcp://${nodeId.replace(/:/g, "--")}`;
}

/** Connects an in-memory MCP Client to an McpServer and returns the client. */
async function linkClient(mcpServer: McpServer): Promise<Client> {
    const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);
    const client = new Client({ name: "eval-mcp", version: "0.0.1" });
    await client.connect(clientTransport);
    return client;
}

interface NodeWiring {
    readonly clients: Client[];
    readonly servers: McpServer[];
    readonly clientByNode: Map<string, McpClientLike>;
    cleanup(): Promise<void>;
}

async function wireGcpMcp(
    scenario: ScenarioDef,
): Promise<NodeWiring & { dir: string }> {
    const dir = mkdtempSync(join(tmpdir(), "eval-mcp-gcp-"));
    const principal: Principal = {
        id: `principal:${scenario.agent.nodeId}`,
        role: createRole(scenario.agent.role, scenario.agent.role, ""),
        capabilities: [],
        metadata: {},
    };
    const authProvider = createStaticTokenAuthProvider(
        new Map([[TOKEN, principal]]),
    );
    const clients: Client[] = [];
    const servers: McpServer[] = [];
    const clientByNode = new Map<string, McpClientLike>();
    for (const node of scenario.knowledgeNodes) {
        const filePath = join(dir, `${node.nodeId.replace(/:/g, "_")}.md`);
        writeFileSync(filePath, node.content, "utf8");
        const gcpServer = await createGcpNode(
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
        const expose = createGcpMcpServer({
            server: gcpServer,
            resources: [
                {
                    nodeId: node.nodeId,
                    uri: nodeUri(node.nodeId),
                    name: node.nodeId,
                },
            ],
            credentials: { type: "token", value: TOKEN },
        });
        const client = await linkClient(expose);
        servers.push(expose);
        clients.push(client);
        clientByNode.set(node.nodeId, client as unknown as McpClientLike);
    }
    return {
        dir,
        clients,
        servers,
        clientByNode,
        async cleanup() {
            await Promise.all(clients.map((c) => c.close()));
            await Promise.all(servers.map((s) => s.close()));
            rmSync(dir, { recursive: true, force: true });
        },
    };
}

async function wireRawMcp(scenario: ScenarioDef): Promise<NodeWiring> {
    const clients: Client[] = [];
    const servers: McpServer[] = [];
    const clientByNode = new Map<string, McpClientLike>();
    for (const node of scenario.knowledgeNodes) {
        const raw = createRawMcpServer({
            resources: [
                {
                    uri: nodeUri(node.nodeId),
                    name: node.nodeId,
                    text: node.content,
                },
            ],
        });
        const client = await linkClient(raw);
        servers.push(raw);
        clients.push(client);
        clientByNode.set(node.nodeId, client as unknown as McpClientLike);
    }
    return {
        clients,
        servers,
        clientByNode,
        async cleanup() {
            await Promise.all(clients.map((c) => c.close()));
            await Promise.all(servers.map((s) => s.close()));
        },
    };
}

/** Runs an mcp-interop scenario under the chosen MCP arm; returns artifacts. */
export async function runMcpScenario(opts: {
    arm: McpArm;
    scenario: ScenarioDef;
    model?: BaseChatModel;
}): Promise<RunArtifacts> {
    const { scenario } = opts;
    const wiring =
        opts.arm === "gcp-mcp"
            ? await wireGcpMcp(scenario)
            : await wireRawMcp(scenario);
    try {
        const peers: PeerRef[] = scenario.agent.peers.map((nodeId) => ({
            peerId: nodeId,
            targetNodeId: nodeId,
            endpoint: nodeUri(nodeId),
        }));
        const metrics = createCouplingMetrics();
        const transcript: { peerId: string; output: string }[] = [];
        const baseFactory = createMcpPeerContextToolFactory({
            connect: async (peer) => {
                const client = wiring.clientByNode.get(peer.targetNodeId);
                if (!client)
                    throw new Error(`no MCP client for ${peer.targetNodeId}`);
                return client;
            },
        });
        const agent = createTaskAgent({
            model: opts.model,
            llm: {},
            systemPrompt: scenario.agent.systemPrompt,
            peers,
            toolFactory: recordingFactory(baseFactory, transcript),
            metrics,
        });
        const answer = await runTaskAgent(agent, scenario.agent.goal);
        // The MCP bridge carries GCP's register-once-then-discover semantics, so
        // discovery is one substrate query (O(1)) like the native GCP arm.
        const discovery = measureGcpDiscovery(
            scenario.agent.peers.map((nodeId) => ({
                peerId: nodeId,
                knowledgeNodeId: nodeId,
                url: nodeUri(nodeId),
            })),
        );
        return {
            answer,
            coupling: metrics.snapshot(),
            toolTranscript: transcript,
            auditEvents: [],
            discovery,
            toolBudget: measureToolBudget("gcp", peers),
        };
    } finally {
        await wiring.cleanup();
    }
}
