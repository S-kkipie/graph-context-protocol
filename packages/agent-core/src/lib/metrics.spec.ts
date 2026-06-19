import { describe, expect, it } from "vitest";
import { createCouplingMetrics } from "./metrics";

describe("createCouplingMetrics", () => {
    it("dedupes peers contacted into connectionsOpened", () => {
        const m = createCouplingMetrics();
        m.recordPeerContacted("peer:a");
        m.recordPeerContacted("peer:a");
        m.recordPeerContacted("peer:b");
        expect(m.snapshot().connectionsOpened).toBe(2);
    });

    it("counts every message sent and reports peers known", () => {
        const m = createCouplingMetrics();
        m.setPeersKnown(5);
        m.recordMessageSent();
        m.recordMessageSent();
        const snap = m.snapshot();
        expect(snap.messagesSent).toBe(2);
        expect(snap.peersKnown).toBe(5);
        expect(snap.connectionsOpened).toBe(0);
    });
});
