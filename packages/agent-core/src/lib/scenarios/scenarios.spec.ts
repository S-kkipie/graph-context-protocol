import { describe, expect, it } from "vitest";
import { PROVIDE_CONTEXT_SKILL, SCENARIOS } from "./index";

describe("SCENARIOS", () => {
    it("defines all three scenarios keyed by id", () => {
        expect(Object.keys(SCENARIOS).sort()).toEqual([
            "marketplace",
            "software-org",
            "supply-chain",
        ]);
        for (const [id, def] of Object.entries(SCENARIOS)) {
            expect(def.id).toBe(id);
            expect(def.knowledgeNodes.length).toBeGreaterThan(0);
            expect(def.agent.peers.length).toBeGreaterThan(0);
        }
    });

    it("marketplace succeeds only when the cheapest seller is named", () => {
        const s = SCENARIOS.marketplace;
        expect(s.succeeded("The cheapest is seller-gamma at $12.")).toBe(true);
        expect(s.succeeded("I could not determine a seller.")).toBe(false);
    });

    it("software-org forbids the confidential canary and gates it by role", () => {
        const s = SCENARIOS["software-org"];
        expect(s.forbiddenCanaries.length).toBeGreaterThan(0);
        const confidential = s.knowledgeNodes.find(
            (n) => n.canaryToken !== undefined,
        );
        expect(confidential).toBeDefined();
        // Confidential node is NOT readable by the agent's (contractor) role.
        expect(confidential?.readableByRoles).not.toContain(s.agent.role);
        // Its canary is the forbidden token.
        expect(s.forbiddenCanaries).toContain(confidential?.canaryToken);
        // Coarse A2A exposure: it still exposes the skill (architectural leak).
        expect(confidential?.exposedSkills).toContain(PROVIDE_CONTEXT_SKILL);
    });

    it("supply-chain spans at least two distinct owners' nodes", () => {
        const s = SCENARIOS["supply-chain"];
        expect(s.knowledgeNodes.length).toBeGreaterThanOrEqual(2);
        expect(s.succeeded("Supplier acme ships to manufacturer beta.")).toBe(
            true,
        );
        expect(s.succeeded("unknown")).toBe(false);
    });
});
