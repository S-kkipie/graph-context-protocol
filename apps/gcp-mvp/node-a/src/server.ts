import type { Request, Response } from "express";
import express from "express";
import { z } from "zod";
import {
    createAgentNode,
    createEdge,
    createKnowledgeNode,
    createRole,
    createContextQuery,
    createContextQueryResult,
    createRequesterDescriptor,
    ContextPeerDescriptorSchema,
    ContextQueryRequestSchema,
    parseAccessPolicyFromMetadata,
    SystemCapabilities,
    deserializeEdge,
    discoverAgents,
    discoverKnowledge,
    type Graph,
} from "@graph-context-protocol/core";
import { DescriptorSchema, GraphSnapshotSchema } from "./descriptor";
import {
    buildContextPeerDescriptor,
    buildDescriptor,
    buildGraphSnapshot,
    createLocalGraph,
} from "./graph";

const PrincipalRoleSchema = z.enum(["ceo", "developer", "external"]);

function readBearerToken(req: Request): string | undefined {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) return undefined;
    return header.slice("Bearer ".length);
}

function resolvePrincipal(token: string | undefined) {
    const parsed = PrincipalRoleSchema.safeParse(token?.replace("token:", ""));
    if (!parsed.success) return undefined;
    const roleId = `role:${parsed.data === "external" ? "external-agent" : parsed.data}`;
    const capabilities: readonly string[] =
        parsed.data === "external"
            ? []
            : [SystemCapabilities.QUERY_REMOTE_CONTEXT];
    return {
        principalId: `principal:${parsed.data}`,
        roleId,
        capabilities,
    };
}

function queryEvents(nodeId: string, query: unknown) {
    return {
        answer: `${nodeId} recorded 2 events today`,
        query,
        events: [
            { id: `event:${nodeId}:standup`, summary: "Shared project status" },
            {
                id: `event:${nodeId}:implementation`,
                summary: "Updated context query flow",
            },
        ],
    };
}

function resolveAllowedPeerUrl(
    candidate: string | undefined,
    configured: string,
): string | undefined {
    return candidate === undefined || candidate === configured
        ? configured
        : undefined;
}

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

    app.get("/gcp/context/descriptor", (_req: Request, res: Response) => {
        res.json(
            buildContextPeerDescriptor(
                nodeId,
                name,
                graph,
                `http://localhost:${port}`,
            ),
        );
    });

    app.post("/gcp/context/query", (req: Request, res: Response) => {
        const parsed = ContextQueryRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json(
                createContextQueryResult(
                    "invalid",
                    "invalid-query",
                    `agent:${nodeId}`,
                    {},
                    undefined,
                    parsed.error.message,
                ),
            );
            return;
        }
        const query = parsed.data;
        const principal = resolvePrincipal(readBearerToken(req));
        if (!principal) {
            res.status(401).json(
                createContextQueryResult(
                    query.queryId,
                    "denied",
                    query.targetNodeId,
                    {},
                    undefined,
                    "Invalid credentials",
                ),
            );
            return;
        }
        const target = graph.nodes.get(query.targetNodeId);
        if (!target || target.kind !== "knowledge") {
            res.status(404).json(
                createContextQueryResult(
                    query.queryId,
                    "not-found",
                    query.targetNodeId,
                ),
            );
            return;
        }
        const policy = parseAccessPolicyFromMetadata(target.metadata);
        const roleAllowed =
            policy.success &&
            policy.data.readableByRoles.includes(principal.roleId);
        const capsAllowed =
            policy.success &&
            policy.data.requiredCapabilities.every((cap) =>
                principal.capabilities.includes(cap),
            );
        if (!policy.success || !roleAllowed || !capsAllowed) {
            res.status(403).json(
                createContextQueryResult(
                    query.queryId,
                    "denied",
                    query.targetNodeId,
                    {
                        fallbackAllowed: policy.success
                            ? policy.data.fallbackAllowed
                            : false,
                    },
                    undefined,
                    "Access denied",
                ),
            );
            return;
        }
        res.json(
            createContextQueryResult(
                query.queryId,
                "ok",
                query.targetNodeId,
                {
                    sourceOfTruth: {
                        ownerId: `agent:${nodeId}`,
                        sourceNodeId: query.targetNodeId,
                    },
                },
                queryEvents(nodeId, query.query),
                undefined,
                {
                    ownerId: `agent:${nodeId}`,
                    sourceNodeId: query.targetNodeId,
                },
            ),
        );
    });

    app.post("/gcp/context/query-peer", async (req: Request, res: Response) => {
        const body = z
            .object({
                peerUrl: z.string().optional(),
                authToken: z.string(),
                question: z.string().default("what did node B do today?"),
            })
            .safeParse(req.body);
        if (!body.success) {
            res.status(400).json({ error: body.error.message });
            return;
        }
        const targetPeerUrl = resolveAllowedPeerUrl(body.data.peerUrl, peerUrl);
        if (targetPeerUrl === undefined) {
            res.status(400).json({ error: "Peer URL is not allowed" });
            return;
        }

        try {
            const descriptorRes = await fetch(
                `${targetPeerUrl}/gcp/context/descriptor`,
            );
            const descriptor = ContextPeerDescriptorSchema.parse(
                await descriptorRes.json(),
            );
            const events = descriptor.exposedKnowledge.find(
                (item) => item.knowledgeType === "events" && item.queryable,
            );
            if (!events) {
                res.status(404).json({
                    error: "No queryable events knowledge exposed",
                });
                return;
            }
            const roleName = body.data.authToken.replace("token:", "");
            const query = createContextQuery(
                `query:${nodeId}-to-${descriptor.peerId}`,
                createRequesterDescriptor(
                    `principal:${roleName}`,
                    [`role:${roleName}`],
                    [SystemCapabilities.QUERY_REMOTE_CONTEXT],
                ),
                events.nodeId,
                "text",
                body.data.question,
            );
            const queryRes = await fetch(
                `${targetPeerUrl}${descriptor.queryEndpoint ?? "/gcp/context/query"}`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        authorization: `Bearer ${body.data.authToken}`,
                    },
                    body: JSON.stringify(query),
                },
            );
            res.status(queryRes.status).json(await queryRes.json());
        } catch (err) {
            res.status(502).json({
                error: "Peer context query failed",
            });
        }
    });

    app.post("/gcp/discover", async (req: Request, res: Response) => {
        const discoveryRequest = z
            .object({ peerUrl: z.string().optional() })
            .safeParse(req.body);
        const targetPeerUrl = resolveAllowedPeerUrl(
            discoveryRequest.success
                ? discoveryRequest.data.peerUrl
                : undefined,
            peerUrl,
        );

        if (targetPeerUrl === undefined) {
            res.status(400).json({ error: "Peer URL is not allowed" });
            return;
        }

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
            res.status(502).json({
                error: "Failed to fetch GCP peer descriptor",
                peerUrl: targetPeerUrl,
                details: "Peer discovery failed",
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
