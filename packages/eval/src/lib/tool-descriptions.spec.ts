import { createCouplingMetrics } from "@graph-context-protocol/agent-core";
import { createA2aPeerContextToolFactory } from "@graph-context-protocol/baseline";
import { createGcpPeerContextToolFactory } from "@graph-context-protocol/scenario";
import { describe, expect, it } from "vitest";
import { applyToolDescriptions } from "./tool-descriptions";

const peer = {
    peerId: "knowledge:x",
    targetNodeId: "knowledge:x",
    endpoint: "http://localhost:1",
};

describe("applyToolDescriptions", () => {
    const m = () => createCouplingMetrics();
    const gcp = createGcpPeerContextToolFactory();
    const a2a = createA2aPeerContextToolFactory();

    it("leaves tools unchanged for native", () => {
        const t = applyToolDescriptions("native", "gcp", gcp)(peer, m());
        expect(t.description).toBe(gcp(peer, m()).description);
        expect(applyToolDescriptions(undefined, "a2a", a2a)).toBe(a2a);
    });

    it("gives each arm the other protocol's wording, keeping name and schema", () => {
        const g = applyToolDescriptions("swapped", "gcp", gcp)(peer, m());
        const a = applyToolDescriptions("swapped", "a2a-pep", a2a)(peer, m());
        expect(g.description).toBe(a2a(peer, m()).description);
        expect(a.description).toBe(gcp(peer, m()).description);
        expect(g.name).toBe(gcp(peer, m()).name);
        expect(a.name).toBe(a2a(peer, m()).name);
        expect(g.description).not.toBe(gcp(peer, m()).description);
    });
});
