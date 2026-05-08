import type { ProtocolMessage } from "@graph-context-protocol/core";
import { fail, type Result, succeed } from "@graph-context-protocol/core";
import type { ServerError } from "../errors.js";
import { createServerError } from "../errors.js";
import type {
    HandlerContext,
    HandlerRegistry,
    HandlerResult,
    ProtocolHandler,
} from "./types.js";

interface HandlerRegistryState {
    readonly handlers: ReadonlyMap<string, ProtocolHandler[]>;
}

class HandlerRegistryImpl implements HandlerRegistry {
    private readonly state: HandlerRegistryState;

    constructor(state: HandlerRegistryState) {
        this.state = state;
    }

    register(handler: ProtocolHandler): Result<HandlerRegistry, ServerError> {
        const existing = this.state.handlers.get(handler.name);
        if (existing) {
            return fail(
                createServerError(
                    "conflict",
                    `Handler "${handler.name}" is already registered`,
                ),
            );
        }

        const newHandlers = new Map(this.state.handlers);

        for (const messageType of handler.messageTypes) {
            const typeHandlers = newHandlers.get(messageType) || [];
            newHandlers.set(messageType, [...typeHandlers, handler]);
        }

        return succeed(new HandlerRegistryImpl({ handlers: newHandlers }));
    }

    get(messageType: string): readonly ProtocolHandler[] {
        return this.state.handlers.get(messageType) || [];
    }

    async dispatch(
        message: ProtocolMessage,
        context: HandlerContext,
    ): Promise<Result<HandlerResult, ServerError>> {
        const handlers = this.get(message.header.type);

        if (handlers.length === 0) {
            return fail(
                createServerError(
                    "handler-error",
                    `No handler registered for message type "${message.header.type}"`,
                ),
            );
        }

        const results: HandlerResult[] = [];

        for (const handler of handlers) {
            try {
                const result = await handler.handle(message, context);
                if (!result.success) {
                    return result;
                }
                results.push(result.data);
            } catch (error) {
                return fail(
                    createServerError(
                        "handler-error",
                        `Handler "${handler.name}" threw an error`,
                        { cause: error },
                    ),
                );
            }
        }

        const mergedResult: HandlerResult = {
            handled: results.some((r) => r.handled),
            response: results.find((r) => r.response)?.response,
            notifications: results.flatMap((r) => r.notifications || []),
            metadata: Object.assign({}, ...results.map((r) => r.metadata)),
        };

        return succeed(mergedResult);
    }
}

export function createHandlerRegistry(): HandlerRegistry {
    return new HandlerRegistryImpl({ handlers: new Map() });
}
