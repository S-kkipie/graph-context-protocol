/**
 * Web-standard client helper for issuing a remote context-query over HTTP.
 *
 * @module http/fetch-client
 */

import {
    type ContextQuery,
    type ContextQueryResult,
    createMessageHeader,
    createProtocolMessage,
    createRole,
    type GraphContext,
} from "@graph-context-protocol/core";
import type { Credentials } from "../auth/types";

const ANONYMOUS_CREDENTIALS: Credentials = {
    type: "anonymous",
    value: "anonymous",
};

/**
 * Options for {@link queryRemoteContext}.
 */
export interface QueryRemoteContextOptions {
    /** Absolute URL of the peer's context-query endpoint. */
    readonly url: string;
    /** The context query to send (build with `createContextQuery`). */
    readonly query: ContextQuery;
    /** Credentials placed under `gcp.credentials`. Defaults to anonymous. */
    readonly credentials?: Credentials;
    /** Injectable fetch for testing. Defaults to global `fetch`. */
    readonly fetchImpl?: typeof fetch;
}

/**
 * Sends a `context-query` ProtocolMessage to a peer node and returns the
 * `ContextQueryResult` payload of the response.
 *
 * @throws Error if the peer responds with a non-2xx status or unparseable body.
 */
export async function queryRemoteContext(
    options: QueryRemoteContextOptions,
): Promise<ContextQueryResult> {
    const { url, query } = options;
    const credentials = options.credentials ?? ANONYMOUS_CREDENTIALS;
    const doFetch = options.fetchImpl ?? fetch;

    const header = createMessageHeader(
        `msg:${query.queryId}`,
        query.requester.principalId,
        query.targetNodeId,
        "context-query",
        { metadata: { "gcp.credentials": credentials } },
    );

    const context: GraphContext = {
        id: `ctx:${query.queryId}`,
        graphId: "graph:remote-query",
        currentNode: query.requester.principalId,
        accumulatedData: {},
        role: createRole("role:remote-requester", "Remote Requester", ""),
        metadata: {},
        createdAt: new Date().toISOString(),
        path: [],
    };

    const message = createProtocolMessage(header, context, query);

    const response = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
    });

    if (!response.ok) {
        throw new Error(
            `Remote context query failed: ${response.status} ${response.statusText}`,
        );
    }

    const responseMessage = (await response.json()) as { payload?: unknown };
    return responseMessage.payload as ContextQueryResult;
}
