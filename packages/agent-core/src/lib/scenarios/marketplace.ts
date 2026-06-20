/**
 * Marketplace scenario — coupling/scaling (Claim 1). One buyer agent gathers
 * offers from n seller knowledge nodes. The structural O(N^2)-vs-O(N) curve is
 * computed separately by the eval topology model; this is the behavioral task.
 *
 * @module scenarios/marketplace
 */

import { PROVIDE_CONTEXT_SKILL, type ScenarioDef } from "./types";

/** Builds a marketplace with `n` sellers; the last seller is the cheapest. */
export function marketplaceScenario(n: number): ScenarioDef {
    const count = Math.max(2, n);
    // Descending prices so the LAST seller is always the unique cheapest.
    const sellers = Array.from({ length: count }, (_v, i) => ({
        id: `s${i}`,
        price: 10 + (count - 1 - i),
    }));
    const cheapest = sellers[sellers.length - 1];
    return {
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
        succeeded: (answer: string): boolean =>
            new RegExp(cheapest.id, "i").test(answer) &&
            new RegExp(`${cheapest.price}`).test(answer),
        forbiddenCanaries: [],
    };
}

/** The default fixed 3-seller marketplace (back-compat). */
export const marketplace: ScenarioDef = marketplaceScenario(3);
