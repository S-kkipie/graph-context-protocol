import type { ReadProvenance } from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { createInMemoryAuditSink } from "./implementation";

function record(decision: "allow" | "deny", id: string): ReadProvenance {
    return {
        principalId: id,
        targetNodeId: "knowledge:ctx",
        queryId: `q:${id}`,
        timestamp: "2026-06-18T10:00:00.000Z",
        decision,
    };
}

describe("createInMemoryAuditSink", () => {
    it("starts empty", () => {
        const sink = createInMemoryAuditSink();
        expect(sink.list()).toEqual([]);
    });

    it("records events in insertion order", () => {
        const sink = createInMemoryAuditSink();
        sink.record(record("allow", "a"));
        sink.record(record("deny", "b"));

        const all = sink.list();
        expect(all).toHaveLength(2);
        expect(all[0]?.principalId).toBe("a");
        expect(all[1]?.decision).toBe("deny");
    });

    it("returns a defensive copy from list()", () => {
        const sink = createInMemoryAuditSink();
        sink.record(record("allow", "a"));
        const snapshot = sink.list();
        (snapshot as ReadProvenance[]).push(record("deny", "x"));
        expect(sink.list()).toHaveLength(1);
    });
});
