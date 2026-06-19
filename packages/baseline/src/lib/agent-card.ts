/**
 * Builds an A2A AgentCard for a scenario node. Knowledge nodes advertise the
 * provide-context skill they expose (coarse card-declared allow/deny).
 *
 * @module agent-card
 */

import type { AgentCard } from "@a2a-js/sdk";
import {
    type AgentNodeDef,
    type KnowledgeNodeDef,
    PROVIDE_CONTEXT_SKILL,
} from "@graph-context-protocol/agent-core";

function isKnowledge(
    node: KnowledgeNodeDef | AgentNodeDef,
): node is KnowledgeNodeDef {
    return "content" in node;
}

/** Builds the AgentCard served at the node's well-known path. */
export function buildAgentCard(
    node: KnowledgeNodeDef | AgentNodeDef,
    url: string,
): AgentCard {
    const exposed = isKnowledge(node)
        ? node.exposedSkills
        : [PROVIDE_CONTEXT_SKILL];
    const skills = exposed.map((id) => ({
        id,
        name: id,
        description: `Skill ${id} exposed by ${node.nodeId}`,
        tags: [id],
    }));
    return {
        name: node.nodeId,
        description: `A2A baseline node ${node.nodeId}`,
        protocolVersion: "0.3.0",
        version: "0.1.0",
        url: `${url}/a2a/jsonrpc`,
        skills,
        capabilities: { pushNotifications: false },
        defaultInputModes: ["text"],
        defaultOutputModes: ["text"],
    };
}
