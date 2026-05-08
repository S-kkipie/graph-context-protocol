import type { ProtocolMessage } from "@graph-context-protocol/core";
import {
    createContext,
    createMessageHeader,
    createProtocolMessage,
    createRole,
    type Result,
    succeed,
} from "@graph-context-protocol/core";
import type {
    InboundMessageEnvelope,
    KnowledgeQueryRequest,
    KnowledgeQueryResult,
    ServerError,
    TransportEnvelope,
} from "@graph-context-protocol/server";
import {
    createAllowAllAuthProvider,
    createConnectionManager,
    createExternalAgentRegistry,
    createGraphContextServer,
    createKnowledgeSourceRegistry,
    createLifecycleManager,
    createMemoryCacheStore,
    createMemoryTransport,
    createMessageRouter,
    createSyncScheduler,
    createTransportRegistry,
} from "@graph-context-protocol/server";

import { createDemoGraph } from "./graph";
import { createDemoHandlerRegistry } from "./handlers";
import type { ScenarioResult } from "./types";

export async function runServerScenario(): Promise<ScenarioResult> {
    const graph = createDemoGraph();
    const transport = createMemoryTransport("transport:memory");

    const handlers = createDemoHandlerRegistry();

    let externalAgents = createExternalAgentRegistry();
    const agentRegistered = externalAgents.register({
        id: "agent:external",
        nodeId: "node:external",
        capabilities: ["cap:read-context"],
        transportId: "transport:memory",
        endpoint: "memory://external",
        status: "registered",
        metadata: {},
    });
    if (!agentRegistered.success) {
        throw new Error(
            `Failed to register external agent: ${agentRegistered.error.message}`,
        );
    }
    externalAgents = agentRegistered.data;

    let knowledgeSources = createKnowledgeSourceRegistry();
    const sourceRegistered = knowledgeSources.register({
        id: "knowledge:demo",
        capabilities: ["lookup"],
        async query(
            _request: KnowledgeQueryRequest,
        ): Promise<Result<KnowledgeQueryResult, ServerError>> {
            return succeed({
                sourceId: "knowledge:demo",
                nodes: [],
                metadata: { queried: true },
            });
        },
    });
    if (!sourceRegistered.success) {
        throw new Error(
            `Failed to register knowledge source: ${sourceRegistered.error.message}`,
        );
    }
    knowledgeSources = sourceRegistered.data;

    let transports = createTransportRegistry();
    const transportRegistered = transports.register(transport);
    if (!transportRegistered.success) {
        throw new Error(
            `Failed to register transport: ${transportRegistered.error.message}`,
        );
    }
    transports = transportRegistered.data;

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
            handlers,
            externalAgents,
            knowledgeSources,
            cache: createMemoryCacheStore(),
            sync: createSyncScheduler(),
            graph,
        },
    );

    let capturedOutbound: TransportEnvelope | undefined;
    transport.onMessage((envelope) => {
        capturedOutbound = envelope;
    });

    const serverStart = await server.start();

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

    const inboundEnvelope: InboundMessageEnvelope = {
        transportId: "transport:memory",
        payload: contextRequest,
        receivedAt: new Date().toISOString(),
        metadata: {},
    };

    const localHandle = await server.receive(inboundEnvelope);

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

    const externalDelivery = await server.send(notification);

    const serverStop = await server.stop();

    const knowledgeQueryRequest: KnowledgeQueryRequest = {
        requester: {
            id: "agent:server",
            capabilities: [],
            metadata: {},
        },
        query: { filters: { sources: ["knowledge:demo"] } },
        metadata: {},
    };
    const knowledgeResults = await knowledgeSources.query(
        knowledgeQueryRequest,
    );

    return {
        serverStart,
        serverStop,
        localHandle,
        externalDelivery,
        capturedOutbound,
        knowledgeResults,
    };
}
