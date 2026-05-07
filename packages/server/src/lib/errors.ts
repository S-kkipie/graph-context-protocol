/**
 * Server error types and helpers.
 *
 * @module errors
 */

import type { Metadata } from "@graph-context-protocol/core";

/**
 * Error codes for server operations.
 */
export type ServerErrorCode =
    | "validation-error"
    | "lifecycle-error"
    | "transport-error"
    | "connection-error"
    | "auth-error"
    | "authorization-error"
    | "routing-error"
    | "handler-error"
    | "external-agent-error"
    | "knowledge-error"
    | "cache-error"
    | "sync-error"
    | "not-found"
    | "conflict"
    | "timeout"
    | "internal-error";

/**
 * Server error structure.
 */
export interface ServerError {
    /** Error code for programmatic handling */
    readonly code: ServerErrorCode;
    /** Human-readable error message */
    readonly message: string;
    /** Original error cause if available */
    readonly cause?: unknown;
    /** Additional error metadata */
    readonly metadata?: Metadata;
}

/**
 * Creates a server error.
 *
 * @param code - Error code
 * @param message - Error message
 * @param options - Optional cause and metadata
 * @returns ServerError object
 *
 * @example
 * ```typescript
 * const error = createServerError("not-found", "Agent not found", {
 *   metadata: { agentId: "agent:123" }
 * });
 * ```
 */
export function createServerError(
    code: ServerErrorCode,
    message: string,
    options?: {
        readonly cause?: unknown;
        readonly metadata?: Metadata;
    },
): ServerError {
    return {
        code,
        message,
        cause: options?.cause,
        metadata: options?.metadata,
    };
}

/**
 * Error class for server operations.
 * Can be thrown when using exception-based error handling.
 */
export class ServerErrorClass extends Error {
    readonly code: ServerErrorCode;
    readonly metadata?: Metadata;

    constructor(
        code: ServerErrorCode,
        message: string,
        options?: {
            readonly cause?: unknown;
            readonly metadata?: Metadata;
        },
    ) {
        super(message);
        this.name = "ServerError";
        this.code = code;
        this.cause = options?.cause;
        this.metadata = options?.metadata;
    }
}
