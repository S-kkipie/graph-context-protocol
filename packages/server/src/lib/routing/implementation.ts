import type { ProtocolMessage } from "@graph-context-protocol/core";
import {
    fail,
    isMessageExpired,
    type Result,
    succeed,
} from "@graph-context-protocol/core";
import type { ServerError } from "../errors";
import { createServerError } from "../errors";
import type { MessageRoute, MessageRouter, RoutingContext } from "./types";

class MessageRouterImpl implements MessageRouter {
    route(
        message: ProtocolMessage,
        context: RoutingContext,
    ): Result<MessageRoute, ServerError> {
        // Check if message is expired
        if (isMessageExpired(message)) {
            return fail(
                createServerError("routing-error", "Message has expired"),
            );
        }

        const targetId = message.header.target;

        // Check if targeting local node
        if (targetId === context.localNodeId) {
            return succeed({
                kind: "local-handler",
                message,
                targetNodeId: targetId,
                metadata: {},
            });
        }

        // Check external agents registry
        const externalAgent = context.externalAgents.getByNodeId(targetId);
        if (externalAgent) {
            return succeed({
                kind: "external-agent",
                message,
                targetNodeId: targetId,
                externalAgentId: externalAgent.id,
                connectionId: externalAgent.connectionId,
                transportId: externalAgent.transportId,
                metadata: { agentStatus: externalAgent.status },
            });
        }

        // Check peer registry for knowledge nodes owned by known peers
        const peer = context.peers?.getByKnowledgeNodeId(targetId);
        if (peer) {
            return succeed({
                kind: "knowledge-source",
                message,
                targetNodeId: targetId,
                transportId: "transport:http",
                knowledgeSourceId: peer.peerId,
                metadata: {
                    "gcp.peerEndpoint": peer.queryEndpoint ?? peer.endpoint,
                },
            });
        }

        return succeed({
            kind: "undeliverable",
            message,
            targetNodeId: targetId,
            metadata: { reason: "Target not found" },
        });
    }
}

export function createMessageRouter(): MessageRouter {
    return new MessageRouterImpl();
}
