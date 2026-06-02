import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createMarkdownKnowledgeAdapter } from "./markdown-adapter";

const FIXTURE = fileURLToPath(
    new URL("./__fixtures__/sample.md", import.meta.url),
);

function knowledgeRequest() {
    return {
        requester: { id: "principal:test", capabilities: [], metadata: {} },
        query: { kinds: ["knowledge"] as const, filters: {} },
        metadata: {},
    };
}

describe("createMarkdownKnowledgeAdapter", () => {
    it("reads the markdown file and returns its text as raw content", async () => {
        const adapter = createMarkdownKnowledgeAdapter({
            id: "knowledge:executor-context",
            filePath: FIXTURE,
        });

        const result = await adapter.query(knowledgeRequest() as never);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.sourceId).toBe("knowledge:executor-context");
            expect(result.data.raw).toContain("DONE: deployed service A");
            expect(result.data.nodes).toHaveLength(1);
            expect(result.data.nodes[0].id).toBe("knowledge:executor-context");
        }
    });

    it("returns a not-found error when the file is missing", async () => {
        const adapter = createMarkdownKnowledgeAdapter({
            id: "knowledge:missing",
            filePath: "/no/such/file.md",
        });
        const result = await adapter.query(knowledgeRequest() as never);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("not-found");
        }
    });
});
