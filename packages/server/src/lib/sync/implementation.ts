import { fail, type Result, succeed } from "@graph-context-protocol/core";
import type { ServerError } from "../errors.js";
import { createServerError } from "../errors.js";
import type { KnowledgeSourceAdapter } from "../knowledge/types.js";
import type { KnowledgeSourceId } from "../types.js";
import type {
    SyncOperation,
    SyncRequest,
    SyncResult,
    SyncScheduler,
    SyncStatus,
} from "./types.js";

interface SyncSchedulerState {
    readonly operations: ReadonlyMap<KnowledgeSourceId, SyncOperation>;
    readonly adapters: ReadonlyMap<KnowledgeSourceId, KnowledgeSourceAdapter>;
}

class SyncSchedulerImpl implements SyncScheduler {
    private readonly state: SyncSchedulerState;

    constructor(state: SyncSchedulerState) {
        this.state = state;
    }

    async run(request: SyncRequest): Promise<Result<SyncResult, ServerError>> {
        const adapter = this.state.adapters.get(request.sourceId);
        if (!adapter) {
            return fail(
                createServerError(
                    "not-found",
                    `Knowledge source "${request.sourceId}" not found`,
                ),
            );
        }

        if (!adapter.sync) {
            return fail(
                createServerError(
                    "sync-error",
                    `Knowledge source "${request.sourceId}" does not support sync`,
                ),
            );
        }

        const existingOp = this.state.operations.get(request.sourceId);
        if (existingOp && existingOp.status === "running") {
            return fail(
                createServerError(
                    "conflict",
                    `Sync already running for "${request.sourceId}"`,
                ),
            );
        }

        const startedAt = new Date().toISOString();

        try {
            const result = await adapter.sync(request);

            if (!result.success) {
                const failedResult: SyncResult = {
                    sourceId: request.sourceId,
                    status: "failed",
                    startedAt,
                    completedAt: new Date().toISOString(),
                    nodesAdded: 0,
                    nodesUpdated: 0,
                    nodesRemoved: 0,
                    errors: [result.error],
                    metadata: {},
                };
                return succeed(failedResult);
            }

            return succeed(result.data);
        } catch (error) {
            const failedResult: SyncResult = {
                sourceId: request.sourceId,
                status: "failed",
                startedAt,
                completedAt: new Date().toISOString(),
                nodesAdded: 0,
                nodesUpdated: 0,
                nodesRemoved: 0,
                errors: [
                    createServerError("sync-error", "Sync operation failed", {
                        cause: error,
                    }),
                ],
                metadata: {},
            };
            return succeed(failedResult);
        }
    }

    async cancel(
        sourceId: KnowledgeSourceId,
    ): Promise<Result<void, ServerError>> {
        const operation = this.state.operations.get(sourceId);
        if (!operation) {
            return fail(
                createServerError(
                    "not-found",
                    `No running sync for "${sourceId}"`,
                ),
            );
        }

        if (operation.status !== "running") {
            return fail(
                createServerError(
                    "lifecycle-error",
                    `Sync for "${sourceId}" is not running`,
                ),
            );
        }

        operation.abortController.abort();
        return succeed(undefined);
    }

    status(sourceId: KnowledgeSourceId): SyncStatus {
        const operation = this.state.operations.get(sourceId);
        return operation?.status || "idle";
    }

    list(): readonly KnowledgeSourceId[] {
        return Array.from(this.state.operations.keys());
    }
}

export function createSyncScheduler(
    adapters: ReadonlyMap<
        KnowledgeSourceId,
        KnowledgeSourceAdapter
    > = new Map(),
): SyncScheduler {
    return new SyncSchedulerImpl({
        operations: new Map(),
        adapters,
    });
}
