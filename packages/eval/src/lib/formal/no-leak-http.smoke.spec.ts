/**
 * Single end-to-end HTTP smoke for the no-leak guarantee over the real transport
 * (createGcpNode + fetch handler + queryRemoteContext) — the exact path the
 * paper's canary metric measured. One authorized read returns the secret; one
 * unauthorized read is denied and the secret never appears. (Lives in eval to
 * avoid a server→scenario package cycle.)
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    createContextQuery,
    createRequesterDescriptor,
    createRole,
} from "@graph-context-protocol/core";
import { createGcpNode } from "@graph-context-protocol/scenario";
import {
    createFetchHandler,
    createInMemoryAuditSink,
    createStaticTokenAuthProvider,
    type Principal,
    queryRemoteContext,
} from "@graph-context-protocol/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SECRET = "SECRET-HTTP-9d41b7-DO-NOT-LEAK";
const KNOWLEDGE_ID = "knowledge:http";
const SERVER_URL = "http://gcp/http-smoke";

let dir: string;
let fetchImpl: typeof fetch;

beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "m6-http-"));
    const filePath = join(dir, "secret.md");
    writeFileSync(filePath, `# secret\n\n${SECRET}\n`, "utf8");

    const allowedPrincipal: Principal = {
        id: "principal:allowed",
        role: createRole("role:allowed", "allowed", ""),
        capabilities: [],
        metadata: {},
    };
    const deniedPrincipal: Principal = {
        id: "principal:denied",
        role: createRole("role:denied", "denied", ""),
        capabilities: [],
        metadata: {},
    };
    const authProvider = createStaticTokenAuthProvider(
        new Map([
            ["tok:allowed", allowedPrincipal],
            ["tok:denied", deniedPrincipal],
        ]),
    );

    const server = await createGcpNode(
        {
            serverId: "server:http",
            nodeId: "node:http",
            knowledgeId: KNOWLEDGE_ID,
            role: { id: "role:allowed", name: "allowed", description: "" },
            accessPolicy: {
                readableByRoles: ["role:allowed"],
                requiredCapabilities: [],
                fallbackAllowed: false,
                denialMode: "error",
            },
            knowledge: { filePath, tags: ["secret"] },
        },
        { authProvider, auditSink: createInMemoryAuditSink() },
    );
    const handler = createFetchHandler({ server });
    fetchImpl = (async (url, init) =>
        handler(new Request(String(url), init ?? undefined))) as typeof fetch;
});

afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});

function makeQuery() {
    return createContextQuery(
        `query:${KNOWLEDGE_ID}`,
        createRequesterDescriptor("p:req"),
        KNOWLEDGE_ID,
        "text",
        "give me everything",
    );
}

describe("no-leak HTTP smoke", () => {
    it("authorized principal reads the secret over HTTP", async () => {
        const result = await queryRemoteContext({
            query: makeQuery(),
            credentials: { type: "token", value: "tok:allowed", metadata: {} },
            url: SERVER_URL,
            fetchImpl,
        });
        expect(JSON.stringify(result)).toContain(SECRET);
    });

    it("unauthorized principal is denied and never sees the secret", async () => {
        const result = await queryRemoteContext({
            query: makeQuery(),
            credentials: { type: "token", value: "tok:denied", metadata: {} },
            url: SERVER_URL,
            fetchImpl,
        });
        expect(result.status).toBe("denied");
        expect(JSON.stringify(result)).not.toContain(SECRET);
    });
});
