import { createContextQueryResult } from "@graph-context-protocol/core";
import type { QueryRemoteContextOptions } from "@graph-context-protocol/server";
import { describe, expect, it, vi } from "vitest";
import { createContextQueryTool } from "./context-query-tool.js";

describe("createContextQueryTool", () => {
    it("returns the peer context text on a successful ok response", async () => {
        const queryFn = vi.fn(async (_options: QueryRemoteContextOptions) =>
            createContextQueryResult(
                "query:x",
                "ok",
                "knowledge:executor-context",
                {},
                "PEER TASKS: do the thing",
            ),
        );

        const tool = createContextQueryTool({
            peerUrl: "http://executor.test/api/gcp",
            targetNodeId: "knowledge:executor-context",
            queryFn,
        });

        const output = await tool.invoke({ question: "what is pending?" });

        expect(queryFn).toHaveBeenCalledOnce();
        const arg = queryFn.mock.calls[0][0];
        expect(arg.url).toBe("http://executor.test/api/gcp");
        expect(arg.query.targetNodeId).toBe("knowledge:executor-context");
        expect(arg.query.query).toBe("what is pending?");
        expect(output).toBe("PEER TASKS: do the thing");
    });

    it("returns a graceful message when the peer is unreachable", async () => {
        const queryFn = vi.fn(async (_options: QueryRemoteContextOptions) => {
            throw new Error("ECONNREFUSED");
        });
        const tool = createContextQueryTool({
            peerUrl: "http://down.test/api/gcp",
            targetNodeId: "knowledge:executor-context",
            queryFn,
        });

        const output = await tool.invoke({ question: "status?" });
        expect(output).toContain("Failed to reach peer node");
        expect(output).toContain("ECONNREFUSED");
    });

    it("reports a non-ok status without throwing", async () => {
        const queryFn = vi.fn(async (_options: QueryRemoteContextOptions) =>
            createContextQueryResult(
                "query:x",
                "denied",
                "knowledge:executor-context",
                {},
                undefined,
                "policy says no",
            ),
        );
        const tool = createContextQueryTool({
            peerUrl: "http://executor.test/api/gcp",
            targetNodeId: "knowledge:executor-context",
            queryFn,
        });
        const output = await tool.invoke({ question: "x" });
        expect(output).toContain("denied");
        expect(output).toContain("policy says no");
    });
});
