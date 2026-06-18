import { fileURLToPath } from "node:url";
import {
    createContextQuery,
    createRequesterDescriptor,
    createRole,
} from "@graph-context-protocol/core";
import {
    type AuditSink,
    type Credentials,
    createFetchHandler,
    createInMemoryAuditSink,
    createStaticTokenAuthProvider,
    type Principal,
    queryRemoteContext,
} from "@graph-context-protocol/server";
import { describe, expect, it } from "vitest";
import { createGcpNode } from "./gcp-node";

const FIXTURE = fileURLToPath(
    new URL("./__fixtures__/context.md", import.meta.url),
);

const PEER_TOKEN = "tok:peer";
const peerPrincipal: Principal = {
    id: "principal:peer",
    role: createRole("role:peer", "Peer", "Authorized peer reader"),
    capabilities: [],
    metadata: {},
};

async function buildGatedNode(audit: AuditSink) {
    const authProvider = createStaticTokenAuthProvider(
        new Map([[PEER_TOKEN, peerPrincipal]]),
    );
    const server = await createGcpNode(
        {
            serverId: "server:gated",
            nodeId: "node:gated",
            knowledgeId: "knowledge:gated-context",
            role: {
                id: "role:gated-context",
                name: "Gated Context",
                description: "Role-gated context node",
            },
            accessPolicy: {
                readableByRoles: ["role:peer"],
                requiredCapabilities: [],
                fallbackAllowed: false,
                denialMode: "error",
            },
            knowledge: { filePath: FIXTURE, tags: ["tasks"] },
        },
        { authProvider, auditSink: audit },
    );
    const handler = createFetchHandler({ server });
    const fetchImpl: typeof fetch = async (_url, init) =>
        handler(new Request("http://node/gated", init ?? undefined));
    return { fetchImpl };
}

function query(principalId: string) {
    return createContextQuery(
        `query:${principalId}`,
        createRequesterDescriptor(principalId),
        "knowledge:gated-context",
        "text",
        "what is the status?",
    );
}

describe("role-gated context node", () => {
    it("allows an authenticated, authorized peer and records an allow", async () => {
        const audit = createInMemoryAuditSink();
        const { fetchImpl } = await buildGatedNode(audit);
        const credentials: Credentials = { type: "token", value: PEER_TOKEN };

        const result = await queryRemoteContext({
            url: "http://node/gated",
            query: query("principal:peer"),
            credentials,
            fetchImpl,
        });

        expect(result.status).toBe("ok");
        const records = audit.list();
        expect(records.some((r) => r.decision === "allow")).toBe(true);
    });

    it("denies an anonymous principal and records a deny", async () => {
        const audit = createInMemoryAuditSink();
        const { fetchImpl } = await buildGatedNode(audit);

        const result = await queryRemoteContext({
            url: "http://node/gated",
            query: query("principal:anon"),
            // No credentials → defaults to anonymous → token auth fails.
            fetchImpl,
        });

        expect(result.status).toBe("denied");
        const records = audit.list();
        expect(records).toHaveLength(1);
        expect(records[0]?.decision).toBe("deny");
    });

    it("denies a wrong-role principal and records a deny", async () => {
        const audit = createInMemoryAuditSink();
        const wrongRoleProvider = createStaticTokenAuthProvider(
            new Map([
                [
                    "tok:wrong",
                    {
                        id: "principal:wrong",
                        role: createRole("role:wrong", "Wrong", ""),
                        capabilities: [],
                        metadata: {},
                    } satisfies Principal,
                ],
            ]),
        );
        const server = await createGcpNode(
            {
                serverId: "server:gated2",
                nodeId: "node:gated2",
                knowledgeId: "knowledge:gated2",
                role: {
                    id: "role:gated2",
                    name: "Gated",
                    description: "d",
                },
                accessPolicy: {
                    readableByRoles: ["role:peer"],
                    requiredCapabilities: [],
                    fallbackAllowed: false,
                    denialMode: "error",
                },
                knowledge: { filePath: FIXTURE, tags: ["tasks"] },
            },
            { authProvider: wrongRoleProvider, auditSink: audit },
        );
        const handler = createFetchHandler({ server });
        const fetchImpl: typeof fetch = async (_url, init) =>
            handler(new Request("http://node/gated2", init ?? undefined));

        const result = await queryRemoteContext({
            url: "http://node/gated2",
            query: createContextQuery(
                "query:wrong",
                createRequesterDescriptor("principal:wrong"),
                "knowledge:gated2",
                "text",
                "status?",
            ),
            credentials: { type: "token", value: "tok:wrong" },
            fetchImpl,
        });

        expect(result.status).toBe("denied");
        expect(audit.list().some((r) => r.decision === "deny")).toBe(true);
    });
});
