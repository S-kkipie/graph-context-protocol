import { marketplaceScenario } from "@graph-context-protocol/agent-core";
import { ChatOpenAI } from "@langchain/openai";
import { describe, expect, it, vi } from "vitest";
import { runScenario } from "./runner";

// A non-network model: construction only, never invoked in this test because
// we stub runTaskAgent. Proves the runner builds each arm without a key.
const model = new ChatOpenAI({ apiKey: "test-key", model: "x" });

vi.mock("@graph-context-protocol/agent-core", async (orig) => {
    const actual =
        await orig<typeof import("@graph-context-protocol/agent-core")>();
    return { ...actual, runTaskAgent: vi.fn(async () => "stub answer") };
});

describe("runScenario arm isolation", () => {
    it("runs the GCP arm and returns artifacts", async () => {
        const art = await runScenario({
            arm: "gcp",
            scenario: marketplaceScenario(2),
            model,
        });
        expect(art.answer).toBe("stub answer");
        expect(art.coupling).toBeDefined();
        expect(Array.isArray(art.toolTranscript)).toBe(true);
        expect(Array.isArray(art.auditEvents)).toBe(true);
        // GCP discovery: one substrate query resolves all peers (O(1)).
        expect(art.discovery.discoveryMessages).toBe(1);
        expect(art.discovery.peersDiscovered).toBe(2);
    });

    it("runs the A2A arm and closes its servers", async () => {
        const art = await runScenario({
            arm: "a2a",
            scenario: marketplaceScenario(2),
            model,
        });
        expect(art.answer).toBe("stub answer");
        // A2A arm has no GCP audit sink → no audit events.
        expect(art.auditEvents).toHaveLength(0);
        // A2A discovery: one real agent-card fetch per peer (O(N)); both live
        // express nodes served their card, so all peers resolved.
        expect(art.discovery.discoveryMessages).toBe(2);
        expect(art.discovery.peersDiscovered).toBe(2);
    });
});
