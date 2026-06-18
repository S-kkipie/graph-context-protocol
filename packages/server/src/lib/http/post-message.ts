/**
 * Shared low-level POST for peer messaging.
 *
 * Both the request/response client (`queryRemoteContext`) and the
 * fire-and-forget `HttpTransport` route their HTTP through this single helper
 * so there is exactly one place that owns the wire format (JSON body, a
 * `ProtocolMessage` in and a `ProtocolMessage` out).
 *
 * @module http/post-message
 */

import type { ProtocolMessage } from "@graph-context-protocol/core";

/**
 * POSTs a ProtocolMessage as JSON to a peer endpoint and parses the response
 * body as a ProtocolMessage.
 *
 * @param url - Peer endpoint URL
 * @param message - The protocol message to send
 * @param fetchImpl - Injectable fetch (defaults to global fetch)
 * @returns The peer's response ProtocolMessage
 * @throws {Error} If the HTTP response status is not OK
 */
export async function postProtocolMessage(
    url: string,
    message: ProtocolMessage,
    fetchImpl: typeof fetch = fetch,
): Promise<ProtocolMessage> {
    const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
    });

    if (!response.ok) {
        throw new Error(
            `Peer request to ${url} failed: ${response.status} ${response.statusText}`,
        );
    }

    return (await response.json()) as ProtocolMessage;
}
