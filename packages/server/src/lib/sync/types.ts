import type { Timestamp } from "@graph-context-protocol/core";
import type { KnowledgeSourceId } from "../types.js";
import type { ServerError } from "../errors.js";
import type { Result } from "@graph-context-protocol/core";

export type SyncStatus =
    | "idle"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";

export interface SyncRequest {
    readonly sourceId: KnowledgeSourceId;
    readonly mode: "full" | "incremental";
    readonly since?: Timestamp;
    readonly metadata: Record<string, unknown>;
}

export interface SyncResult {
    readonly sourceId: KnowledgeSourceId;
    readonly status: SyncStatus;
    readonly startedAt: Timestamp;
    readonly completedAt?: Timestamp;
    readonly nodesAdded: number;
    readonly nodesUpdated: number;
    readonly nodesRemoved: number;
    readonly errors: readonly ServerError[];
    readonly metadata: Record<string, unknown>;
}

export interface SyncOperation {
    readonly request: SyncRequest;
    readonly status: SyncStatus;
    readonly startedAt: Timestamp;
    readonly abortController: AbortController;
}

export interface SyncScheduler {
    run(request: SyncRequest): Promise<Result<SyncResult, ServerError>>;
    cancel(sourceId: KnowledgeSourceId): Promise<Result<void, ServerError>>;
    status(sourceId: KnowledgeSourceId): SyncStatus;
    list(): readonly KnowledgeSourceId[];
}
