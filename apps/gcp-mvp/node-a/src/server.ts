import type { Request, Response } from "express";
import express from "express";
import { z } from "zod";
import {
    createAgentNode,
    createEdge,
    createKnowledgeNode,
    createRole,
    deserializeEdge,
    discoverAgents,
    discoverKnowledge,
    type Graph,
} from "@graph-context-protocol/core";
import { DescriptorSchema, GraphSnapshotSchema } from "./descriptor";
import { buildDescriptor, buildGraphSnapshot, createLocalGraph } from "./graph";

export interface GcpServer {
    app: express.Application;
    start(): Promise<void>;
    stop(): Promise<void>;
    getGraph(): Graph;
}

/**
 * Creates an Express server for a GCP MVP node.
 *
 * @param nodeId - Unique node identifier
 * @param port - HTTP port to listen on
 * @param peerUrl - Default peer discovery URL
 * @returns GCP server instance
 */
export function createGcpServer(
    nodeId: string,
    port: number,
    peerUrl: string,
): GcpServer {
    const app = express();
    app.use(express.json());

    let graph = createLocalGraph(nodeId);
    const name = `${nodeId} MVP Node`;

    app.get("/health", (_req: Request, res: Response) => {
        res.json({ status: "ok", nodeId, port });
    });

    app.get("/gcp/descriptor", (_req: Request, res: Response) => {
        const descriptor = buildDescriptor(nodeId, name, graph, peerUrl);
        res.json(descriptor);
    });

    app.get("/gcp/graph", (_req: Request, res: Response) => {
        const snapshot = buildGraphSnapshot(graph);
        res.json(snapshot);
    });

    app.post("/gcp/discover", async (req: Request, res: Response) => {
        const discoveryRequest = z
            .object({ peerUrl: z.string().optional() })
            .safeParse(req.body);
        const targetPeerUrl = discoveryRequest.success
            ? discoveryRequest.data.peerUrl || peerUrl
            : peerUrl;

        try {
            const descriptorRes = await fetch(
                `${targetPeerUrl}/gcp/descriptor`,
            );
            if (!descriptorRes.ok) {
                res.status(502).json({
                    error: `Failed to fetch peer descriptor: ${descriptorRes.status}`,
                });
                return;
            }
            const descriptor = DescriptorSchema.parse(
                await descriptorRes.json(),
            );

            const graphRes = await fetch(`${targetPeerUrl}/gcp/graph`);
            if (!graphRes.ok) {
                res.status(502).json({
                    error: `Failed to fetch peer graph: ${graphRes.status}`,
                });
                return;
            }
            const peerSnapshot = GraphSnapshotSchema.parse(
                await graphRes.json(),
            );

            const remoteRole = createRole(
                "role:remote",
                "Remote",
                "Imported remote node",
                [],
                [],
            );

            for (const peerNode of peerSnapshot.nodes) {
                if (graph.nodes.has(peerNode.id)) {
                    continue;
                }

                if (peerNode.kind === "agent") {
                    graph = graph.addNode(
                        createAgentNode(peerNode.id, remoteRole, {
                            ...peerNode.metadata,
                            importedFrom: targetPeerUrl,
                        }),
                    );
                } else if (peerNode.kind === "knowledge") {
                    graph = graph.addNode(
                        createKnowledgeNode(peerNode.id, remoteRole, {
                            ...peerNode.metadata,
                            importedFrom: targetPeerUrl,
                        }),
                    );
                }
            }

            for (const peerEdge of peerSnapshot.edges) {
                if (graph.edges.has(peerEdge.id)) {
                    continue;
                }
                const edge = deserializeEdge(peerEdge);
                graph = graph.addEdge(edge);
            }

            const localAgentId = `agent:${nodeId}`;
            const edgeId = `edge:${nodeId}-to-${descriptor.nodeId}`;
            if (!graph.edges.has(edgeId)) {
                graph = graph.addEdge(
                    createEdge(
                        edgeId,
                        localAgentId,
                        descriptor.agentNodeId,
                        "can-traverse",
                        { importedFrom: targetPeerUrl },
                    ),
                );
            }

            const agents = discoverAgents(graph, localAgentId);
            const knowledge = discoverKnowledge(graph, localAgentId);

            res.json({
                success: true,
                peerUrl: targetPeerUrl,
                importedNodes: peerSnapshot.nodes.length,
                importedEdges: peerSnapshot.edges.length,
                discoveredAgents: agents.nodes.map((node) => ({
                    id: node.node.id,
                    distance: node.distance,
                    path: node.path,
                })),
                discoveredKnowledge: knowledge.nodes.map((node) => ({
                    id: node.node.id,
                    distance: node.distance,
                    path: node.path,
                })),
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            res.status(502).json({
                error: "Failed to fetch GCP peer descriptor",
                peerUrl: targetPeerUrl,
                details: message,
            });
        }
    });

    app.get("/gcp/discovery", (_req: Request, res: Response) => {
        try {
            const agentId = `agent:${nodeId}`;
            const agents = discoverAgents(graph, agentId);
            const knowledge = discoverKnowledge(graph, agentId);

            res.json({
                agents: agents.nodes.map((n) => ({
                    id: n.node.id,
                    distance: n.distance,
                    path: n.path,
                })),
                knowledge: knowledge.nodes.map((n) => ({
                    id: n.node.id,
                    distance: n.distance,
                    path: n.path,
                })),
                denied: Array.from(
                    new Set([...agents.denied, ...knowledge.denied]),
                ),
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: message });
        }
    });

    app.get("/gcp/agents", (_req: Request, res: Response) => {
        try {
            const agentId = `agent:${nodeId}`;
            const result = discoverAgents(graph, agentId);

            res.json({
                nodes: result.nodes.map((n) => ({
                    id: n.node.id,
                    distance: n.distance,
                    path: n.path,
                })),
                denied: result.denied,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: message });
        }
    });

    app.get("/gcp/knowledge", (_req: Request, res: Response) => {
        try {
            const agentId = `agent:${nodeId}`;
            const result = discoverKnowledge(graph, agentId);

            res.json({
                nodes: result.nodes.map((n) => ({
                    id: n.node.id,
                    distance: n.distance,
                    path: n.path,
                })),
                denied: result.denied,
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: message });
        }
    });

    let httpServer: ReturnType<typeof app.listen> | undefined;

    return {
        app,
        getGraph() {
            return graph;
        },
        async start() {
            await new Promise<void>((resolve) => {
                httpServer = app.listen(port, () => {
                    console.log(`${name} listening on port ${port}`);
                    resolve();
                });
            });
        },
        async stop() {
            await new Promise<void>((resolve, reject) => {
                if (!httpServer) {
                    resolve();
                    return;
                }
                httpServer.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        },
    };
}
