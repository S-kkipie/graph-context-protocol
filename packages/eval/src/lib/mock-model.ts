/**
 * Deterministic mock chat model for hermetic CI. On the first call (no tool
 * results yet) it emits one tool call per bound tool; on the next call it
 * returns the fixed finalAnswer. Drives a react agent through exactly one round
 * of parallel tool calls — no network, no key.
 *
 * @module mock-model
 */

import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
    BaseChatModel,
    type BaseChatModelParams,
} from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";

// biome-ignore lint/suspicious/noExplicitAny: LangChain tool/binding shapes are loose
type AnyTool = any;

class MockChatModel extends BaseChatModel {
    private boundTools: AnyTool[] = [];
    constructor(
        private readonly finalAnswer: string,
        params: BaseChatModelParams = {},
    ) {
        super(params);
    }

    _llmType(): string {
        return "mock";
    }

    // createReactAgent calls bindTools(tools); we store them and return self.
    // BaseChatModel extends Runnable so returning `this` satisfies the return type.
    override bindTools(tools: AnyTool[]): this {
        this.boundTools = tools;
        return this;
    }

    async _generate(
        messages: BaseMessage[],
        _options: this["ParsedCallOptions"],
        _runManager?: CallbackManagerForLLMRun,
    ): Promise<ChatResult> {
        const toolsRan = messages.some((m) => m.getType() === "tool");
        if (!toolsRan && this.boundTools.length > 0) {
            const toolCalls = this.boundTools.map((t, i) => ({
                name: t.name as string,
                args: { question: "what is your price?" },
                id: `call_${i}`,
                type: "tool_call" as const,
            }));
            const message = new AIMessage({
                content: "",
                tool_calls: toolCalls,
            });
            return { generations: [{ message, text: "" }] };
        }
        const message = new AIMessage({ content: this.finalAnswer });
        return { generations: [{ message, text: this.finalAnswer }] };
    }
}

/** Builds a deterministic mock chat model that answers `finalAnswer`. */
export function createMockChatModel(opts: {
    finalAnswer: string;
}): BaseChatModel {
    return new MockChatModel(opts.finalAnswer);
}
