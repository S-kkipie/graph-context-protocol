/**
 * Policy enforcement point (PEP) for the A2A baseline — the "instrumented A2A"
 * comparator. The A2A specification delegates authorization to the server and
 * lets the agent card declare security schemes, so a fair second baseline is an
 * A2A server that (1) authenticates the caller from a bearer token, (2) enforces
 * the SAME role/capability policy GCP enforces, and (3) writes an audit record
 * for every decision. This module supplies exactly that, as a decorator over the
 * unmodified {@link KnowledgeExecutor}: no protocol change, only a PEP and an
 * audit sink placed in front of the stock A2A server.
 *
 * Fairness: the policy inputs are the scenario's own `readableByRoles` and the
 * same `cap:delegate-task` rule GCP applies; denial strings reuse the prefixes
 * the containment metrics already parse, so classification is identical.
 *
 * @module policy-enforcement
 */

import {
    ClientFactory,
    ClientFactoryOptions,
    JsonRpcTransportFactory,
} from "@a2a-js/sdk/client";
import type {
    AgentExecutor,
    ExecutionEventBus,
    RequestContext,
    User,
} from "@a2a-js/sdk/server";
import type { A2aPeerContextToolOptions } from "./a2a-peer-context-tool";

/** Capability a principal must hold to have a delegation executed (mirrors GCP). */
export const DELEGATE_CAPABILITY = "cap:delegate-task";

/** Metadata key the PEP-aware client uses to state the requested capability. */
export const CAPABILITY_METADATA_KEY = "capability";

/** A principal the PEP can resolve a bearer token to. */
export interface PepPrincipal {
    readonly principalId: string;
    readonly role: string;
    readonly capabilities: ReadonlyArray<string>;
}

/** Token -> principal table (the PEP analogue of GCP's static token provider). */
export type PepTokenTable = ReadonlyMap<string, PepPrincipal>;

/** One authorization decision, in the shape needed to build a ReadProvenance. */
export interface PepAuditRecord {
    readonly principalId: string;
    readonly targetNodeId: string;
    readonly queryId: string;
    readonly timestamp: string;
    readonly decision: "allow" | "deny";
    readonly capability: "read" | "delegate";
    readonly reason?: string;
}

/** Minimal audit sink (structurally a subset of the server package's AuditSink). */
export interface PepAuditSink {
    record(entry: PepAuditRecord): void;
}

class PepUser implements User {
    constructor(readonly principal: PepPrincipal | undefined) {}
    get isAuthenticated(): boolean {
        return this.principal !== undefined;
    }
    get userName(): string {
        return this.principal?.principalId ?? "";
    }
}

/**
 * Express `userBuilder` that resolves `Authorization: Bearer <token>` against
 * the token table. Unknown or missing tokens yield an unauthenticated user,
 * which the PEP denies (default-deny).
 */
export function createBearerUserBuilder(table: PepTokenTable) {
    return async (req: {
        headers: Record<string, string | string[] | undefined>;
    }): Promise<User> => {
        const header = req.headers.authorization;
        const value = Array.isArray(header) ? header[0] : header;
        const token = value?.startsWith("Bearer ")
            ? value.slice("Bearer ".length)
            : undefined;
        return new PepUser(token ? table.get(token) : undefined);
    };
}

export interface PolicyEnforcingExecutorOptions {
    readonly nodeId: string;
    readonly readableByRoles: ReadonlyArray<string>;
    readonly audit: PepAuditSink;
}

/** Wraps an executor with authenticate -> authorize -> audit -> (execute|deny). */
export class PolicyEnforcingExecutor implements AgentExecutor {
    constructor(
        private readonly inner: AgentExecutor,
        private readonly opts: PolicyEnforcingExecutorOptions,
    ) {}

    async execute(
        requestContext: RequestContext,
        eventBus: ExecutionEventBus,
    ): Promise<void> {
        const user = requestContext.context?.user;
        const principal = user instanceof PepUser ? user.principal : undefined;
        const requested =
            requestContext.userMessage.metadata?.[CAPABILITY_METADATA_KEY] ===
            "delegate"
                ? "delegate"
                : "read";

        let reason: string | undefined;
        if (!principal) reason = "unauthenticated";
        else if (!this.opts.readableByRoles.includes(principal.role))
            reason = "role-not-readable";
        else if (
            requested === "delegate" &&
            !principal.capabilities.includes(DELEGATE_CAPABILITY)
        )
            reason = "missing-capability";

        this.opts.audit.record({
            principalId: principal?.principalId ?? "anonymous",
            targetNodeId: this.opts.nodeId,
            queryId: requestContext.taskId,
            timestamp: new Date().toISOString(),
            decision: reason === undefined ? "allow" : "deny",
            capability: requested,
            ...(reason !== undefined ? { reason } : {}),
        });

        if (reason === undefined) {
            await this.inner.execute(requestContext, eventBus);
            return;
        }

        const { taskId, contextId } = requestContext;
        const text =
            requested === "delegate"
                ? `Delegation denied: ${reason}`
                : `Peer context query denied: ${reason}`;
        eventBus.publish({
            kind: "task",
            id: taskId,
            contextId,
            status: { state: "submitted", timestamp: new Date().toISOString() },
            history: [],
        });
        eventBus.publish({
            kind: "artifact-update",
            taskId,
            contextId,
            artifact: {
                artifactId: "context",
                name: "denial.txt",
                parts: [{ kind: "text", text }],
            },
        });
        eventBus.publish({
            kind: "status-update",
            taskId,
            contextId,
            status: { state: "completed", timestamp: new Date().toISOString() },
            final: true,
        });
        eventBus.finished();
    }

    cancelTask = async (
        taskId: string,
        eventBus: ExecutionEventBus,
    ): Promise<void> => this.inner.cancelTask(taskId, eventBus);
}

/**
 * Client factory whose JSON-RPC transport sends `Authorization: Bearer <token>`.
 * Plugs into {@link A2aPeerContextToolOptions.clientFactory}.
 */
export function createBearerClientFactory(
    token: string,
): NonNullable<A2aPeerContextToolOptions["clientFactory"]> {
    const authFetch: typeof fetch = (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
    };
    return () =>
        new ClientFactory(
            ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
                transports: [
                    new JsonRpcTransportFactory({ fetchImpl: authFetch }),
                ],
            }),
        );
}
