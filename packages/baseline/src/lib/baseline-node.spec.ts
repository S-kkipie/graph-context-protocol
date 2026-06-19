import { ClientFactory } from "@a2a-js/sdk/client";
import {
    type KnowledgeNodeDef,
    PROVIDE_CONTEXT_SKILL,
} from "@graph-context-protocol/agent-core";
import { afterEach, describe, expect, it } from "vitest";
import { type BaselineNodeHandle, createBaselineNode } from "./baseline-node";

const exposed: KnowledgeNodeDef = {
    nodeId: "knowledge:seller-gamma",
    content: "# Seller gamma\n\nWidgetPro $12.",
    tags: ["offer"],
    readableByRoles: ["role:buyer"],
    exposedSkills: [PROVIDE_CONTEXT_SKILL],
};

const hidden: KnowledgeNodeDef = {
    ...exposed,
    nodeId: "knowledge:secret",
    content: "# secret\n\nhidden body",
    exposedSkills: [],
};

let handles: BaselineNodeHandle[] = [];
afterEach(async () => {
    await Promise.all(handles.map((h) => h.close()));
    handles = [];
});

async function ask(handle: BaselineNodeHandle, text: string): Promise<string> {
    const client = await new ClientFactory().createFromUrl(handle.url);
    const result = await client.sendMessage({
        message: {
            kind: "message",
            messageId: crypto.randomUUID(),
            role: "user",
            parts: [{ kind: "text", text }],
        },
    });
    if (result.kind === "task") {
        const artifact = result.artifacts?.[0];
        const part = artifact?.parts?.[0];
        return part && "text" in part ? (part.text ?? "") : "";
    }
    const part = result.parts?.[0];
    return part && "text" in part ? (part.text ?? "") : "";
}

describe("createBaselineNode (knowledge node)", () => {
    it("serves an agent card at the well-known path", async () => {
        const h = await createBaselineNode(exposed);
        handles.push(h);
        const res = await fetch(`${h.url}/.well-known/agent-card.json`);
        expect(res.ok).toBe(true);
        const card = (await res.json()) as { name: string };
        expect(card.name).toContain("seller-gamma");
    });

    it("returns its content when the skill is exposed", async () => {
        const h = await createBaselineNode(exposed);
        handles.push(h);
        const answer = await ask(h, "what is your price?");
        expect(answer).toContain("$12");
    });

    it("refuses when the skill is not exposed (coarse allow/deny)", async () => {
        const h = await createBaselineNode(hidden);
        handles.push(h);
        const answer = await ask(h, "what is your secret?");
        expect(answer.toLowerCase()).toContain("not available");
        expect(answer).not.toContain("hidden body");
    });
});
