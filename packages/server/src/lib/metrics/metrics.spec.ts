import { describe, expect, it } from "vitest";
import { createCouplingMetrics } from "./implementation";

describe("createCouplingMetrics", () => {
    it("starts at zero", () => {
        expect(createCouplingMetrics().snapshot()).toEqual({
            peersKnown: 0,
            connectionsOpened: 0,
            messagesSent: 0,
        });
    });

    it("counts distinct peers contacted as connectionsOpened", () => {
        const m = createCouplingMetrics();
        m.recordPeerContacted("p1");
        m.recordPeerContacted("p1");
        m.recordPeerContacted("p2");
        expect(m.snapshot().connectionsOpened).toBe(2);
    });

    it("counts messages sent and tracks peers known", () => {
        const m = createCouplingMetrics();
        m.recordMessageSent();
        m.recordMessageSent();
        m.setPeersKnown(7);
        expect(m.snapshot().messagesSent).toBe(2);
        expect(m.snapshot().peersKnown).toBe(7);
    });
});
