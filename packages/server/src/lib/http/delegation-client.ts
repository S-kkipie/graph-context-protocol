/**
 * Web-standard client helper for delegating a task to a peer node over HTTP.
 *
 * Sibling to {@link queryRemoteContext}: same transport (`postProtocolMessage`)
 * but sends an `action-request` carrying a {@link DelegationRequest} and
 * returns the {@link DelegationResult} payload of the `action-response`.
 *
 * @module http/delegation-client
 */

import {
    createMessageHeader,
    createProtocolMessage,
    createRole,
    type DelegationRequest,
    type DelegationResult,
    type GraphContext,
} from "@graph-context-protocol/core";
import type { Credentials } from "../auth/types";
import { postProtocolMessage } from "./post-message";

const ANONYMOUS_CREDENTIALS: Credentials = {
    type: "anonymous",
    value: "anonymous",
};

/**
 * Options for {@link delegateRemoteTask}.
 */
export interface DelegateRemoteTaskOptions {
    /** Absolute URL of the peer's endpoint. */
    readonly url: string;
    /** The delegation request to send (build with `createDelegationRequest`). */
    readonly request: DelegationRequest;
    /** Credentials placed under `gcp.credentials`. Defaults to anonymous. */
    readonly credentials?: Credentials;
    /** Injectable fetch for testing. Defaults to global `fetch`. */
    readonly fetchImpl?: typeof fetch;
}

/**
 * Sends an `action-request` ProtocolMessage to a peer node and returns the
 * `DelegationResult` payload of the response.
 *
 * @throws Error if the peer responds with a non-2xx status or unparseable body.
 */
export async function delegateRemoteTask(
    options: DelegateRemoteTaskOptions,
): Promise<DelegationResult> {
    const { request } = options;
    const credentials = options.credentials ?? ANONYMOUS_CREDENTIALS;

    const header = createMessageHeader(
        `msg:${request.delegationId}`,
        request.requester.principalId,
        request.targetNodeId,
        "action-request",
        { metadata: { "gcp.credentials": credentials } },
    );

    const context: GraphContext = {
        id: `ctx:${request.delegationId}`,
        graphId: "graph:remote-delegation",
        currentNode: request.requester.principalId,
        accumulatedData: {},
        role: createRole("role:remote-requester", "Remote Requester", ""),
        metadata: {},
        createdAt: new Date().toISOString(),
        path: [],
    };

    const message = createProtocolMessage(header, context, request);

    const responseMessage = await postProtocolMessage(
        options.url,
        message,
        options.fetchImpl,
    );

    return responseMessage.payload as DelegationResult;
}
