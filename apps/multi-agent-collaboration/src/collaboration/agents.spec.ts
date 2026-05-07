import { describe, expect, it } from "vitest";
import {
    createCollaborationCapabilities,
    createCollaborationRoles,
    createCollaborationGraph,
    createAgentNodes,
    createAgentEdges,
    getAgentConfig,
} from "./agents";

describe("Agents", () => {
    describe("createCollaborationCapabilities", () => {
        it("should create all required capabilities", () => {
            const caps = createCollaborationCapabilities();

            expect(caps.readContext).toBeDefined();
            expect(caps.writeContext).toBeDefined();
            expect(caps.traverseGraph).toBeDefined();
            expect(caps.sendMessages).toBeDefined();
            expect(caps.receiveMessages).toBeDefined();
        });
    });

    describe("createCollaborationRoles", () => {
        it("should create all four agent roles", () => {
            const roles = createCollaborationRoles();

            expect(roles.planner).toBeDefined();
            expect(roles.researcher).toBeDefined();
            expect(roles.writer).toBeDefined();
            expect(roles.reviewer).toBeDefined();
        });

        it("should give planner correct capabilities", () => {
            const roles = createCollaborationRoles();

            expect(roles.planner.hasCapability("cap:read-context")).toBe(true);
            expect(roles.planner.hasCapability("cap:write-context")).toBe(true);
            expect(roles.planner.hasCapability("cap:send-messages")).toBe(true);
        });

        it("should give researcher traverse capability", () => {
            const roles = createCollaborationRoles();

            expect(roles.researcher.hasCapability("cap:traverse-graph")).toBe(
                true,
            );
        });
    });

    describe("getAgentConfig", () => {
        it("should return config for all agent kinds", () => {
            const planner = getAgentConfig("planner");
            const researcher = getAgentConfig("researcher");
            const writer = getAgentConfig("writer");
            const reviewer = getAgentConfig("reviewer");

            expect(planner.kind).toBe("planner");
            expect(researcher.kind).toBe("researcher");
            expect(writer.kind).toBe("writer");
            expect(reviewer.kind).toBe("reviewer");
        });
    });

    describe("createAgentNodes", () => {
        it("should create exactly four agent nodes", () => {
            const nodes = createAgentNodes();

            expect(nodes.planner).toBeDefined();
            expect(nodes.researcher).toBeDefined();
            expect(nodes.writer).toBeDefined();
            expect(nodes.reviewer).toBeDefined();
        });

        it("should assign correct IDs to nodes", () => {
            const nodes = createAgentNodes();

            expect(nodes.planner.id).toBe("agent:planner");
            expect(nodes.researcher.id).toBe("agent:researcher");
            expect(nodes.writer.id).toBe("agent:writer");
            expect(nodes.reviewer.id).toBe("agent:reviewer");
        });
    });

    describe("createAgentEdges", () => {
        it("should create edges connecting the workflow", () => {
            const edges = createAgentEdges();

            expect(edges.plannerToResearcher).toBeDefined();
            expect(edges.researcherToWriter).toBeDefined();
            expect(edges.writerToReviewer).toBeDefined();
            expect(edges.reviewerToPlanner).toBeDefined();
        });
    });

    describe("createCollaborationGraph", () => {
        it("should create graph with four nodes", () => {
            const graph = createCollaborationGraph();

            expect(graph.nodes.size).toBe(4);
        });

        it("should create graph with four edges", () => {
            const graph = createCollaborationGraph();

            expect(graph.edges.size).toBe(4);
        });
    });
});
