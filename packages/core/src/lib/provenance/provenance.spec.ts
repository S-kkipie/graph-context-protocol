import { describe, expect, it } from "vitest";
import {
    createContextQueryResult,
    createReadProvenance,
    type ReadProvenance,
} from "../../index";

const TS = "2026-06-18T10:00:00.000Z";

describe("createReadProvenance", () => {
    it("builds an allow record with matched roles and capabilities", () => {
        const record: ReadProvenance = createReadProvenance(
            "principal:reader",
            "knowledge:ctx",
            "query:1",
            TS,
            "allow",
            {
                matchedRoles: ["role:reader"],
                matchedCapabilities: ["cap:read-context"],
            },
        );

        expect(record.principalId).toBe("principal:reader");
        expect(record.targetNodeId).toBe("knowledge:ctx");
        expect(record.queryId).toBe("query:1");
        expect(record.timestamp).toBe(TS);
        expect(record.decision).toBe("allow");
        expect(record.matchedRoles).toEqual(["role:reader"]);
        expect(record.matchedCapabilities).toEqual(["cap:read-context"]);
        expect(record.reason).toBeUndefined();
    });

    it("builds a deny record carrying a reason", () => {
        const record = createReadProvenance(
            "principal:intruder",
            "knowledge:ctx",
            "query:2",
            TS,
            "deny",
            { reason: "role not permitted" },
        );

        expect(record.decision).toBe("deny");
        expect(record.reason).toBe("role not permitted");
        expect(record.matchedRoles).toBeUndefined();
    });

    it("rejects a non-ISO timestamp", () => {
        expect(() =>
            createReadProvenance(
                "p",
                "knowledge:ctx",
                "q",
                "not-a-date",
                "allow",
            ),
        ).toThrow();
    });

    it("rejects an empty principal id", () => {
        expect(() =>
            createReadProvenance("", "knowledge:ctx", "q", TS, "deny"),
        ).toThrow();
    });
});

describe("ContextQueryResponse.provenance typing", () => {
    it("accepts and round-trips a typed read-provenance object", () => {
        const response = createContextQueryResult(
            "query:1",
            "ok",
            "knowledge:ctx",
            {},
            { answer: "hi" },
            undefined,
            {
                principalId: "principal:reader",
                targetNodeId: "knowledge:ctx",
                queryId: "query:1",
                timestamp: TS,
                decision: "allow",
            },
        );

        expect(response.provenance?.decision).toBe("allow");
        expect(response.provenance?.principalId).toBe("principal:reader");
    });

    it("stays back-compatible with the legacy source-of-truth shape", () => {
        const response = createContextQueryResult(
            "query:1",
            "ok",
            "knowledge:ctx",
            {},
            undefined,
            undefined,
            { sourceId: "knowledge:ctx", sourceOfTruth: { ownerId: "node:x" } },
        );

        expect(response.provenance?.sourceId).toBe("knowledge:ctx");
    });
});
