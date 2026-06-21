import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    createDelegationRequest,
    createRequesterDescriptor,
    createRole,
    type DelegationRequest,
} from "@graph-context-protocol/core";
import {
    createFetchHandler,
    createStaticTokenAuthProvider,
    delegateRemoteTask,
    type Principal,
} from "@graph-context-protocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGcpNode } from "./gcp-node";

const TOKEN = "tok:caller";
const NODE = "knowledge:tasks";

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "deleg-node-"));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

function principal(capabilities: string[]): Principal {
    return {
        id: "principal:caller",
        role: createRole("role:caller", "Caller", ""),
        capabilities,
        metadata: {},
    };
}

async function buildNode(
    capabilities: string[],
    withExecutor: boolean,
): Promise<(req: Request) => Promise<Response>> {
    const filePath = join(dir, "tasks.md");
    writeFileSync(filePath, "# Tasks\n\nthe gated content", "utf8");
    const authProvider = createStaticTokenAuthProvider(
        new Map([[TOKEN, principal(capabilities)]]),
    );
    const server = await createGcpNode(
        {
            serverId: "server:tasks",
            nodeId: "node:tasks",
            knowledgeId: NODE,
            role: { id: "role:tasks-owner", name: "Owner", description: "" },
            accessPolicy: {
                readableByRoles: ["role:caller"],
                requiredCapabilities: [],
                fallbackAllowed: false,
                denialMode: "error",
            },
            knowledge: { filePath, tags: ["tasks"] },
        },
        {
            authProvider,
            ...(withExecutor
                ? { delegationExecutor: async (task) => `did: ${task}` }
                : {}),
        },
    );
    return createFetchHandler({ server });
}

function request(): DelegationRequest {
    return createDelegationRequest(
        "deleg:1",
        createRequesterDescriptor("principal:caller"),
        NODE,
        "process the queue",
    );
}

function fetchVia(handler: (req: Request) => Promise<Response>): typeof fetch {
    return (async (url, init) =>
        handler(new Request(String(url), init ?? undefined))) as typeof fetch;
}

describe("createGcpNode delegation wiring", () => {
    it("runs the executor and completes for a delegate-capable principal", async () => {
        const handler = await buildNode(["cap:delegate-task"], true);
        const result = await delegateRemoteTask({
            url: "http://gcp/tasks",
            request: request(),
            credentials: { type: "token", value: TOKEN },
            fetchImpl: fetchVia(handler),
        });
        expect(result.status).toBe("completed");
        expect(result.result).toBe("did: process the queue");
    });

    it("denies a principal lacking cap:delegate-task (no execution)", async () => {
        const handler = await buildNode([], true);
        const result = await delegateRemoteTask({
            url: "http://gcp/tasks",
            request: request(),
            credentials: { type: "token", value: TOKEN },
            fetchImpl: fetchVia(handler),
        });
        expect(result.status).toBe("denied");
    });

    it("returns error when no executor is wired even if authorized", async () => {
        const handler = await buildNode(["cap:delegate-task"], false);
        const result = await delegateRemoteTask({
            url: "http://gcp/tasks",
            request: request(),
            credentials: { type: "token", value: TOKEN },
            fetchImpl: fetchVia(handler),
        });
        expect(result.status).toBe("error");
    });
});
