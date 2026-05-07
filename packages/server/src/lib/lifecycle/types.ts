/**
 * Server lifecycle types and validation schemas.
 *
 * @module lifecycle/types
 */

import {
    type Metadata,
    MetadataSchema,
    type NodeId,
    NodeIdSchema,
    type Result,
} from "@graph-context-protocol/core";
import { z } from "zod";
import type { ServerError } from "../errors.js";
import {
    type ServerId,
    ServerIdSchema,
    type ServerStatus,
    ServerStatusSchema,
} from "../types.js";

/**
 * Lifecycle phase executed during server startup and shutdown.
 */
export type LifecyclePhase =
    | "before-start"
    | "start"
    | "ready"
    | "before-stop"
    | "stop"
    | "after-stop";

/**
 * Zod schema for lifecycle phase validation.
 */
export const LifecyclePhaseSchema = z.enum([
    "before-start",
    "start",
    "ready",
    "before-stop",
    "stop",
    "after-stop",
]);

/**
 * Hook registered against a lifecycle phase.
 */
export interface LifecycleHook {
    /** Unique hook name. */
    readonly name: string;
    /** Phase where the hook should run. */
    readonly phase: LifecyclePhase;
    /** Executes the hook with lifecycle context. */
    run(context: LifecycleContext): Promise<Result<void, ServerError>>;
}

/**
 * Context passed to lifecycle hooks.
 */
export interface LifecycleContext {
    /** Server instance identifier. */
    readonly serverId: ServerId;
    /** Local graph node represented by the server. */
    readonly localNodeId: NodeId;
    /** Optional cancellation signal. */
    readonly signal?: AbortSignal;
    /** Additional lifecycle metadata. */
    readonly metadata: Metadata;
}

/**
 * Shutdown behavior options.
 */
export interface ShutdownOptions {
    /** Optional maximum time for each lifecycle hook. */
    readonly timeoutMs?: number;
    /** Whether the manager should enter draining status before stopping. */
    readonly drain?: boolean;
}

/**
 * Immutable lifecycle state snapshot.
 */
export interface LifecycleSnapshot {
    /** Current lifecycle status. */
    readonly status: ServerStatus;
    /** Number of registered hooks. */
    readonly hookCount: number;
    /** Registered hook names in registration order. */
    readonly registeredHooks: readonly string[];
}

/**
 * Coordinates lifecycle hooks and status transitions.
 */
export interface LifecycleManager {
    /** Current server status. */
    readonly status: ServerStatus;
    /** Registers a hook and returns a new manager instance. */
    register(hook: LifecycleHook): LifecycleManager;
    /** Starts the lifecycle through before-start, start, and ready phases. */
    start(
        context: LifecycleContext,
    ): Promise<Result<ServerStatus, ServerError>>;
    /** Stops the lifecycle through before-stop, stop, and after-stop phases. */
    stop(
        context: LifecycleContext,
        options?: ShutdownOptions,
    ): Promise<Result<ServerStatus, ServerError>>;
    /** Returns a read-only lifecycle snapshot. */
    snapshot(): LifecycleSnapshot;
}

/**
 * Zod schema for lifecycle hooks.
 */
export const LifecycleHookSchema = z.object({
    name: z.string().min(1),
    phase: LifecyclePhaseSchema,
    run: z.custom<LifecycleHook["run"]>((value) => typeof value === "function"),
});

/**
 * Zod schema for lifecycle context.
 */
export const LifecycleContextSchema = z.object({
    serverId: ServerIdSchema,
    localNodeId: NodeIdSchema,
    signal: z
        .custom<AbortSignal>(
            (value) =>
                typeof value === "object" &&
                value !== null &&
                "aborted" in value,
        )
        .optional(),
    metadata: MetadataSchema,
});

/**
 * Zod schema for shutdown options.
 */
export const ShutdownOptionsSchema = z.object({
    timeoutMs: z.number().int().positive().optional(),
    drain: z.boolean().optional(),
});

/**
 * Zod schema for lifecycle snapshots.
 */
export const LifecycleSnapshotSchema = z.object({
    status: ServerStatusSchema,
    hookCount: z.number().int().nonnegative(),
    registeredHooks: z.array(z.string().min(1)).readonly(),
});
