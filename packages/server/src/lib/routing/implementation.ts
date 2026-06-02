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

        // Check if it's a knowledge query target
        // For now, knowledge sources don't have node IDs, so this is a placeholder
        // In practice, knowledge discovery would happen before routing

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
