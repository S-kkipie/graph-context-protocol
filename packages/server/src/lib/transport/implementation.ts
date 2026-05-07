/**
 * In-memory transport implementations.
 *
 * @module transport/implementation
 */

import {
    fail,
    MetadataSchema,
    type Result,
    succeed,
    type Timestamp,
    TimestampSchema,
} from "@graph-context-protocol/core";
import { z } from "zod";
import type { ServerError } from "../errors.js";
import { createServerError } from "../errors.js";
import type { ShutdownOptions } from "../lifecycle/types.js";
import { ShutdownOptionsSchema } from "../lifecycle/types.js";
import {
    ConnectionIdSchema,
    type DeliveryReceipt,
    DeliveryReceiptSchema,
    type OutboundMessageEnvelope,
    type TransportId,
    TransportIdSchema,
} from "../types.js";
import type {
    Transport,
    TransportEnvelope,
    TransportMessageListener,
    TransportRegistry,
    TransportSnapshot,
    TransportStatus,
} from "./types.js";
import {
    ProtocolMessageSchema,
    TransportMessageListenerSchema,
    TransportSchema,
} from "./types.js";

const OutboundMessageEnvelopeSchema = z.object({
    transportId: TransportIdSchema,
    connectionId: ConnectionIdSchema.optional(),
    payload: ProtocolMessageSchema,
    createdAt: TimestampSchema,
    metadata: MetadataSchema,
});

/**
 * Creates a registry for server transports.
 *
 * @param initialTransports - Transports to register initially
 * @returns Transport registry
 * @throws {z.ZodError} If a transport is invalid
 * @throws {Error} If initial transports contain duplicate IDs
 */
export function createTransportRegistry(
    initialTransports: readonly Transport[] = [],
): TransportRegistry {
    const transports = initialTransports.map((transport) =>
        TransportSchema.parse(transport),
    );
    assertUniqueTransports(transports);

    return createRegistry(
        new Map(transports.map((transport) => [transport.id, transport])),
    );
}

/**
 * Creates an in-memory transport useful for tests and local execution.
 *
 * @param id - Transport identifier
 * @returns Memory transport instance
 * @throws {z.ZodError} If the transport ID is invalid
 */
export function createMemoryTransport(
    id: TransportId = "transport:memory",
): Transport {
    const transportId = TransportIdSchema.parse(id);
    let status: TransportStatus = "idle";
    let startedAt: Timestamp | undefined;
    let stoppedAt: Timestamp | undefined;
    const listeners = new Set<TransportMessageListener>();

    return {
        id: transportId,

        get status() {
            return status;
        },

        async start(): Promise<Result<TransportSnapshot, ServerError>> {
            if (status === "listening") {
                return succeed(createSnapshot());
            }

            status = "starting";
            startedAt = new Date().toISOString();
            stoppedAt = undefined;
            status = "listening";

            return succeed(createSnapshot());
        },

        async stop(
            options: ShutdownOptions = {},
        ): Promise<Result<TransportSnapshot, ServerError>> {
            const parsedOptions = ShutdownOptionsSchema.parse(options);

            if (status === "stopped") {
                return succeed(createSnapshot());
            }

            if (parsedOptions.drain !== false) {
                status = "draining";
            }

            stoppedAt = new Date().toISOString();
            status = "stopped";

            return succeed(createSnapshot());
        },

        async send(
            envelope: OutboundMessageEnvelope,
        ): Promise<Result<DeliveryReceipt, ServerError>> {
            const parsedEnvelope =
                OutboundMessageEnvelopeSchema.parse(envelope);

            if (status !== "listening") {
                return fail(
                    createServerError(
                        "transport-error",
                        `Transport is not listening: ${transportId}`,
                        { metadata: { transportId, status } },
                    ),
                );
            }

            if (parsedEnvelope.transportId !== transportId) {
                return fail(
                    createServerError(
                        "transport-error",
                        `Envelope transport does not match: ${transportId}`,
                        {
                            metadata: {
                                transportId,
                                envelopeTransportId: parsedEnvelope.transportId,
                            },
                        },
                    ),
                );
            }

            const timestamp = new Date().toISOString();
            const transportEnvelope: TransportEnvelope = {
                transportId,
                connectionId: parsedEnvelope.connectionId,
                message: parsedEnvelope.payload,
                receivedAt: timestamp,
                metadata: parsedEnvelope.metadata,
            };

            try {
                for (const listener of listeners) {
                    await listener(transportEnvelope);
                }
            } catch (cause) {
                return fail(
                    createServerError(
                        "transport-error",
                        `Transport listener failed: ${transportId}`,
                        { cause, metadata: { transportId } },
                    ),
                );
            }

            const receipt = DeliveryReceiptSchema.parse({
                delivered: true,
                timestamp,
                transportId,
                connectionId: parsedEnvelope.connectionId,
            });

            return succeed(receipt);
        },

        onMessage(listener: TransportMessageListener) {
            const parsedListener =
                TransportMessageListenerSchema.parse(listener);
            listeners.add(parsedListener);

            return () => {
                listeners.delete(parsedListener);
            };
        },

        snapshot() {
            return createSnapshot();
        },
    };

    function createSnapshot(): TransportSnapshot {
        return { id: transportId, status, startedAt, stoppedAt };
    }
}

function createRegistry(
    transports: ReadonlyMap<TransportId, Transport>,
): TransportRegistry {
    const transportMap = new Map(transports);

    return {
        register(transport: Transport): Result<TransportRegistry, ServerError> {
            const parsedTransport = TransportSchema.parse(transport);

            if (transportMap.has(parsedTransport.id)) {
                return fail(
                    createServerError(
                        "conflict",
                        `Transport already registered: ${parsedTransport.id}`,
                        {
                            metadata: { transportId: parsedTransport.id },
                        },
                    ),
                );
            }

            const nextTransports = new Map(transportMap);
            nextTransports.set(parsedTransport.id, parsedTransport);

            return succeed(createRegistry(nextTransports));
        },

        get(id: TransportId) {
            const transportId = TransportIdSchema.parse(id);
            return transportMap.get(transportId);
        },

        list() {
            return [...transportMap.values()];
        },

        async startAll(): Promise<
            Result<readonly TransportSnapshot[], ServerError>
        > {
            const snapshots: TransportSnapshot[] = [];

            for (const transport of transportMap.values()) {
                const result = await transport.start();
                if (!result.success) {
                    return fail(
                        createServerError(
                            "transport-error",
                            `Failed to start transport: ${transport.id}`,
                            {
                                cause: result.error,
                                metadata: { transportId: transport.id },
                            },
                        ),
                    );
                }

                snapshots.push(result.data);
            }

            return succeed(snapshots);
        },

        async stopAll(
            options: ShutdownOptions = {},
        ): Promise<Result<readonly TransportSnapshot[], ServerError>> {
            const parsedOptions = ShutdownOptionsSchema.parse(options);
            const snapshots: TransportSnapshot[] = [];

            for (const transport of transportMap.values()) {
                const result = await transport.stop(parsedOptions);
                if (!result.success) {
                    return fail(
                        createServerError(
                            "transport-error",
                            `Failed to stop transport: ${transport.id}`,
                            {
                                cause: result.error,
                                metadata: { transportId: transport.id },
                            },
                        ),
                    );
                }

                snapshots.push(result.data);
            }

            return succeed(snapshots);
        },
    };
}

function assertUniqueTransports(transports: readonly Transport[]): void {
    const seen = new Set<TransportId>();

    for (const transport of transports) {
        if (seen.has(transport.id)) {
            throw toError(
                createServerError(
                    "conflict",
                    `Transport already registered: ${transport.id}`,
                    { metadata: { transportId: transport.id } },
                ),
            );
        }

        seen.add(transport.id);
    }
}

function toError(error: ServerError): Error {
    return Object.assign(new Error(error.message), error);
}
