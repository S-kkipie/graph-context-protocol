import type { BaseMessage } from "@langchain/core/messages";
import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0.7,
});

const researcherAgent = async (state: { messages: BaseMessage[] }) => {
    const response = await model.invoke(state.messages);
    return { messages: [response] };
};

export const graph = new StateGraph(MessagesAnnotation)
    .addNode("researcher", researcherAgent)
    .addEdge("__start__", "researcher")
    .compile();
