import {
    createAgentNode,
    createGraph,
    createRole,
} from "@graph-context-protocol/core";
import { describe, expect, it, vi } from "vitest";
import { createCollaborationWorkflow } from "./workflow";

describe("workflow", () => {
    function createMockAgent() {
        return {
            invoke: vi.fn(async (state) => ({
                ...state,
                messages: [
                    ...(state.messages ?? []),
                    { content: "mock response" },
                ],
                nextAgent: null,
                iteration: (state.iteration ?? 0) + 1,
            })),
        } as never;
    }

    function createTestNode(id: string) {
        return createAgentNode(id, createRole(id, "Test", "", [], []));
    }

    describe("createCollaborationWorkflow", () => {
        it("should build a workflow with all agents", () => {
            const graph = createGraph("graph:test").addNode(
                createTestNode("agent:a"),
            );
            const workflow = createCollaborationWorkflow({
                gcpGraph: graph,
                agents: [
                    { id: "a", agent: createMockAgent() },
                    { id: "b", agent: createMockAgent() },
                ],
                startAgent: "a",
            });

            expect(workflow).toBeDefined();
            expect(typeof workflow.invoke).toBe("function");
        });

        it("should respect max iterations", async () => {
            const graph = createGraph("graph:test").addNode(
                createTestNode("agent:a"),
            );
            const mockAgent = {
                invoke: vi.fn(async (state) => ({
                    ...state,
                    messages: state.messages,
                    nextAgent: "a",
                    iteration: (state.iteration ?? 0) + 1,
                })),
            } as never;

            const workflow = createCollaborationWorkflow({
                gcpGraph: graph,
                agents: [{ id: "a", agent: mockAgent }],
                startAgent: "a",
                maxIterations: 3,
            });

            const result = await workflow.invoke({
                messages: [],
                gcpGraph: graph,
                currentAgent: "a",
                iteration: 0,
            });

            expect(result.iteration).toBeLessThanOrEqual(3);
        });
    });
});
