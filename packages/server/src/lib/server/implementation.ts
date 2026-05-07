import {
    fail,
    succeed,
    type Result,
    addProvenance,
} from "@graph-context-protocol/core";
import type {
    GraphContextServer,
    ServerDependencies,
    ServerSnapshot,
} from "./types.js";
import type {
    ServerStatus,
    DeliveryReceipt,
    InboundMessageEnvelope,
    ServerConfig,
} from "../types.js";
import type { ProtocolMessage } from "@graph-context-protocol/core";
import type { ServerError } from "../errors.js";
import { createServerError } from "../errors.js";
import { createLifecycleManager } from "../lifecycle/implementation.js";
import { createTransportRegistry } from "../transport/implementation.js";
import { createConnectionManager } from "../connection/implementation.js";
import { createAllowAllAuthProvider } from "../auth/implementation.js";
import { createMessageRouter } from "../routing/implementation.js";
import { createHandlerRegistry } from "../handlers/implementation.js";
import { createExternalAgentRegistry } from "../agents/implementation.js";
import { createKnowledgeSourceRegistry } from "../knowledge/implementation.js";
import { createMemoryCacheStore } from "../cache/implementation.js";
import { createSyncScheduler } from "../sync/implementation.js";

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
        });

        if (!routeResult.success) {
            return fail(routeResult.error);
        }

        const route = routeResult.data;

        if (route.kind === "external-agent" && route.transportId) {
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
                metadata: {},
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
    const defaultDependencies: ServerDependencies = {
        lifecycle: createLifecycleManager(),
        transports: createTransportRegistry(),
        connections: createConnectionManager(),
        auth: createAllowAllAuthProvider(),
        router: createMessageRouter(),
        handlers: createHandlerRegistry(),
        externalAgents: createExternalAgentRegistry(),
        knowledgeSources: createKnowledgeSourceRegistry(),
        cache: createMemoryCacheStore(),
        sync: createSyncScheduler(),
    };

    return new GraphContextServerImpl({
        config,
        dependencies: { ...defaultDependencies, ...dependencies },
        status: "idle",
    });
}
