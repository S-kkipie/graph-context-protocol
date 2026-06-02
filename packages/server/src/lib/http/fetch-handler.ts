/**
 * Web-standard request handler that bridges HTTP into a GraphContextServer.
 *
 * @module http/fetch-handler
 */

import type { ProtocolMessage } from "@graph-context-protocol/core";
import type { GraphContextServer } from "../server/types.js";
import type { InboundMessageEnvelope } from "../types.js";

/**
 * Options for {@link createFetchHandler}.
 */
export interface FetchHandlerOptions {
    /** A started GraphContextServer to dispatch inbound messages to. */
    readonly server: GraphContextServer;
    /** Transport id stamped on the inbound envelope. Defaults to "fetch". */
    readonly transportId?: string;
}

/**
 * Creates a `(Request) => Promise<Response>` handler that parses a
 * ProtocolMessage from the request body, dispatches it through
 * `server.receive`, and serializes the handler's response message as JSON.
 */
export function createFetchHandler(
    options: FetchHandlerOptions,
): (request: Request) => Promise<Response> {
    const { server } = options;
    const transportId = options.transportId ?? "fetch";

    return async (request: Request): Promise<Response> => {
        let message: ProtocolMessage;
        try {
            message = (await request.json()) as ProtocolMessage;
        } catch {
            return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        if (
            message?.header === undefined ||
            message?.header?.type === undefined
        ) {
            return jsonResponse(
                { error: "Body is not a ProtocolMessage" },
                400,
            );
        }

        const envelope: InboundMessageEnvelope = {
            transportId,
            payload: message,
            receivedAt: new Date().toISOString(),
            metadata: {},
        };

        const result = await server.receive(envelope);

        if (!result.success) {
            return jsonResponse(
                { error: result.error.message, code: result.error.code },
                500,
            );
        }

        const handlerResult = result.data as { response?: ProtocolMessage };
        if (handlerResult?.response === undefined) {
            return jsonResponse({ error: "No response produced" }, 502);
        }

        return jsonResponse(handlerResult.response, 200);
    };
}

function jsonResponse(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
