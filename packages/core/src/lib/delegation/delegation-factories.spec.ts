import { describe, expect, it } from "vitest";
import { createRequesterDescriptor } from "../context/context-query-factories";
import {
    createDelegationRequest,
    createDelegationResult,
    DelegationRequestSchema,
    DelegationResultSchema,
} from "./delegation-factories";

describe("delegation contract", () => {
    const requester = createRequesterDescriptor(
        "principal:caller",
        ["role:agent"],
        ["cap:delegate-task"],
    );

    describe("createDelegationRequest", () => {
        it("defaults capabilityRequired to cap:delegate-task and round-trips fields", () => {
            const req = createDelegationRequest(
                "deleg:1",
                requester,
                "knowledge:target",
                "summarize the latest incident report",
            );

            expect(req.contractVersion).toBe("gcp-delegation-contract/v1");
            expect(req.delegationId).toBe("deleg:1");
            expect(req.targetNodeId).toBe("knowledge:target");
            expect(req.task).toBe("summarize the latest incident report");
            expect(req.capabilityRequired).toBe("cap:delegate-task");
            expect(req.requester.principalId).toBe("principal:caller");
        });

        it("accepts an explicit capabilityRequired override", () => {
            const req = createDelegationRequest(
                "deleg:2",
                requester,
                "knowledge:target",
                "do the thing",
                "cap:write-context",
            );
            expect(req.capabilityRequired).toBe("cap:write-context");
        });

        it("rejects an empty task", () => {
            expect(() =>
                createDelegationRequest(
                    "deleg:3",
                    requester,
                    "knowledge:target",
                    "",
                ),
            ).toThrow();
        });
    });

    describe("DelegationRequestSchema", () => {
        it("rejects a payload missing task", () => {
            const result = DelegationRequestSchema.safeParse({
                contractVersion: "gcp-delegation-contract/v1",
                delegationId: "deleg:4",
                requester,
                targetNodeId: "knowledge:target",
                capabilityRequired: "cap:delegate-task",
                metadata: {},
            });
            expect(result.success).toBe(false);
        });
    });

    describe("createDelegationResult", () => {
        it("builds a completed result carrying the agent output", () => {
            const res = createDelegationResult(
                "deleg:1",
                "completed",
                "node:executor",
                {},
                "the incident was resolved",
            );
            expect(res.status).toBe("completed");
            expect(res.result).toBe("the incident was resolved");
            expect(res.sourceNodeId).toBe("node:executor");
            expect(res.contractVersion).toBe("gcp-delegation-contract/v1");
        });

        it("builds a denied result carrying a reason in error", () => {
            const res = createDelegationResult(
                "deleg:1",
                "denied",
                "node:executor",
                {},
                undefined,
                "missing cap:delegate-task",
            );
            expect(res.status).toBe("denied");
            expect(res.result).toBeUndefined();
            expect(res.error).toBe("missing cap:delegate-task");
        });

        it("round-trips through DelegationResultSchema", () => {
            const res = createDelegationResult(
                "deleg:1",
                "completed",
                "node:executor",
                {},
                "done",
            );
            expect(DelegationResultSchema.safeParse(res).success).toBe(true);
        });
    });
});
