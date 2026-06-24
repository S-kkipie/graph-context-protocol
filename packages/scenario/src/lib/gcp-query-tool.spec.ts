import { createCouplingMetrics } from "@graph-context-protocol/agent-core";
import type { queryRemoteContext } from "@graph-context-protocol/server";
import { describe, expect, it } from "vitest";
import { createGcpQueryToolFactory } from "./gcp-query-tool";

const okQuery: typeof queryRemoteContext = async () =>
    ({
        queryId: "q:1",
        status: "ok",
        sourceNodeId: "node:x",
        result: "remote answer",
    }) as Awaited<ReturnType<typeof queryRemoteContext>>;

describe("createGcpQueryToolFactory", () => {
    it("exposes ONE tool that reaches every node by id", () => {
        const metrics = createCouplingMetrics();
        const tool = createGcpQueryToolFactory({
            resolveEndpoint: () => "http://substrate",
            queryFn: okQuery,
        })(metrics);
        expect(tool.name).toBe("query_context");
    });

    it("resolves the endpoint from the target id and records one message", async () => {
        const seen: string[] = [];
        const spyQuery: typeof queryRemoteContext = async (o) => {
            seen.push(o.url);
            return okQuery(o);
        };
        const metrics = createCouplingMetrics();
        const tool = createGcpQueryToolFactory({
            resolveEndpoint: (id) => `http://graph/${id}`,
            queryFn: spyQuery,
        })(metrics);

        const out = await tool.invoke({
            targetNodeId: "knowledge:seller-s2",
            question: "price?",
        });

        expect(out).toBe("remote answer");
        expect(seen).toEqual(["http://graph/knowledge:seller-s2"]);
        const snap = metrics.snapshot();
        expect(snap.connectionsOpened).toBe(1);
        expect(snap.messagesSent).toBe(1);
    });

    it("fails soft when the id is not in the graph (no message recorded)", async () => {
        const metrics = createCouplingMetrics();
        const tool = createGcpQueryToolFactory({
            resolveEndpoint: () => undefined,
            queryFn: okQuery,
        })(metrics);

        const out = await tool.invoke({
            targetNodeId: "knowledge:missing",
            question: "?",
        });

        expect(out).toContain("No node");
        expect(metrics.snapshot().messagesSent).toBe(0);
    });

    it("fails soft on transport error", async () => {
        const boomQuery: typeof queryRemoteContext = async () => {
            throw new Error("boom");
        };
        const metrics = createCouplingMetrics();
        const tool = createGcpQueryToolFactory({
            resolveEndpoint: () => "http://substrate",
            queryFn: boomQuery,
        })(metrics);

        const out = await tool.invoke({ targetNodeId: "x", question: "?" });
        expect(out).toContain("Failed to reach peer node");
    });
});
