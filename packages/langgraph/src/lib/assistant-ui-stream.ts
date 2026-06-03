/**
 * Serializes LangChain stream messages into the flat shape the
 * `@assistant-ui/react-langgraph` runtime expects.
 *
 * A `graph.stream(..., { streamMode: "messages" })` tuple yields live
 * LangChain message instances. `JSON.stringify` on those produces the
 * `Serializable` form (`{ lc, type: "constructor", id: [...], kwargs }`),
 * whose `type` is `"constructor"`. assistant-ui's `normalizeLangGraphTupleMessage`
 * only accepts `type` values of `"AIMessageChunk" | "ai" | "human" | "system"
 * | "tool"` with a string/array `content`, so it drops every raw chunk and the
 * UI renders nothing. This helper maps each message to that accepted shape.
 *
 * @module assistant-ui-stream
 */

import type {
    AIMessageChunk,
    BaseMessage,
    ToolMessage,
} from "@langchain/core/messages";

/**
 * A LangChain message flattened into the dict shape that the assistant-ui
 * LangGraph runtime can normalize and render.
 */
export type AssistantUiMessage = {
    readonly type: string;
    readonly id?: string;
    readonly content: unknown;
    readonly [key: string]: unknown;
};

/**
 * Maps a LangChain stream message to the assistant-ui tuple-message shape.
 *
 * AI messages are emitted as `"AIMessageChunk"` so the runtime's
 * `appendLangChainChunk` merges consecutive chunks (sharing an `id`) into a
 * single growing message — the mechanism that makes token streaming render
 * incrementally.
 */
export function toAssistantUiMessage(message: BaseMessage): AssistantUiMessage {
    const role = message.getType();
    const id = typeof message.id === "string" ? message.id : undefined;
    const content = message.content;
    const base = id !== undefined ? { id, content } : { content };

    switch (role) {
        case "ai": {
            const ai = message as AIMessageChunk;
            const toolCallChunks = ai.tool_call_chunks ?? [];
            return {
                type: "AIMessageChunk",
                ...base,
                ...(toolCallChunks.length > 0 && {
                    tool_call_chunks: toolCallChunks,
                }),
            };
        }
        case "tool": {
            const tool = message as ToolMessage;
            return {
                type: "tool",
                ...base,
                tool_call_id: tool.tool_call_id,
                ...(tool.name !== undefined && { name: tool.name }),
                status: tool.status ?? "success",
            };
        }
        default:
            return { type: role, ...base };
    }
}
