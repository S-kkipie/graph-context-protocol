import type { BaseMessage } from "@langchain/core/messages";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0.2,
});

const executorAgent = async (state: { messages: BaseMessage[] }) => {
    const response = await model.invoke(state.messages);
    return { messages: [response] };
};

export const graph = new StateGraph(MessagesAnnotation)
    .addNode("executor", executorAgent)
    .addEdge("__start__", "executor")
    .compile();
