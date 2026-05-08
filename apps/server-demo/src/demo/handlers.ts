import type { ProtocolMessage } from "@graph-context-protocol/core";
import { type Result, succeed } from "@graph-context-protocol/core";
import type {
    HandlerContext,
    HandlerRegistry,
    HandlerResult,
    KnowledgeQueryRequest,
    ServerError,
} from "@graph-context-protocol/server";
import { createHandlerRegistry } from "@graph-context-protocol/server";

export function createDemoHandlerRegistry(): HandlerRegistry {
    const registry = createHandlerRegistry();

    const handler = {
        name: "demo-context-handler",
        messageTypes: ["context-request"],
        async handle(
            message: ProtocolMessage,
            context: HandlerContext,
        ): Promise<Result<HandlerResult, ServerError>> {
            const request: KnowledgeQueryRequest = {
                requester: {
                    id: "agent:server",
                    capabilities: [],
                    metadata: {},
                },
                query: { filters: { sources: ["knowledge:demo"] } },
                metadata: { triggeredBy: message.header.messageId },
            };

            const knowledgeResult =
                await context.knowledgeSources.query(request);

            return succeed({
                handled: true,
                metadata: {
                    source: "handler:demo",
                    knowledgeSuccess: knowledgeResult.success,
                },
            });
        },
    };

    const registered = registry.register(handler);
    if (!registered.success) {
        throw new Error(
            `Failed to register handler: ${registered.error.message}`,
        );
    }
    return registered.data;
}
