import http from "node:http";
import { describe, expect, it } from "vitest";
import { buildDescriptor, buildGraphSnapshot, createLocalGraph } from "./graph";
import { createGcpServer } from "./server";

function request(
    options: http.RequestOptions,
    body?: unknown,
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
        expect(snapshot.nodes.length).toBe(2);
        expect(snapshot.edges.length).toBe(1);
    });
});

describe("Express Server", () => {
    it("GET /health returns ok", async () => {
        const server = createGcpServer("node-b", 5201, "http://localhost:5202");
        await server.start();

        const res = await request({
            hostname: "localhost",
            port: 5201,
            path: "/health",
            method: "GET",
        });

        expect(res.status).toBe(200);
        expect(res.body).toEqual(
            expect.objectContaining({ status: "ok", nodeId: "node-b" }),
        );

        await server.stop();
    });

    it("GET /gcp/descriptor returns valid descriptor", async () => {
        const server = createGcpServer("node-b", 5203, "http://localhost:5204");
        await server.start();

        const res = await request({
            hostname: "localhost",
            port: 5203,
            path: "/gcp/descriptor",
            method: "GET",
        });

        expect(res.status).toBe(200);
        expect(res.body).toEqual(
            expect.objectContaining({
                nodeId: "node-b",
                agentNodeId: "agent:node-b",
            }),
        );

        await server.stop();
    });

    it("GET /gcp/graph returns snapshot", async () => {
        const server = createGcpServer("node-b", 5205, "http://localhost:5206");
        await server.start();

        const res = await request({
            hostname: "localhost",
            port: 5205,
            path: "/gcp/graph",
            method: "GET",
        });

        expect(res.status).toBe(200);
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty("id", "graph:node-b");
        expect(body).toHaveProperty("nodes");
        expect(Array.isArray(body.nodes)).toBe(true);
        expect(body).toHaveProperty("edges");
        expect(Array.isArray(body.edges)).toBe(true);

        await server.stop();
    });

    it("POST /gcp/discover imports peer and enables agent discovery", async () => {
        const serverB = createGcpServer(
            "node-b",
            5211,
            "http://localhost:5212",
        );
        const serverA = createGcpServer(
            "node-a",
            5212,
            "http://localhost:5211",
        );
        await serverB.start();
        await serverA.start();

        const discoverRes = await request(
            {
                hostname: "localhost",
                port: 5211,
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
            port: 5211,
            path: "/gcp/agents",
            method: "GET",
        });

        expect(agentsRes.status).toBe(200);
        const agentsBody = agentsRes.body as {
            nodes: Array<{ id: string }>;
        };
        expect(agentsBody.nodes.some((n) => n.id === "agent:node-a")).toBe(
            true,
        );

        await serverB.stop();
        await serverA.stop();
    });

    it("POST /gcp/discover with custom peerUrl overrides default", async () => {
        const serverB = createGcpServer(
            "node-b",
            5221,
            "http://localhost:9999",
        );
        const serverA = createGcpServer(
            "node-a",
            5222,
            "http://localhost:9999",
        );
        await serverB.start();
        await serverA.start();

        const discoverRes = await request(
            {
                hostname: "localhost",
                port: 5221,
                path: "/gcp/discover",
                method: "POST",
            },
            { peerUrl: "http://localhost:5222" },
        );

        expect(discoverRes.status).toBe(200);
        const discoverBody = discoverRes.body as Record<string, unknown>;
        expect(discoverBody).toHaveProperty("success", true);

        await serverB.stop();
        await serverA.stop();
    });

    it("GET /gcp/discovery returns agents and knowledge", async () => {
        const server = createGcpServer("node-b", 5231, "http://localhost:5232");
        await server.start();

        const res = await request({
            hostname: "localhost",
            port: 5231,
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
        const server = createGcpServer("node-b", 5241, "http://localhost:5242");
        await server.start();

        const res = await request({
            hostname: "localhost",
            port: 5241,
            path: "/gcp/knowledge",
            method: "GET",
        });

        expect(res.status).toBe(200);
        const body = res.body as { nodes: Array<{ id: string }> };
        expect(body.nodes.some((n) => n.id === "knowledge:node-b-specs")).toBe(
            true,
        );

        await server.stop();
    });
});
