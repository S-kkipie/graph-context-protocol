import http from "node:http";
import { describe, expect, it } from "vitest";
import { buildDescriptor, buildGraphSnapshot, createLocalGraph } from "./graph";
import { createGcpServer } from "./server";

function request(
    options: http.RequestOptions,
    body?: unknown,
    headers?: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                try {
                    resolve({
                        status: res.statusCode || 0,
                        body: JSON.parse(data),
                    });
                } catch {
                    resolve({ status: res.statusCode || 0, body: data });
                }
            });
        });
        req.on("error", reject);
        for (const [key, value] of Object.entries(headers ?? {})) {
            req.setHeader(key, value);
        }
        if (body) {
            req.setHeader("Content-Type", "application/json");
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

describe("Graph and Descriptor", () => {
    it("creates local graph with agent and knowledge nodes", () => {
        const graph = createLocalGraph("test-node");
        expect(graph.nodes.has("agent:test-node")).toBe(true);
        expect(graph.nodes.has("knowledge:test-node-specs")).toBe(true);
        expect(graph.nodes.has("knowledge:test-node-events")).toBe(true);
    });

    it("builds descriptor DTO", () => {
        const graph = createLocalGraph("test-node");
        const descriptor = buildDescriptor(
            "test-node",
            "Test",
            graph,
            "http://localhost:9999",
        );
        expect(descriptor.nodeId).toBe("test-node");
        expect(descriptor.agentNodeId).toBe("agent:test-node");
        expect(descriptor.knowledgeNodeIds).toContain(
            "knowledge:test-node-specs",
        );
        expect(descriptor.endpoints.length).toBeGreaterThan(0);
        expect(descriptor.peerUrl).toBe("http://localhost:9999");
    });

    it("builds graph snapshot DTO", () => {
        const graph = createLocalGraph("test-node");
        const snapshot = buildGraphSnapshot(graph);
        expect(snapshot.id).toBe("graph:test-node");
        expect(snapshot.nodes.length).toBe(3);
        expect(snapshot.edges.length).toBe(2);
    });
});

describe("Express Server", () => {
    it("GET /health returns ok", async () => {
        const server = createGcpServer("node-a", 5101, "http://localhost:5102");
        await server.start();

        const res = await request({
            hostname: "localhost",
            port: 5101,
            path: "/health",
            method: "GET",
        });

        expect(res.status).toBe(200);
        expect(res.body).toEqual(
            expect.objectContaining({ status: "ok", nodeId: "node-a" }),
        );

        await server.stop();
    });

    it("GET /gcp/descriptor returns valid descriptor", async () => {
        const server = createGcpServer("node-a", 5103, "http://localhost:5104");
        await server.start();

        const res = await request({
            hostname: "localhost",
            port: 5103,
            path: "/gcp/descriptor",
            method: "GET",
        });

        expect(res.status).toBe(200);
        expect(res.body).toEqual(
            expect.objectContaining({
                nodeId: "node-a",
                agentNodeId: "agent:node-a",
            }),
        );

        await server.stop();
    });

    it("GET /gcp/graph returns snapshot", async () => {
        const server = createGcpServer("node-a", 5105, "http://localhost:5106");
        await server.start();

        const res = await request({
            hostname: "localhost",
            port: 5105,
            path: "/gcp/graph",
            method: "GET",
        });

        expect(res.status).toBe(200);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty("id", "graph:node-a");
        expect(body).toHaveProperty("nodes");
        expect(Array.isArray(body.nodes)).toBe(true);
        expect(body).toHaveProperty("edges");
        expect(Array.isArray(body.edges)).toBe(true);

        await server.stop();
    });

    it("POST /gcp/discover imports peer and enables agent discovery", async () => {
        const serverA = createGcpServer(
            "node-a",
            5111,
            "http://localhost:5112",
        );
        const serverB = createGcpServer(
            "node-b",
            5112,
            "http://localhost:5111",
        );
        await serverA.start();
        await serverB.start();

        const discoverRes = await request(
            {
                hostname: "localhost",
                port: 5111,
                path: "/gcp/discover",
                method: "POST",
            },
            {},
        );

        expect(discoverRes.status).toBe(200);
        const discoverBody = discoverRes.body as Record<string, unknown>;
        expect(discoverBody).toHaveProperty("success", true);

        const agentsRes = await request({
            hostname: "localhost",
            port: 5111,
            path: "/gcp/agents",
            method: "GET",
        });

        expect(agentsRes.status).toBe(200);
        const agentsBody = agentsRes.body as {
            nodes: Array<{ id: string }>;
        };
        expect(agentsBody.nodes.some((n) => n.id === "agent:node-b")).toBe(
            true,
        );

        await serverA.stop();
        await serverB.stop();
    });

    it("POST /gcp/discover rejects peerUrl outside configured peer", async () => {
        const serverA = createGcpServer(
            "node-a",
            5121,
            "http://localhost:9999",
        );
        await serverA.start();

        const discoverRes = await request(
            {
                hostname: "localhost",
                port: 5121,
                path: "/gcp/discover",
                method: "POST",
            },
            { peerUrl: "http://localhost:5122" },
        );

        expect(discoverRes.status).toBe(400);
        const discoverBody = discoverRes.body as Record<string, unknown>;
        expect(discoverBody).toHaveProperty("error", "Peer URL is not allowed");

        await serverA.stop();
    });

    it("GET /gcp/discovery returns agents and knowledge", async () => {
        const server = createGcpServer("node-a", 5131, "http://localhost:5132");
        await server.start();

        const res = await request({
            hostname: "localhost",
            port: 5131,
            path: "/gcp/discovery",
            method: "GET",
        });

        expect(res.status).toBe(200);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty("agents");
        expect(body).toHaveProperty("knowledge");

        await server.stop();
    });

    it("GET /gcp/knowledge returns knowledge nodes", async () => {
        const server = createGcpServer("node-a", 5141, "http://localhost:5142");
        await server.start();

        const res = await request({
            hostname: "localhost",
            port: 5141,
            path: "/gcp/knowledge",
            method: "GET",
        });

        expect(res.status).toBe(200);
        const body = res.body as { nodes: Array<{ id: string }> };
        expect(body.nodes.some((n) => n.id === "knowledge:node-a-specs")).toBe(
            true,
        );

        await server.stop();
    });

    it("GET /gcp/context/descriptor exposes queryable events without content", async () => {
        const server = createGcpServer("node-a", 5151, "http://localhost:5152");
        await server.start();

        const res = await request({
            hostname: "localhost",
            port: 5151,
            path: "/gcp/context/descriptor",
            method: "GET",
        });

        expect(res.status).toBe(200);
        const body = res.body as {
            exposedKnowledge: Array<{
                nodeId: string;
                knowledgeType: string;
                queryable: boolean;
                metadata: Record<string, unknown>;
            }>;
        };
        const events = body.exposedKnowledge.find(
            (item) => item.nodeId === "knowledge:node-a-events",
        );
        expect(events?.knowledgeType).toBe("events");
        expect(events?.queryable).toBe(true);
        expect(events?.metadata.content).toBeUndefined();

        await server.stop();
    });

    it("POST /gcp/context/query allows developer and denies external", async () => {
        const server = createGcpServer("node-a", 5153, "http://localhost:5154");
        await server.start();
        const query = {
            contractVersion: "gcp-context-contract/v1",
            queryId: "query:test",
            requester: {
                principalId: "principal:developer",
                roles: ["role:developer"],
                capabilities: ["cap:query-remote-context"],
                metadata: {},
            },
            targetNodeId: "knowledge:node-a-events",
            mode: "text",
            query: "what happened today?",
            metadata: {},
        };

        const allowed = await request(
            {
                hostname: "localhost",
                port: 5153,
                path: "/gcp/context/query",
                method: "POST",
            },
            query,
            { authorization: "Bearer token:developer" },
        );
        expect(allowed.status).toBe(200);
        expect((allowed.body as { status: string }).status).toBe("ok");

        const denied = await request(
            {
                hostname: "localhost",
                port: 5153,
                path: "/gcp/context/query",
                method: "POST",
            },
            { ...query, queryId: "query:denied" },
            { authorization: "Bearer token:external" },
        );
        expect(denied.status).toBe(403);
        expect((denied.body as { status: string }).status).toBe("denied");

        await server.stop();
    });

    it("POST /gcp/context/query-peer queries peer events without importing graph", async () => {
        const serverA = createGcpServer(
            "node-a",
            5155,
            "http://localhost:5156",
        );
        const serverB = createGcpServer(
            "node-b",
            5156,
            "http://localhost:5155",
        );
        await serverA.start();
        await serverB.start();

        const res = await request(
            {
                hostname: "localhost",
                port: 5155,
                path: "/gcp/context/query-peer",
                method: "POST",
            },
            {
                peerUrl: "http://localhost:5156",
                authToken: "token:developer",
                question: "what did node B do today?",
            },
        );

        expect(res.status).toBe(200);
        const body = res.body as {
            status: string;
            sourceNodeId: string;
            result: { answer: string };
        };
        expect(body.status).toBe("ok");
        expect(body.sourceNodeId).toBe("knowledge:node-b-events");
        expect(body.result.answer).toContain("node-b recorded 2 events today");

        await serverA.stop();
        await serverB.stop();
    });

    it("POST /gcp/context/query-peer rejects peerUrl outside configured peer", async () => {
        const server = createGcpServer("node-a", 5157, "http://localhost:5158");
        await server.start();

        const res = await request(
            {
                hostname: "localhost",
                port: 5157,
                path: "/gcp/context/query-peer",
                method: "POST",
            },
            {
                peerUrl: "http://localhost:9999",
                authToken: "token:developer",
                question: "what did node B do today?",
            },
        );

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Peer URL is not allowed" });

        await server.stop();
    });
});
