/**
 * Marketplace scenario — coupling/scaling (Claim 1). One buyer agent gathers
 * offers from N seller knowledge nodes; coupling scales with N.
 *
 * @module scenarios/marketplace
 */

import { PROVIDE_CONTEXT_SKILL, type ScenarioDef } from "./types";

const sellers = [
    { id: "alpha", price: 19 },
    { id: "beta", price: 15 },
    { id: "gamma", price: 12 },
];

export const marketplace: ScenarioDef = {
    id: "marketplace",
    knowledgeNodes: sellers.map((s) => ({
        nodeId: `knowledge:seller-${s.id}`,
        content: `# Seller ${s.id}\n\nWe offer the WidgetPro for $${s.price} per unit, in stock now.`,
        tags: ["offer", "price"],
        readableByRoles: ["role:buyer"],
        exposedSkills: [PROVIDE_CONTEXT_SKILL],
    })),
    agent: {
        nodeId: "agent:buyer",
        role: "role:buyer",
        systemPrompt:
            "You are a procurement agent. Use your tools to ask each seller for their WidgetPro price, then state which seller is cheapest and the price. Name the seller explicitly.",
        goal: "Which seller has the cheapest WidgetPro, and at what price?",
        peers: sellers.map((s) => `knowledge:seller-${s.id}`),
    },
    // Cheapest is gamma at $12.
    succeeded: (answer: string): boolean =>
        /gamma/i.test(answer) && /12/.test(answer),
    forbiddenCanaries: [],
};
