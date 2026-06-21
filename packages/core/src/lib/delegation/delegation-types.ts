import type {
    ContextReadProvenance,
    RequesterDescriptor,
} from "../context/context-query-types";
import type { CapabilityId, Metadata, NodeId } from "../types";

/**
 * Task-delegation contract types.
 *
 * Delegation is a stricter-capability operation on the same read-first path as
 * context-query: a peer asks another node's agent to *do* something and return
 * an outcome. It reuses the existing `action-request` / `action-response`
 * transport vocabulary and the same {@link RequesterDescriptor} audit shape.
 *
 * @module delegation/delegation-types
 */

/**
 * Literal contract version for delegation contracts.
 */
export type DelegationContractVersion = "gcp-delegation-contract/v1";

/**
 * Status values for a delegation response.
 */
export type DelegationStatus =
    | "completed"
    | "denied"
    | "not-found"
    | "invalid-request"
    | "error";

/**
 * A task-delegation request sent to a remote node.
 */
export interface DelegationRequest {
    readonly contractVersion: DelegationContractVersion;
    readonly delegationId: string;
    /** Audit-only requester descriptor — never trusted for authorization. */
    readonly requester: RequesterDescriptor;
    /** The gated node the delegated task concerns. */
    readonly targetNodeId: NodeId;
    /** Natural-language task / goal for the remote agent to execute. */
    readonly task: string;
    /** Capability the delegation requires (defaults to cap:delegate-task). */
    readonly capabilityRequired: CapabilityId;
    readonly metadata: Metadata;
}

/**
 * A task-delegation response returned from a remote node.
 */
export interface DelegationResult {
    readonly contractVersion: DelegationContractVersion;
    readonly delegationId: string;
    readonly status: DelegationStatus;
    readonly sourceNodeId: NodeId;
    /** Agent output on a completed delegation. */
    readonly result?: string;
    /** Denial or error reason. */
    readonly error?: string;
    readonly provenance?: ContextReadProvenance;
    readonly metadata: Metadata;
}
