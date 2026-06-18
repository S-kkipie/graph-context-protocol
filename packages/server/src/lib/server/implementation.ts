import type { ProtocolMessage } from "@graph-context-protocol/core";
import {
    addProvenance,
    fail,
    type Result,
    succeed,
} from "@graph-context-protocol/core";
import { createExternalAgentRegistry } from "../agents/implementation";
import { createInMemoryAuditSink } from "../audit/implementation";
import { createAllowAllAuthProvider } from "../auth/implementation";
import { createMemoryCacheStore } from "../cache/implementation";
import { createConnectionManager } from "../connection/implementation";
import type { ServerError } from "../errors";
import { createServerError } from "../errors";
import { createContextQueryHandler } from "../handlers/context-query-handler";
import { createHandlerRegistry } from "../handlers/implementation";
import type { HandlerRegistry } from "../handlers/types";
import { createKnowledgeSourceRegistry } from "../knowledge/implementation";
import { createLifecycleManager } from "../lifecycle/implementation";
import { createCouplingMetrics } from "../metrics/implementation";
import { createPeerRegistry } from "../peers/implementation";
import { createMessageRouter } from "../routing/implementation";
import { createSyncScheduler } from "../sync/implementation";
import { createTransportRegistry } from "../transport/implementation";
import type {
    DeliveryReceipt,
    InboundMessageEnvelope,
    ServerConfig,
    ServerStatus,
} from "../types";
import type {
    GraphContextServer,
    ServerDependencies,
    ServerSnapshot,
} from "./types";

interface ServerState {
    readonly config: ServerConfig;
    readonly dependencies: ServerDependencies;
    readonly status: ServerStatus;
    readonly startedAt?: string;
    readonly stoppedAt?: string;
}

class GraphContextServerImpl implements GraphContextServer {
    private state: ServerState;

    constructor(state: ServerState) {
        this.state = state;
    }

    get id(): string {
        return this.state.config.id;
    }

    get status(): ServerStatus {
        return this.state.status;
    }

    get localNodeId(): string {
        return this.state.config.localNodeId;
    }

    async start(): Promise<Result<ServerSnapshot, ServerError>> {
        if (this.state.status !== "idle" && this.state.status !== "stopped") {
            return fail(
                createServerError(
                    "lifecycle-error",
                    `Cannot start server from status "${this.state.status}"`,
                ),
            );
        }

        const lifecycleContext = {
            serverId: this.state.config.id,
            localNodeId: this.state.config.localNodeId,
            metadata: this.state.config.metadata || {},
        };

        const startResult =
            await this.state.dependencies.lifecycle.start(lifecycleContext);
        if (!startResult.success) {
            this.state = { ...this.state, status: "failed" };
            return fail(startResult.error);
        }

        const transportResults =
            await this.state.dependencies.transports.startAll();
        if (!transportResults.success) {
            this.state = { ...this.state, status: "failed" };
            return fail(transportResults.error);
        }

        this.state = {
            ...this.state,
            status: "ready",
            startedAt: new Date().toISOString(),
        };

        return succeed(this.snapshot());
    }

    async stop(): Promise<Result<ServerSnapshot, ServerError>> {
        if (this.state.status === "stopped") {
            return succeed(this.snapshot());
        }

        const lifecycleContext = {
            serverId: this.state.config.id,
            localNodeId: this.state.config.localNodeId,
            metadata: this.state.config.metadata || {},
        };

        const stopResult = await this.state.dependencies.lifecycle.stop(
            lifecycleContext,
            {
                timeoutMs: this.state.config.shutdownTimeoutMs,
                drain: true,
            },
        );

        if (!stopResult.success) {
            return fail(stopResult.error);
        }

        const transportResults =
            await this.state.dependencies.transports.stopAll({
                timeoutMs: this.state.config.shutdownTimeoutMs,
                drain: true,
            });

        if (!transportResults.success) {
            return fail(transportResults.error);
        }

        this.state = {
            ...this.state,
            status: "stopped",
            stoppedAt: new Date().toISOString(),
        };

        return succeed(this.snapshot());
    }

    async send(
        message: ProtocolMessage,
    ): Promise<Result<DeliveryReceipt, ServerError>> {
        if (this.state.status !== "ready") {
            return fail(
                createServerError(
                    "lifecycle-error",
                    `Cannot send message when server is "${this.state.status}"`,
                ),
            );
        }

        const routeResult = this.state.dependencies.router.route(message, {
            localNodeId: this.state.config.localNodeId,
            connections: this.state.dependencies.connections,
            externalAgents: this.state.dependencies.externalAgents,
            knowledgeSources: this.state.dependencies.knowledgeSources,
            peers: this.state.dependencies.peers,
        });

        if (!routeResult.success) {
            return fail(routeResult.error);
        }

        const route = routeResult.data;

        if (
            (route.kind === "external-agent" ||
                route.kind === "knowledge-source") &&
            route.transportId
        ) {
            const transport = this.state.dependencies.transports.get(
                route.transportId,
            );
            if (!transport) {
                return fail(
                    createServerError(
                        "transport-error",
                        `Transport "${route.transportId}" not found`,
                    ),
                );
            }

            return transport.send({
                transportId: route.transportId,
                connectionId: route.connectionId,
                payload: message,
                createdAt: new Date().toISOString(),
                metadata: {
                    "gcp.peerEndpoint": route.metadata["gcp.peerEndpoint"],
                },
            });
        }

        return succeed({
            delivered: true,
            timestamp: new Date().toISOString(),
            transportId: route.transportId || "local",
            connectionId: route.connectionId,
        });
    }

    async receive(
        envelope: InboundMessageEnvelope,
    ): Promise<Result<unknown, ServerError>> {
        if (this.state.status !== "ready") {
            return fail(
                createServerError(
                    "lifecycle-error",
                    `Cannot receive message when server is "${this.state.status}"`,
                ),
            );
        }

        const message = envelope.payload as ProtocolMessage;

        const messageWithProvenance = addProvenance(
            message,
            this.state.config.localNodeId,
            "received",
        );

        const dispatchResult = await this.state.dependencies.handlers.dispatch(
            messageWithProvenance,
            {
                serverId: this.state.config.id,
                localNodeId: this.state.config.localNodeId,
                graph: this.state.dependencies.graph,
                connections: this.state.dependencies.connections,
                externalAgents: this.state.dependencies.externalAgents,
                knowledgeSources: this.state.dependencies.knowledgeSources,
                cache: this.state.dependencies.cache,
                auth: this.state.dependencies.auth,
                audit: this.state.dependencies.audit,
                inboundMetadata: envelope.metadata ?? {},
                metadata: {},
            },
        );

        return dispatchResult;
    }

    snapshot(): ServerSnapshot {
        const connectionSnapshot =
            this.state.dependencies.connections.snapshot();
        return {
            id: this.state.config.id,
            status: this.state.status,
            localNodeId: this.state.config.localNodeId,
            startedAt: this.state.startedAt,
            stoppedAt: this.state.stoppedAt,
            activeConnections: connectionSnapshot.totalConnections,
            activeSessions: connectionSnapshot.totalSessions,
            transports: this.state.dependencies.transports
                .list()
                .map((t) => t.id),
        };
    }
}

export function createGraphContextServer(
    config: ServerConfig,
    dependencies?: Partial<ServerDependencies>,
): GraphContextServer {
    const defaultHandlers = createDefaultHandlerRegistry();
    const defaultDependencies: ServerDependencies = {
        lifecycle: createLifecycleManager(),
        transports: createTransportRegistry(),
        connections: createConnectionManager(),
        auth: createAllowAllAuthProvider(),
        router: createMessageRouter(),
        handlers: defaultHandlers,
        externalAgents: createExternalAgentRegistry(),
        knowledgeSources: createKnowledgeSourceRegistry(),
        peers: createPeerRegistry(),
        cache: createMemoryCacheStore(),
        sync: createSyncScheduler(),
        audit: createInMemoryAuditSink(),
        metrics: createCouplingMetrics(),
    };

    return new GraphContextServerImpl({
        config,
        dependencies: { ...defaultDependencies, ...dependencies },
        status: "idle",
    });
}

function createDefaultHandlerRegistry(): HandlerRegistry {
    const registry = createHandlerRegistry();
    const registered = registry.register(createContextQueryHandler());

    if (registered.success) {
        return registered.data;
    }

    return registry;
}
