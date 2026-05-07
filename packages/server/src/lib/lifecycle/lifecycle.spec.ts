import { describe, expect, it } from "vitest";
import { createServerError } from "../errors.js";
import { createLifecycleManager } from "./implementation.js";
import type {
    LifecycleContext,
    LifecycleHook,
    LifecyclePhase,
} from "./types.js";

const createContext = (): LifecycleContext => ({
    serverId: "server:test",
    localNodeId: "node:local",
    metadata: {},
});

const createHook = (
    name: string,
    phase: LifecyclePhase,
    calls: string[],
): LifecycleHook => ({
    name,
    phase,
    async run() {
        calls.push(name);
        return { success: true, data: undefined };
    },
});

describe("lifecycle module", () => {
    describe("createLifecycleManager", () => {
        it("should execute hooks in phase order", async () => {
            const calls: string[] = [];
            const manager = createLifecycleManager()
                .register(createHook("ready", "ready", calls))
                .register(createHook("before-start", "before-start", calls))
                .register(createHook("after-stop", "after-stop", calls))
                .register(createHook("stop", "stop", calls))
                .register(createHook("start", "start", calls))
                .register(createHook("before-stop", "before-stop", calls));

            const startResult = await manager.start(createContext());
            const stopResult = await manager.stop(createContext());

            expect(startResult).toEqual({ success: true, data: "ready" });
            expect(stopResult).toEqual({ success: true, data: "stopped" });
            expect(calls).toEqual([
                "before-start",
                "start",
                "ready",
                "before-stop",
                "stop",
                "after-stop",
            ]);
        });

        it("should reject duplicate hook names", () => {
            const calls: string[] = [];
            const manager = createLifecycleManager().register(
                createHook("duplicate", "before-start", calls),
            );

            expect(() =>
                manager.register(createHook("duplicate", "start", calls)),
            ).toThrow("Lifecycle hook already registered: duplicate");
        });

        it("should keep registered hooks immutable", () => {
            const calls: string[] = [];
            const manager = createLifecycleManager();
            const withHook = manager.register(
                createHook("before-start", "before-start", calls),
            );

            expect(manager.snapshot().hookCount).toBe(0);
            expect(withHook.snapshot().hookCount).toBe(1);
            expect(withHook.snapshot().registeredHooks).toEqual([
                "before-start",
            ]);
        });

        it("should make stop idempotent", async () => {
            const calls: string[] = [];
            const manager = createLifecycleManager()
                .register(createHook("before-stop", "before-stop", calls))
                .register(createHook("stop", "stop", calls))
                .register(createHook("after-stop", "after-stop", calls));

            await manager.start(createContext());

            const firstStop = await manager.stop(createContext());
            const secondStop = await manager.stop(createContext());

            expect(firstStop).toEqual({ success: true, data: "stopped" });
            expect(secondStop).toEqual({ success: true, data: "stopped" });
            expect(calls).toEqual(["before-stop", "stop", "after-stop"]);
        });

        it("should return lifecycle-error when a hook fails", async () => {
            const manager = createLifecycleManager().register({
                name: "fails",
                phase: "start",
                async run() {
                    return {
                        success: false,
                        error: createServerError(
                            "transport-error",
                            "Transport failed",
                        ),
                    };
                },
            });

            const result = await manager.start(createContext());

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("lifecycle-error");
                expect(result.error.message).toContain("fails");
                expect(result.error.cause).toEqual(
                    createServerError("transport-error", "Transport failed"),
                );
            }
            expect(manager.status).toBe("failed");
        });

        it("should transition statuses during start and stop", async () => {
            const observedStatuses: string[] = [];
            let manager = createLifecycleManager();
            manager = manager
                .register({
                    name: "before-start",
                    phase: "before-start",
                    async run() {
                        observedStatuses.push(manager.status);
                        return { success: true, data: undefined };
                    },
                })
                .register({
                    name: "start",
                    phase: "start",
                    async run() {
                        observedStatuses.push(manager.status);
                        return { success: true, data: undefined };
                    },
                })
                .register({
                    name: "ready",
                    phase: "ready",
                    async run() {
                        observedStatuses.push(manager.status);
                        return { success: true, data: undefined };
                    },
                })
                .register({
                    name: "before-stop",
                    phase: "before-stop",
                    async run() {
                        observedStatuses.push(manager.status);
                        return { success: true, data: undefined };
                    },
                })
                .register({
                    name: "stop",
                    phase: "stop",
                    async run() {
                        observedStatuses.push(manager.status);
                        return { success: true, data: undefined };
                    },
                })
                .register({
                    name: "after-stop",
                    phase: "after-stop",
                    async run() {
                        observedStatuses.push(manager.status);
                        return { success: true, data: undefined };
                    },
                });

            expect(manager.status).toBe("idle");

            await manager.start(createContext());
            expect(manager.status).toBe("ready");

            await manager.stop(createContext());
            expect(manager.status).toBe("stopped");
            expect(observedStatuses).toEqual([
                "starting",
                "starting",
                "ready",
                "draining",
                "stopping",
                "stopped",
            ]);
        });
    });
});
