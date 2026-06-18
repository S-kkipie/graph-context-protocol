/**
 * HTTP transport behind the `Transport` interface.
 *
 * Fire-and-forget `send()`: resolves the destination endpoint from the
 * outbound envelope, POSTs the payload via the shared {@link postProtocolMessage}
 * helper, and feeds the peer's response back to `onMessage` listeners for
 * duplex symmetry. No request/response correlation is performed here — the
 * request/response context-query path uses `queryRemoteContext` (decision D1).
 *
 * @module transport/http-transport
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
import type { ServerError } from "../errors";
import { createServerError } from "../errors";
import { postProtocolMessage } from "../http/post-message";
import type { ShutdownOptions } from "../lifecycle/types";
import { ShutdownOptionsSchema } from "../lifecycle/types";
import {
    ConnectionIdSchema,
    type DeliveryReceipt,
    DeliveryReceiptSchema,
    type OutboundMessageEnvelope,
    type TransportId,
    TransportIdSchema,
} from "../types";
import type {
    Transport,
    TransportEnvelope,
    TransportMessageListener,
    TransportSnapshot,
    TransportStatus,
} from "./types";
import { ProtocolMessageSchema, TransportMessageListenerSchema } from "./types";

const OutboundMessageEnvelopeSchema = z.object({
    transportId: TransportIdSchema,
    connectionId: ConnectionIdSchema.optional(),
    payload: ProtocolMessageSchema,
    createdAt: TimestampSchema,
    metadata: MetadataSchema,
});

/** Options for {@link createHttpTransport}. */
export interface HttpTransportOptions {
    /** Transport id (defaults to "transport:http"). */
    readonly id?: TransportId;
    /** Injectable fetch (defaults to global fetch). */
    readonly fetchImpl?: typeof fetch;
    /**
     * Resolves the destination URL for an outbound envelope. Typically reads
     * `envelope.metadata["gcp.peerEndpoint"]` (set by the message router from
     * the matched peer descriptor).
     */
    readonly resolveEndpoint: (
        envelope: OutboundMessageEnvelope,
    ) => string | undefined;
}

/**
 * Creates an HTTP transport implementing the `Transport` interface.
 *
 * @param options - Endpoint resolver + optional id/fetch
 * @returns A new HttpTransport
 */
export function createHttpTransport(options: HttpTransportOptions): Transport {
    const transportId: TransportId = TransportIdSchema.parse(
        options.id ?? "transport:http",
    );
    const fetchImpl = options.fetchImpl ?? fetch;
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
            opts: ShutdownOptions = {},
        ): Promise<Result<TransportSnapshot, ServerError>> {
            const parsedOptions = ShutdownOptionsSchema.parse(opts);

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

            const endpoint = options.resolveEndpoint(parsedEnvelope);
            if (endpoint === undefined) {
                return fail(
                    createServerError(
                        "transport-error",
                        `No endpoint resolved for envelope on ${transportId}`,
                        { metadata: { transportId } },
                    ),
                );
            }

            const timestamp = new Date().toISOString();
            try {
                const responseMessage = await postProtocolMessage(
                    endpoint,
                    parsedEnvelope.payload,
                    fetchImpl,
                );
                const transportEnvelope: TransportEnvelope = {
                    transportId,
                    connectionId: parsedEnvelope.connectionId,
                    message: responseMessage,
                    receivedAt: new Date().toISOString(),
                    metadata: parsedEnvelope.metadata,
                };
                for (const listener of listeners) {
                    await listener(transportEnvelope);
                }
            } catch (cause) {
                return fail(
                    createServerError(
                        "transport-error",
                        `HTTP transport send failed: ${transportId}`,
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
