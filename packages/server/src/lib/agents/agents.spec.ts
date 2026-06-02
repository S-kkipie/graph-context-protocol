import {
    type CapabilityId,
    createCapability,
    createRole,
    type RoleDefinition,
} from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { createExternalAgentRegistry, toAgentNode } from "./implementation";
import type { ExternalAgentDescriptor, ExternalAgentRegistry } from "./types";

const READ_CAPABILITY_ID = "cap:read-context";
const WRITE_CAPABILITY_ID = "cap:write-context";
const SEARCH_CAPABILITY_ID = "cap:search";

function createTestRole(
    id = "role:test",
    capabilityIds: readonly CapabilityId[] = [READ_CAPABILITY_ID],
): RoleDefinition {
    const capabilities = capabilityIds.map((capabilityId) =>
        createCapability(
            capabilityId,
            capabilityId,
            `Capability ${capabilityId}`,
        ),
    );

    return createRole(id, id, `Role ${id}`, capabilities, []);
}

function createDescriptor(
    overrides: Partial<ExternalAgentDescriptor> = {},
): ExternalAgentDescriptor {
    return {
        id: "external-agent:1",
        nodeId: "agent:external-1",
        role: createTestRole(),
        capabilities: [READ_CAPABILITY_ID],
        status: "registered",
        metadata: { source: "test" },
        ...overrides,
    };
}

function expectRegistry(
    result: ReturnType<ExternalAgentRegistry["register"]>,
): ExternalAgentRegistry {
    expect(result.success).toBe(true);

    if (!result.success) {
        throw new Error(result.error.message);
    }

    return result.data;
}

function registerAgents(
    agents: readonly ExternalAgentDescriptor[],
): ExternalAgentRegistry {
    let registry = createExternalAgentRegistry();

    for (const agent of agents) {
        registry = expectRegistry(registry.register(agent));
    }

    return registry;
}

describe("external agents", () => {
    describe("createExternalAgentRegistry", () => {
        it("should register external agent", () => {
            const registry = createExternalAgentRegistry();
            const agent = createDescriptor();

            const result = registry.register(agent);

            const nextRegistry = expectRegistry(result);
            expect(registry.get(agent.id)).toBeUndefined();
            expect(nextRegistry.get(agent.id)).toEqual(agent);
            expect(nextRegistry.snapshot().totalAgents).toBe(1);
            expect(
                nextRegistry.snapshot().agentsByStatus.get("registered"),
            ).toBe(1);
        });

        it("should fail for duplicate ID", () => {
            const agent = createDescriptor();
            const registry = expectRegistry(
                createExternalAgentRegistry().register(agent),
            );

            const result = registry.register(agent);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("conflict");
            }
        });

        it("should lookup by ID and NodeId", () => {
            const firstAgent = createDescriptor();
            const secondAgent = createDescriptor({
                id: "external-agent:2",
                nodeId: "agent:external-2",
            });
            const registry = registerAgents([firstAgent, secondAgent]);

            expect(registry.get(firstAgent.id)).toEqual(firstAgent);
            expect(registry.get(secondAgent.id)).toEqual(secondAgent);
            expect(registry.getByNodeId(firstAgent.nodeId)).toEqual(firstAgent);
            expect(registry.getByNodeId(secondAgent.nodeId)).toEqual(
                secondAgent,
            );
            expect(registry.get("external-agent:missing")).toBeUndefined();
            expect(registry.getByNodeId("agent:missing")).toBeUndefined();
        });

        it("should update status", () => {
            const agent = createDescriptor();
            const registry = expectRegistry(
                createExternalAgentRegistry().register(agent),
            );

            const result = registry.update(agent.id, {
                status: "connected",
                connectionId: "connection:1",
            });

            const nextRegistry = expectRegistry(result);
            expect(registry.get(agent.id)?.status).toBe("registered");
            expect(nextRegistry.get(agent.id)?.status).toBe("connected");
            expect(nextRegistry.get(agent.id)?.connectionId).toBe(
                "connection:1",
            );
        });

        it("should filter by status, capability, role, and transport", () => {
            const researcherRole = createTestRole("role:researcher", [
                READ_CAPABILITY_ID,
                SEARCH_CAPABILITY_ID,
            ]);
            const writerRole = createTestRole("role:writer", [
                READ_CAPABILITY_ID,
                WRITE_CAPABILITY_ID,
            ]);
            const researcher = createDescriptor({
                id: "external-agent:researcher",
                nodeId: "agent:researcher",
                role: researcherRole,
                capabilities: [READ_CAPABILITY_ID, SEARCH_CAPABILITY_ID],
                transportId: "transport:http",
                status: "connected",
            });
            const writer = createDescriptor({
                id: "external-agent:writer",
                nodeId: "agent:writer",
                role: writerRole,
                capabilities: [READ_CAPABILITY_ID, WRITE_CAPABILITY_ID],
                transportId: "transport:websocket",
                status: "registered",
            });
            const offline = createDescriptor({
                id: "external-agent:offline",
                nodeId: "agent:offline",
                role: researcherRole,
                capabilities: [SEARCH_CAPABILITY_ID],
                transportId: "transport:http",
                status: "unavailable",
            });
            const registry = registerAgents([researcher, writer, offline]);

            expect(registry.list({ status: "connected" })).toEqual([
                researcher,
            ]);
            expect(
                registry.list({ capabilities: [SEARCH_CAPABILITY_ID] }),
            ).toEqual([researcher, offline]);
            expect(registry.list({ roleId: writerRole.id })).toEqual([writer]);
            expect(registry.list({ transportId: "transport:http" })).toEqual([
                researcher,
                offline,
            ]);
            expect(
                registry.list({
                    status: "connected",
                    capabilities: [READ_CAPABILITY_ID, SEARCH_CAPABILITY_ID],
                    roleId: researcherRole.id,
                    transportId: "transport:http",
                }),
            ).toEqual([researcher]);
        });

        it("should unregister and remove descriptor", () => {
            const agent = createDescriptor();
            const registry = expectRegistry(
                createExternalAgentRegistry().register(agent),
            );

            const result = registry.unregister(agent.id);

            const nextRegistry = expectRegistry(result);
            expect(registry.get(agent.id)).toEqual(agent);
            expect(nextRegistry.get(agent.id)).toBeUndefined();
            expect(nextRegistry.getByNodeId(agent.nodeId)).toBeUndefined();
            expect(nextRegistry.list()).toEqual([]);
        });
    });

    describe("toAgentNode", () => {
        it("should convert descriptor to AgentNode", () => {
            const role = createTestRole("role:external-agent");
            const descriptor = createDescriptor({
                nodeId: "agent:converted",
                metadata: { source: "external", version: 1 },
            });

            const node = toAgentNode(descriptor, role);

            expect(node.id).toBe(descriptor.nodeId);
            expect(node.kind).toBe("agent");
            expect(node.role).toBe(role);
            expect(node.metadata).toEqual(descriptor.metadata);
        });
    });
});
