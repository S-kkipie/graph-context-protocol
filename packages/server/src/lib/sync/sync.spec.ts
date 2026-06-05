import { succeed } from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import type { KnowledgeSourceAdapter } from "../knowledge/types";
import { createSyncScheduler } from "./implementation";
import type { SyncRequest, SyncResult } from "./types";

function syncRequest(sourceId: string): SyncRequest {
    return { sourceId, mode: "full", metadata: {} };
}

function adapterWithSync(id: string): KnowledgeSourceAdapter {
    return {
        id,
        capabilities: ["search"],
        query: async () =>
            succeed({ sourceId: id, nodes: [], raw: {}, metadata: {} }),
        sync: async (request: SyncRequest) =>
            succeed<SyncResult>({
                sourceId: request.sourceId,
                status: "completed",
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                nodesAdded: 1,
                nodesUpdated: 0,
                nodesRemoved: 0,
                errors: [],
                metadata: {},
            }),
    } as unknown as KnowledgeSourceAdapter;
}

function adapterWithoutSync(id: string): KnowledgeSourceAdapter {
    return {
        id,
        capabilities: ["search"],
        query: async () =>
            succeed({ sourceId: id, nodes: [], raw: {}, metadata: {} }),
    } as unknown as KnowledgeSourceAdapter;
}

describe("createSyncScheduler", () => {
    it("fails run for an unknown source", async () => {
        const scheduler = createSyncScheduler();
        const result = await scheduler.run(syncRequest("src:unknown"));
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("not-found");
        }
    });

    it("fails run when the adapter does not support sync", async () => {
        const adapters = new Map([["src:a", adapterWithoutSync("src:a")]]);
        const scheduler = createSyncScheduler(adapters);
        const result = await scheduler.run(syncRequest("src:a"));
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("sync-error");
        }
    });

    it("runs a sync-capable adapter and returns its result", async () => {
        const adapters = new Map([["src:a", adapterWithSync("src:a")]]);
        const scheduler = createSyncScheduler(adapters);
        const result = await scheduler.run(syncRequest("src:a"));
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.status).toBe("completed");
            expect(result.data.nodesAdded).toBe(1);
        }
    });

    it("reports idle status and empty list before any operation", () => {
        const scheduler = createSyncScheduler();
        expect(scheduler.status("src:a")).toBe("idle");
        expect(scheduler.list()).toEqual([]);
    });

    it("fails cancel when no operation is tracked", async () => {
        const scheduler = createSyncScheduler();
        const result = await scheduler.cancel("src:a");
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("not-found");
        }
    });
});
