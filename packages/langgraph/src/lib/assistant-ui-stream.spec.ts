import { AIMessageChunk, ToolMessage } from "@langchain/core/messages";
import { describe, expect, it } from "vitest";
import { toAssistantUiMessage } from "./assistant-ui-stream";

/**
 * Mirror of the acceptance contract enforced by
 * `@assistant-ui/react-langgraph`'s `normalizeLangGraphTupleMessage`: a tuple
 * message is only rendered when its `type` is one of the known roles and its
 * `content` is a string or array. The raw LangChain serialization
 * (`{ lc, type: "constructor", kwargs }`) fails this, which is the streaming
 * bug this helper fixes.
 */
function isAcceptedByAssistantUi(value: Record<string, unknown>): boolean {
    const okType =
        value.type === "AIMessageChunk" ||
        value.type === "ai" ||
        value.type === "human" ||
        value.type === "system" ||
        value.type === "tool";
    const okContent =
        typeof value.content === "string" || Array.isArray(value.content);
    return okType && okContent;
}

describe("toAssistantUiMessage", () => {
    it("maps an AI token chunk to the AIMessageChunk shape assistant-ui accepts", () => {
        const chunk = new AIMessageChunk({ content: "Hello", id: "run-1" });

        const result = toAssistantUiMessage(chunk);

        expect(result.type).toBe("AIMessageChunk");
        expect(result.id).toBe("run-1");
        expect(result.content).toBe("Hello");
        expect(isAcceptedByAssistantUi(result)).toBe(true);
    });

    it("survives JSON round-trip as a flat dict, not the LangChain constructor form", () => {
        const chunk = new AIMessageChunk({ content: "Hi", id: "run-1" });

        // The bug: JSON.stringify on the raw instance emits the Serializable
        // form whose `type` is "constructor" — rejected by the normalizer.
        const rawRoundTrip = JSON.parse(JSON.stringify(chunk));
        expect(rawRoundTrip.type).toBe("constructor");
        expect(isAcceptedByAssistantUi(rawRoundTrip)).toBe(false);

        // The fix: the helper output round-trips to the accepted flat shape.
        const fixedRoundTrip = JSON.parse(
            JSON.stringify(toAssistantUiMessage(chunk)),
        );
        expect(fixedRoundTrip.type).toBe("AIMessageChunk");
        expect(isAcceptedByAssistantUi(fixedRoundTrip)).toBe(true);
    });

    it("preserves tool_call_chunks so streamed tool calls accumulate", () => {
        const chunk = new AIMessageChunk({
            content: "",
            id: "run-2",
            tool_call_chunks: [
                {
                    name: "query_peer_context",
                    args: '{"question":',
                    id: "call_1",
                    index: 0,
                    type: "tool_call_chunk",
                },
            ],
        });

        const result = toAssistantUiMessage(chunk);

        expect(result.type).toBe("AIMessageChunk");
        expect(result.tool_call_chunks).toEqual([
            {
                name: "query_peer_context",
                args: '{"question":',
                id: "call_1",
                index: 0,
                type: "tool_call_chunk",
            },
        ]);
    });

    it("maps a ToolMessage to the tool shape with id, name and status", () => {
        const tool = new ToolMessage({
            content: "peer result text",
            tool_call_id: "call_1",
            name: "query_peer_context",
            id: "tool-1",
        });

        const result = toAssistantUiMessage(tool);

        expect(result.type).toBe("tool");
        expect(result.content).toBe("peer result text");
        expect(result.tool_call_id).toBe("call_1");
        expect(result.name).toBe("query_peer_context");
        expect(result.status).toBe("success");
        expect(isAcceptedByAssistantUi(result)).toBe(true);
    });
});
