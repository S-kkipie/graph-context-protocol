import { describe, expect, it } from "vitest";
import { PROVIDE_CONTEXT_SKILL, SCENARIOS } from "./index";
import { marketplaceScenario } from "./marketplace";

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
        // marketplaceScenario(3): sellers s0($12), s1($11), s2($10); cheapest is s2 at $10
        expect(s.succeeded("The cheapest is s2 at $10.")).toBe(true);
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

describe("marketplaceScenario(n)", () => {
    it("builds n sellers and a buyer that peers with all of them", () => {
        const s = marketplaceScenario(5);
        expect(s.knowledgeNodes).toHaveLength(5);
        expect(s.agent.peers).toHaveLength(5);
        expect(s.id).toBe("marketplace");
    });

    it("has a satisfiable cheapest-seller success predicate", () => {
        const s = marketplaceScenario(4);
        // cheapest seller id + its price both appear in a correct answer
        const cheapest = s.knowledgeNodes[s.knowledgeNodes.length - 1];
        const price = cheapest.content.match(/\$(\d+)/)?.[1];
        const id = cheapest.nodeId.split("-").pop();
        expect(s.succeeded(`cheapest is ${id} at $${price}`)).toBe(true);
        expect(s.succeeded("no idea")).toBe(false);
    });
});
