import { describe, expect, it } from "vitest";
import { provenanceCompleteness } from "./provenance";

const base = {
    answer: "",
    coupling: { peersKnown: 0, connectionsOpened: 0, messagesSent: 0 },
    toolTranscript: [],
    discovery: { discoveryMessages: 0, peersDiscovered: 0 },
};

describe("provenanceCompleteness", () => {
    it("is 1.0 when every read decision was audited (GCP)", () => {
        const art = { ...base, auditEvents: [{}, {}, {}] as never };
        expect(provenanceCompleteness(art, 3)).toBe(1);
    });
    it("is 0 when nothing was audited (A2A)", () => {
        const art = { ...base, auditEvents: [] as never };
        expect(provenanceCompleteness(art, 3)).toBe(0);
    });
    it("is 1.0 vacuously when there were no read decisions", () => {
        const art = { ...base, auditEvents: [] as never };
        expect(provenanceCompleteness(art, 0)).toBe(1);
    });
});
