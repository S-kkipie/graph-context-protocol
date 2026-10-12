import { ClientFactory } from "@a2a-js/sdk/client";
import {
    type KnowledgeNodeDef,
    PROVIDE_CONTEXT_SKILL,
} from "@graph-context-protocol/agent-core";
import { afterEach, describe, expect, it } from "vitest";
import { type BaselineNodeHandle, createBaselineNode } from "./baseline-node";
import {
    createBearerClientFactory,
    createBearerUserBuilder,
    DELEGATE_CAPABILITY,
    type PepAuditRecord,
    PolicyEnforcingExecutor,
} from "./policy-enforcement";

const node: KnowledgeNodeDef = {
    nodeId: "knowledge:eng",
    content: "# Eng\n\nSECRET-BODY",
    tags: [],
    readableByRoles: ["role:eng"],
    exposedSkills: [PROVIDE_CONTEXT_SKILL],
};

const table = new Map([
    ["tok:eng", { principalId: "p:eng", role: "role:eng", capabilities: [] }],
    [
        "tok:eng-deleg",
        {
            principalId: "p:eng-deleg",
            role: "role:eng",
            capabilities: [DELEGATE_CAPABILITY],
        },
    ],
    [
        "tok:contractor",
        { principalId: "p:c", role: "role:contractor", capabilities: [] },
    ],
]);

let handle: BaselineNodeHandle | undefined;
afterEach(async () => {
    await handle?.close();
    handle = undefined;
});

async function boot(audit: PepAuditRecord[]): Promise<BaselineNodeHandle> {
    handle = await createBaselineNode(node, {
        userBuilder: createBearerUserBuilder(table),
        wrapExecutor: (inner) =>
            new PolicyEnforcingExecutor(inner, {
                nodeId: node.nodeId,
                readableByRoles: node.readableByRoles,
                audit: { record: (r) => audit.push(r) },
            }),
    });
    return handle;
}

async function ask(
    url: string,
    token: string | undefined,
    capability?: "read" | "delegate",
): Promise<string> {
    const factory = token
        ? createBearerClientFactory(token)()
        : new ClientFactory();
    const client = await factory.createFromUrl(url);
    const result = (await client.sendMessage({
        message: {
            kind: "message",
            messageId: crypto.randomUUID(),
            role: "user",
            parts: [{ kind: "text", text: "go" }],
            ...(capability ? { metadata: { capability } } : {}),
        },
    })) as { kind: string; artifacts?: { parts?: { text?: string }[] }[] };
    return result.artifacts?.[0]?.parts?.[0]?.text ?? "";
}

describe("PolicyEnforcingExecutor", () => {
    it("serves a permitted role and records an allow", async () => {
        const audit: PepAuditRecord[] = [];
        const h = await boot(audit);
        expect(await ask(h.url, "tok:eng")).toContain("SECRET-BODY");
        expect(audit.at(-1)).toMatchObject({
            principalId: "p:eng",
            decision: "allow",
        });
    });

    it("denies a role outside readableByRoles without running the executor", async () => {
        const audit: PepAuditRecord[] = [];
        const h = await boot(audit);
        const out = await ask(h.url, "tok:contractor");
        expect(out).toMatch(/^Peer context query denied/);
        expect(out).not.toContain("SECRET-BODY");
        expect(audit.at(-1)).toMatchObject({
            decision: "deny",
            reason: "role-not-readable",
        });
    });

    it("denies an unauthenticated caller (default deny)", async () => {
        const audit: PepAuditRecord[] = [];
        const h = await boot(audit);
        const out = await ask(h.url, undefined);
        expect(out).toMatch(/^Peer context query denied/);
        expect(audit.at(-1)).toMatchObject({
            principalId: "anonymous",
            reason: "unauthenticated",
        });
    });

    it("denies a delegation without the delegate capability, allows it with", async () => {
        const audit: PepAuditRecord[] = [];
        const h = await boot(audit);
        expect(await ask(h.url, "tok:eng", "delegate")).toMatch(
            /^Delegation denied/,
        );
        expect(audit.at(-1)).toMatchObject({ reason: "missing-capability" });
        expect(await ask(h.url, "tok:eng-deleg", "delegate")).toContain(
            "SECRET-BODY",
        );
    });
});
