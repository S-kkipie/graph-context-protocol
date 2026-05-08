import type { ProtocolMessage } from "@graph-context-protocol/core";
import {
    createContext,
    createMessageHeader,
    createProtocolMessage,
    createRole,
} from "@graph-context-protocol/core";
import {
    createAllowAllAuthProvider,
    createConnectionManager,
    createExternalAgentRegistry,
    createGraphContextServer,
    createHandlerRegistry,
    createKnowledgeSourceRegistry,
    createLifecycleManager,
    createMemoryCacheStore,
    createMemoryTransport,
    createMessageRouter,
    createSyncScheduler,
    createTransportRegistry,
} from "@graph-context-protocol/server";
import type { Request, Response } from "express";
import express from "express";
import { run } from "./app";
import { createDemoGraph } from "./demo/graph";
import { createExpressTransport } from "./express/transport";

export interface ExpressServer {
    app: express.Application;
    start(): Promise<void>;
    stop(): Promise<void>;
}

export function createExpressServer(port = 3456): ExpressServer {
    const app = express();
    app.use(express.json());

    const memoryTransport = createMemoryTransport("transport:memory");
    const expressTransport = createExpressTransport({
        id: "transport:express",
        port,
        path: "/messages",
    });

    let transports = createTransportRegistry();
    let transportResult = transports.register(memoryTransport);
    if (transportResult.success) transports = transportResult.data;

    transportResult = transports.register(expressTransport);
    if (transportResult.success) transports = transportResult.data;

    let externalAgents = createExternalAgentRegistry();
    const agentResult = externalAgents.register({
        id: "agent:external",
        nodeId: "node:external",
        capabilities: ["cap:read-context"],
        transportId: "transport:express",
        endpoint: `http://localhost:${port}/messages`,
        status: "registered",
        metadata: {},
    });
    if (agentResult.success) externalAgents = agentResult.data;

    let knowledgeSources = createKnowledgeSourceRegistry();
    const sourceResult = knowledgeSources.register({
        id: "knowledge:demo",
        capabilities: ["lookup"],
        async query() {
            return {
                success: true as const,
                data: {
                    sourceId: "knowledge:demo",
                    nodes: [],
                    metadata: { queried: true },
                },
            };
        },
    });
    if (sourceResult.success) knowledgeSources = sourceResult.data;

    const server = createGraphContextServer(
        {
            id: "server:demo",
            localNodeId: "agent:server",
            shutdownTimeoutMs: 5000,
        },
        {
            lifecycle: createLifecycleManager(),
            transports,
            connections: createConnectionManager(),
            auth: createAllowAllAuthProvider(),
            router: createMessageRouter(),
            handlers: createHandlerRegistry(),
            externalAgents,
            knowledgeSources,
            cache: createMemoryCacheStore(),
            sync: createSyncScheduler(),
            graph: createDemoGraph(),
        },
    );

    app.get("/status", (_req: Request, res: Response) => {
        res.json(server.snapshot());
    });

    app.post("/start", async (_req: Request, res: Response) => {
        const result = await server.start();
        res.json(result);
    });

    app.post("/stop", async (_req: Request, res: Response) => {
        const result = await server.stop();
        res.json(result);
    });

    app.post("/messages", async (req: Request, res: Response) => {
        const envelope = {
            transportId: "transport:express",
            payload: req.body as ProtocolMessage,
            receivedAt: new Date().toISOString(),
            metadata: {},
        };
        const result = await server.receive(envelope);
        res.json(result);
    });

    app.post("/send", async (req: Request, res: Response) => {
        const message = req.body as ProtocolMessage;
        const result = await server.send(message);
        res.json(result);
    });

    app.get("/report", async (_req: Request, res: Response) => {
        const report = await run();
        res.type("text/plain").send(report);
    });

    app.post("/scenario", async (_req: Request, res: Response) => {
        const localRole = createRole("role:server", "Server Agent", "", [], []);

        const contextRequest: ProtocolMessage = createProtocolMessage(
            createMessageHeader(
                "msg:1",
                "agent:server",
                "agent:server",
                "context-request",
            ),
            createContext("ctx:1", "graph:demo", "agent:server", localRole, {}),
            { action: "query" },
        );

        const notification: ProtocolMessage = createProtocolMessage(
            createMessageHeader(
                "msg:2",
                "agent:server",
                "node:external",
                "notification",
            ),
            createContext("ctx:2", "graph:demo", "agent:server", localRole, {}),
            { event: "demo" },
        );

        const startResult = await server.start();
        const receiveResult = await server.receive({
            transportId: "transport:express",
            payload: contextRequest,
            receivedAt: new Date().toISOString(),
            metadata: {},
        });
        const sendResult = await server.send(notification);
        const stopResult = await server.stop();

        res.json({
            start: startResult,
            receive: receiveResult,
            send: sendResult,
            stop: stopResult,
        });
    });

    let httpServer: ReturnType<typeof app.listen> | undefined;

    return {
        app,

        async start() {
            await new Promise<void>((resolve) => {
                httpServer = app.listen(port, () => {
                    console.log(`Express server listening on port ${port}`);
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
                    if (err) reject(err);
                    else resolve();
                });
            });
        },
    };
}
