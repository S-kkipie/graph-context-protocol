/**
 * LLM-powered multi-agent collaboration demo.
 *
 * Demonstrates real AI agents using LangGraph and OpenRouter
 * to collaborate on a content creation task through the
 * Graph Context Protocol.
 *
 * @module llm-collaboration
 */

import {
    createAgentNode,
    createCapability,
    createDiscoverAgentsTool,
    createDiscoverKnowledgeTool,
    createEdge,
    createGraph,
    createGraphInfoTool,
    createKnowledgeNode,
    createRole,
    SystemCapabilities,
} from "@graph-context-protocol/core";
import {
    createCollaborationWorkflow,
    createLangGraphAgent,
    createOpenRouterLLM,
    toLangChainTool,
} from "@graph-context-protocol/langgraph";
import { HumanMessage } from "@langchain/core/messages";

/**
 * Creates the collaboration graph with agent nodes and edges.
 */
function createCollaborationGraph() {
    const capabilities = {
        read: createCapability(
            SystemCapabilities.READ_CONTEXT,
            "Read Context",
            "Can read context data",
        ),
        write: createCapability(
            SystemCapabilities.WRITE_CONTEXT,
            "Write Context",
            "Can write context data",
        ),
        discover: createCapability(
            SystemCapabilities.DISCOVER_AGENTS,
            "Discover Agents",
            "Can discover other agents",
        ),
        send: createCapability(
            SystemCapabilities.SEND_MESSAGES,
            "Send Messages",
            "Can send protocol messages",
        ),
    };

    const plannerRole = createRole(
        "role:planner",
        "Planner",
        "Strategic planning specialist who defines tasks and objectives",
        [capabilities.read, capabilities.write, capabilities.send],
        [
            { path: "task.*", access: "read" },
            { path: "task.*", access: "write" },
        ],
    );

    const researcherRole = createRole(
        "role:researcher",
        "Researcher",
        "Research specialist who gathers and analyzes information",
        [
            capabilities.read,
            capabilities.write,
            capabilities.discover,
            capabilities.send,
        ],
        [
            { path: "task.*", access: "read" },
            { path: "research.*", access: "read" },
            { path: "research.*", access: "write" },
        ],
    );

    const writerRole = createRole(
        "role:writer",
        "Writer",
        "Content creation specialist who produces written material",
        [
            capabilities.read,
            capabilities.write,
            capabilities.discover,
            capabilities.send,
        ],
        [
            { path: "task.*", access: "read" },
            { path: "research.*", access: "read" },
            { path: "draft.*", access: "read" },
            { path: "draft.*", access: "write" },
        ],
    );

    const reviewerRole = createRole(
        "role:reviewer",
        "Reviewer",
        "Quality assurance specialist who reviews and provides feedback",
        [capabilities.read, capabilities.write, capabilities.send],
        [
            { path: "task.*", access: "read" },
            { path: "research.*", access: "read" },
            { path: "draft.*", access: "read" },
            { path: "review.*", access: "read" },
            { path: "review.*", access: "write" },
        ],
    );

    const graph = createGraph("graph:collaboration")
        .addNode(createAgentNode("agent:planner", plannerRole))
        .addNode(createAgentNode("agent:researcher", researcherRole))
        .addNode(createAgentNode("agent:writer", writerRole))
        .addNode(createAgentNode("agent:reviewer", reviewerRole))
        .addNode(
            createKnowledgeNode("knowledge:guidelines", plannerRole, {
                tags: ["guidelines"],
                contentType: "text/markdown",
            }),
        )
        .addEdge(
            createEdge(
                "edge:planner-researcher",
                "agent:planner",
                "agent:researcher",
                "can-traverse",
            ),
        )
        .addEdge(
            createEdge(
                "edge:researcher-writer",
                "agent:researcher",
                "agent:writer",
                "can-traverse",
            ),
        )
        .addEdge(
            createEdge(
                "edge:writer-reviewer",
                "agent:writer",
                "agent:reviewer",
                "can-traverse",
            ),
        )
        .addEdge(
            createEdge(
                "edge:planner-guidelines",
                "agent:planner",
                "knowledge:guidelines",
                "can-access",
            ),
        );

    return {
        graph,
        roles: { plannerRole, researcherRole, writerRole, reviewerRole },
    };
}

/**
 * Creates LLM-powered LangGraph agents from the GCP graph.
 */
function createLLMAgents(
    graph: ReturnType<typeof createCollaborationGraph>["graph"],
) {
    const llm = createOpenRouterLLM({
        model: "minimax/minimax-m2.5:free",
        temperature: 0.7,
    });

    const plannerNode = graph.nodes.get("agent:planner")!;
    const researcherNode = graph.nodes.get("agent:researcher")!;
    const writerNode = graph.nodes.get("agent:writer")!;
    const reviewerNode = graph.nodes.get("agent:reviewer")!;

    const planner = createLangGraphAgent({
        node: plannerNode as never,
        llm,
        systemPrompt: `You are a Strategic Planner. Your role is to:
1. Analyze the user's request and define clear objectives
2. Create a detailed task brief with constraints and requirements
3. Use tools to discover available agents and resources
4. Set the next agent to "researcher" when planning is complete

Always respond with a clear plan and specify which agent should act next by setting nextAgent in your response.`,
    });

    const researcher = createLangGraphAgent({
        node: researcherNode as never,
        llm,
        systemPrompt: `You are a Research Specialist. Your role is to:
1. Use the discover_knowledge and discover_agents tools to gather information
2. Analyze the task brief from the planner
3. Generate comprehensive research findings
4. Set the next agent to "writer" when research is complete

Focus on gathering relevant facts, examples, and supporting information. Always specify nextAgent in your response.`,
        extraTools: [
            toLangChainTool(createDiscoverAgentsTool(), () => ({
                graph,
                agentNode: researcherNode as never,
            })),
            toLangChainTool(createDiscoverKnowledgeTool(), () => ({
                graph,
                agentNode: researcherNode as never,
            })),
            toLangChainTool(createGraphInfoTool(), () => ({
                graph,
                agentNode: researcherNode as never,
            })),
        ],
    });

    const writer = createLangGraphAgent({
        node: writerNode as never,
        llm,
        systemPrompt: `You are a Content Writer. Your role is to:
1. Review the task brief and research findings
2. Create high-quality written content that meets the requirements
3. Use the graph_info tool to understand the collaboration context
4. Set the next agent to "reviewer" when the draft is complete

Produce well-structured, engaging content. Always specify nextAgent in your response.`,
        extraTools: [
            toLangChainTool(createGraphInfoTool(), () => ({
                graph,
                agentNode: writerNode as never,
            })),
        ],
    });

    const reviewer = createLangGraphAgent({
        node: reviewerNode as never,
        llm,
        systemPrompt: `You are a Quality Reviewer. Your role is to:
1. Review the drafted content against the original requirements
2. Provide constructive feedback on quality, accuracy, and completeness
3. Decide if the work is approved or needs revision
4. If approved, set nextAgent to null (end workflow)
5. If needs revision, set nextAgent to the appropriate agent (writer or researcher)

Be thorough and specific in your feedback. Your decision ends or continues the workflow.`,
    });

    return {
        planner: { id: "planner", agent: planner },
        researcher: { id: "researcher", agent: researcher },
        writer: { id: "writer", agent: writer },
        reviewer: { id: "reviewer", agent: reviewer },
    };
}

/**
 * Runs the LLM-powered multi-agent collaboration workflow.
 *
 * @param topic - The topic for content creation
 * @returns The final messages from the workflow
 */
export async function runLLMCollaboration(topic: string) {
    const { graph } = createCollaborationGraph();
    const agents = createLLMAgents(graph);

    const workflow = createCollaborationWorkflow({
        gcpGraph: graph,
        agents: [
            agents.planner,
            agents.researcher,
            agents.writer,
            agents.reviewer,
        ],
        startAgent: "planner",
        maxIterations: 8,
    });

    const result = await workflow.invoke({
        messages: [new HumanMessage(`Create a blog post about: ${topic}`)],
        gcpGraph: graph,
        currentAgent: "agent:planner",
        iteration: 0,
    });

    return result.messages;
}

/**
 * Renders the collaboration result as a formatted report.
 */
export function renderLLMReport(
    messages: { content: unknown; name?: string }[],
): string {
    const header = "=== LLM-Powered Multi-Agent Collaboration ===\n\n";

    const content = messages
        .map((msg, i) => {
            const role = msg.name ? `[${msg.name}]` : `[Agent ${i + 1}]`;
            const contentStr =
                typeof msg.content === "string"
                    ? msg.content
                    : JSON.stringify(msg.content, null, 2);
            return `${role}:\n${contentStr}\n`;
        })
        .join("\n---\n\n");

    return header + content;
}
