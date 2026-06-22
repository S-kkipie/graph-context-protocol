import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
    BaseChatModel,
    type BaseChatModelParams,
} from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { describe, expect, it } from "vitest";
import { createMockChatModel } from "./mock-model";
import { canDriveToolCalls } from "./toolcall-sanity";

/**
 * A model that NEVER emits a tool call — it always returns a final answer.
 * Stands in for a real model whose API can't drive the ReAct agent's tools.
 */
class NoToolModel extends BaseChatModel {
    constructor(params: BaseChatModelParams = {}) {
        super(params);
    }
    _llmType(): string {
        return "no-tool";
    }
    // biome-ignore lint/suspicious/noExplicitAny: bindTools is loosely typed
    override bindTools(_tools: any[]): this {
        return this;
    }
    async _generate(
        _messages: BaseMessage[],
        _options: this["ParsedCallOptions"],
        _runManager?: CallbackManagerForLLMRun,
    ): Promise<ChatResult> {
        const message = new AIMessage({ content: "no tools used" });
        return { generations: [{ message, text: "no tools used" }] };
    }
}

describe("canDriveToolCalls", () => {
    it("reports ok when the model issues a peer-context tool call", async () => {
        const res = await canDriveToolCalls({
            model: createMockChatModel({ finalAnswer: "done" }),
        });
        expect(res.ok).toBe(true);
        expect(res.roundTrips).toBeGreaterThan(0);
    });

    it("reports not-ok when the model never calls a tool", async () => {
        const res = await canDriveToolCalls({ model: new NoToolModel() });
        expect(res.ok).toBe(false);
        expect(res.roundTrips).toBe(0);
    });
});
