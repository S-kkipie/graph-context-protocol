/**
 * Server lifecycle manager implementation.
 *
 * @module lifecycle/implementation
 */

import type { Result } from "@graph-context-protocol/core";
import { createServerError, type ServerError } from "../errors";
import type { ServerStatus } from "../types";
import { ServerStatusSchema } from "../types";
import {
    type LifecycleContext,
    LifecycleContextSchema,
    type LifecycleHook,
    LifecycleHookSchema,
    type LifecycleManager,
    type LifecyclePhase,
    type ShutdownOptions,
    ShutdownOptionsSchema,
} from "./types";

const START_PHASES: readonly LifecyclePhase[] = [
    "before-start",
    "start",
    "ready",
];

const STOP_PHASES: readonly LifecyclePhase[] = [
    "before-stop",
    "stop",
    "after-stop",
];

/**
 * Creates a lifecycle manager.
 *
 * @param initialStatus - Initial server lifecycle status
 * @returns A lifecycle manager with immutable hook registration
 * @throws {z.ZodError} If the initial status is invalid
 *
 * @example
 * ```typescript
 * const manager = createLifecycleManager()
 *   .register({ name: "db", phase: "start", run: connect });
 * const result = await manager.start(context);
 * ```
 */
export function createLifecycleManager(
    initialStatus: ServerStatus = "idle",
): LifecycleManager {
    const status = ServerStatusSchema.parse(initialStatus);
    return createLifecycleManagerWithHooks(status, []);
}

function createLifecycleManagerWithHooks(
    initialStatus: ServerStatus,
    hooks: readonly LifecycleHook[],
): LifecycleManager {
    let currentStatus = initialStatus;
    const registeredHooks = [...hooks];

    return {
        get status() {
            return currentStatus;
        },

        register(hook: LifecycleHook): LifecycleManager {
            const parsedHook = LifecycleHookSchema.parse(hook);
            if (
                registeredHooks.some(
                    (registeredHook) => registeredHook.name === parsedHook.name,
                )
            ) {
                throw toError(
                    createServerError(
                        "conflict",
                        `Lifecycle hook already registered: ${parsedHook.name}`,
                        { metadata: { hookName: parsedHook.name } },
                    ),
                );
            }

            return createLifecycleManagerWithHooks(currentStatus, [
                ...registeredHooks,
                parsedHook,
            ]);
        },

        async start(
            context: LifecycleContext,
        ): Promise<Result<ServerStatus, ServerError>> {
            const parsedContext = LifecycleContextSchema.parse(context);

            if (currentStatus === "ready") {
                return succeedStatus(currentStatus);
            }

            if (currentStatus !== "idle" && currentStatus !== "stopped") {
                return failStatus(
                    createServerError(
                        "lifecycle-error",
                        `Cannot start lifecycle from status: ${currentStatus}`,
                        { metadata: { status: currentStatus } },
                    ),
                );
            }

            currentStatus = "starting";

            for (const phase of START_PHASES) {
                if (phase === "ready") {
                    currentStatus = "ready";
                }

                const result = await runPhase(
                    registeredHooks,
                    phase,
                    parsedContext,
                );
                if (!result.success) {
                    currentStatus = "failed";
                    return result;
                }
            }

            currentStatus = "ready";
            return succeedStatus(currentStatus);
        },

        async stop(
            context: LifecycleContext,
            options: ShutdownOptions = {},
        ): Promise<Result<ServerStatus, ServerError>> {
            const parsedContext = LifecycleContextSchema.parse(context);
            const parsedOptions = ShutdownOptionsSchema.parse(options);

            if (currentStatus === "stopped") {
                return succeedStatus(currentStatus);
            }

            if (currentStatus === "idle") {
                currentStatus = "stopped";
                return succeedStatus(currentStatus);
            }

            currentStatus =
                parsedOptions.drain === false ? "stopping" : "draining";

            for (const phase of STOP_PHASES) {
                if (phase === "stop") {
                    currentStatus = "stopping";
                }

                if (phase === "after-stop") {
                    currentStatus = "stopped";
                }

                const result = await runPhase(
                    registeredHooks,
                    phase,
                    parsedContext,
                    parsedOptions.timeoutMs,
                );
                if (!result.success) {
                    currentStatus = "failed";
                    return result;
                }
            }

            currentStatus = "stopped";
            return succeedStatus(currentStatus);
        },

        snapshot() {
            return {
                status: currentStatus,
                hookCount: registeredHooks.length,
                registeredHooks: registeredHooks.map((hook) => hook.name),
            };
        },
    };
}

async function runPhase(
    hooks: readonly LifecycleHook[],
    phase: LifecyclePhase,
    context: LifecycleContext,
    timeoutMs?: number,
): Promise<Result<ServerStatus, ServerError>> {
    for (const hook of hooks.filter((item) => item.phase === phase)) {
        if (context.signal?.aborted) {
            return failStatus(
                createServerError(
                    "lifecycle-error",
                    `Lifecycle aborted before hook: ${hook.name}`,
                    { metadata: { hookName: hook.name, phase } },
                ),
            );
        }

        const result = await runHook(hook, context, timeoutMs);
        if (!result.success) {
            return failStatus(
                createServerError(
                    "lifecycle-error",
                    `Lifecycle hook failed: ${hook.name}`,
                    {
                        cause: result.error,
                        metadata: { hookName: hook.name, phase },
                    },
                ),
            );
        }
    }

    return succeedStatus("ready");
}

async function runHook(
    hook: LifecycleHook,
    context: LifecycleContext,
    timeoutMs?: number,
): Promise<Result<void, ServerError>> {
    try {
        if (timeoutMs === undefined) {
            return await hook.run(context);
        }

        return await runWithTimeout(hook, context, timeoutMs);
    } catch (cause) {
        return {
            success: false,
            error: createServerError(
                "lifecycle-error",
                `Lifecycle hook threw: ${hook.name}`,
                { cause, metadata: { hookName: hook.name, phase: hook.phase } },
            ),
        };
    }
}

async function runWithTimeout(
    hook: LifecycleHook,
    context: LifecycleContext,
    timeoutMs: number,
): Promise<Result<void, ServerError>> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            hook.run(context),
            new Promise<Result<void, ServerError>>((resolve) => {
                timeout = setTimeout(() => {
                    resolve({
                        success: false,
                        error: createServerError(
                            "timeout",
                            `Lifecycle hook timed out: ${hook.name}`,
                            {
                                metadata: {
                                    hookName: hook.name,
                                    phase: hook.phase,
                                    timeoutMs,
                                },
                            },
                        ),
                    });
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeout !== undefined) {
            clearTimeout(timeout);
        }
    }
}

function succeedStatus(
    status: ServerStatus,
): Result<ServerStatus, ServerError> {
    return { success: true, data: status };
}

function failStatus(error: ServerError): Result<ServerStatus, ServerError> {
    return { success: false, error };
}

function toError(error: ServerError): Error {
    return Object.assign(new Error(error.message), error);
}
