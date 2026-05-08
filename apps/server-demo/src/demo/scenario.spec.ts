import { describe, expect, it } from "vitest";
import { runServerScenario } from "./scenario";

describe("runServerScenario", () => {
    it("transitions server from idle to ready to stopped", async () => {
        const result = await runServerScenario();
        expect(result.serverStart.success).toBe(true);
        if (!result.serverStart.success) return;
        expect(result.serverStart.data.status).toBe("ready");
        expect(result.serverStop.success).toBe(true);
        if (!result.serverStop.success) return;
        expect(result.serverStop.data.status).toBe("stopped");
    });

    it("registers memory transport and captures an outbound external-agent message", async () => {
        const result = await runServerScenario();
        expect(result.capturedOutbound).toBeDefined();
        expect(result.capturedOutbound?.transportId).toBe("transport:memory");
        expect(result.capturedOutbound?.message.header.type).toBe(
            "notification",
        );
    });

    it("handles a local context-request and returns expected metadata", async () => {
        const result = await runServerScenario();
        expect(result.localHandle.success).toBe(true);
        if (!result.localHandle.success) return;
        const data = result.localHandle.data as {
            handled: boolean;
            metadata: Record<string, unknown>;
        };
        expect(data.handled).toBe(true);
        expect(data.metadata.source).toBe("handler:demo");
    });

    it("queries the demo knowledge source through the handler path", async () => {
        const result = await runServerScenario();
        expect(result.knowledgeResults.success).toBe(true);
        if (!result.knowledgeResults.success) return;
        expect(result.knowledgeResults.data).toHaveLength(1);
        expect(result.knowledgeResults.data[0].sourceId).toBe("knowledge:demo");
    });
});
