import { describe, expect, it } from "vitest";
import {
    createAgentNode,
    createEdge,
    createGraph,
    createKnowledgeNode,
} from "../graph";
import {
    createCapability,
    createContextRule,
    createRole,
    SystemCapabilities,
} from "../role";
import {
    discoverAgents,
    discoverKnowledge,
    discoverNodes,
} from "./discovery-functions";
import { DiscoveryError } from "./discovery-types";

const discoverAll = [
    createCapability(SystemCapabilities.DISCOVER_AGENTS, "DA", "discover agents"),
    createCapability(
        SystemCapabilities.DISCOVER_KNOWLEDGE,
        "DK",
        "discover knowledge",
    ),
];
const readAllPaths = [createContextRule("graph.nodes.*", "read")];

const fullRole = createRole(
    "role:full",
    "Full",
    "can discover everything",
    discoverAll,
    readAllPaths,
);
const blindRole = createRole(
    "role:blind",
    "Blind",
    "has path access but no discovery capabilities",
    [],
    readAllPaths,
);
const ownerRole = createRole("role:owner", "Owner", "owns nodes");

function buildGraph(requesterRole = fullRole) {
    return createGraph("graph:test")
        .addNode(createAgentNode("node:req", requesterRole))
        .addNode(createAgentNode("node:peer", ownerRole))
        .addNode(
            createKnowledgeNode("knowledge:k", ownerRole, {
                tags: ["docs"],
                contentType: "text/markdown",
            }),
        )
        .addEdge(createEdge("edge:1", "node:req", "node:peer", "can-access"))
        .addEdge(createEdge("edge:2", "node:req", "knowledge:k", "can-access"));
}

describe("discoverNodes", () => {
    it("throws when the requester node is missing", () => {
        const graph = buildGraph();
        expect(() => discoverNodes(graph, "node:missing")).toThrow(DiscoveryError);
    });

    it("throws when the requester is not an agent node", () => {
        const graph = buildGraph();
        expect(() => discoverNodes(graph, "knowledge:k")).toThrow(DiscoveryError);
    });

    it("discovers reachable nodes with path + distance for a capable requester", () => {
        const graph = buildGraph();
        const result = discoverNodes(graph, "node:req");
        const ids = result.nodes.map((n) => n.node.id).sort();
        expect(ids).toEqual(["knowledge:k", "node:peer"]);
        expect(result.denied).toEqual([]);
        const peer = result.nodes.find((n) => n.node.id === "node:peer");
        expect(peer?.distance).toBe(1);
        expect(peer?.path).toEqual(["node:req", "node:peer"]);
    });

    it("collects reachable-but-unauthorized nodes in the denied set", () => {
        const graph = buildGraph(blindRole);
        const result = discoverNodes(graph, "node:req");
        expect(result.nodes).toEqual([]);
        expect([...result.denied].sort()).toEqual(["knowledge:k", "node:peer"]);
    });
});

describe("discoverAgents / discoverKnowledge", () => {
    it("discoverAgents returns only agent nodes", () => {
        const graph = buildGraph();
        const result = discoverAgents(graph, "node:req");
        expect(result.nodes.map((n) => n.node.id)).toEqual(["node:peer"]);
    });

    it("discoverKnowledge returns only knowledge nodes", () => {
        const graph = buildGraph();
        const result = discoverKnowledge(graph, "node:req");
        expect(result.nodes.map((n) => n.node.id)).toEqual(["knowledge:k"]);
    });

    it("applies a matching tag filter", () => {
        const graph = buildGraph();
        const result = discoverKnowledge(graph, "node:req", { tags: ["docs"] });
        expect(result.nodes.map((n) => n.node.id)).toEqual(["knowledge:k"]);
    });

    it("excludes nodes that fail a tag filter", () => {
        const graph = buildGraph();
        const result = discoverKnowledge(graph, "node:req", { tags: ["other"] });
        expect(result.nodes).toEqual([]);
    });
});
