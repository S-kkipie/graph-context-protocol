import {
    type CouplingMetrics,
    createCouplingMetrics,
    type PeerRef,
} from "@graph-context-protocol/agent-core";
import { createDelegationResult } from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { createGcpDelegationToolFactory } from "./gcp-delegation-tool";

const peer: PeerRef = {
    peerId: "knowledge:target",
    targetNodeId: "knowledge:target",
    endpoint: "http://gcp/knowledge:target",
    credentials: { type: "token", value: "tok:agent" },
};

function metrics(): CouplingMetrics {
    return createCouplingMetrics();
}

describe("createGcpDelegationToolFactory", () => {
    it("names the tool delegate_task_to_peer__<node> and records a message", async () => {
        const m = metrics();
        const factory = createGcpDelegationToolFactory({
            delegateFn: async () =>
                createDelegationResult(
                    "deleg:1",
                    "completed",
                    "node:target",
                    {},
                    "task done",
                ),
        });
        const tool = factory(peer, m);
        expect(tool.name).toBe("delegate_task_to_peer__knowledge_target");
        const out = await tool.invoke({ task: "do it" });
        expect(out).toBe("task done");
        expect(m.snapshot().messagesSent).toBe(1);
    });

    it("returns a clear denial marker when the gate denies", async () => {
        const factory = createGcpDelegationToolFactory({
            delegateFn: async () =>
                createDelegationResult(
                    "deleg:1",
                    "denied",
                    "node:target",
                    {},
                    undefined,
                    "Missing delegation capability: cap:delegate-task",
                ),
        });
        const out = await factory(peer, metrics()).invoke({ task: "do it" });
        expect(out).toMatch(/^Delegation denied:/);
        expect(out).toContain("cap:delegate-task");
    });

    it("fails soft on transport error", async () => {
        const factory = createGcpDelegationToolFactory({
            delegateFn: async () => {
                throw new Error("boom");
            },
        });
        const out = await factory(peer, metrics()).invoke({ task: "do it" });
        expect(out).toContain("Failed to reach peer node");
    });
});
