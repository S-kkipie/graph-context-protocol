import { z } from "zod";
import { RequesterDescriptorSchema } from "../context";
import type { CapabilityId, Metadata, NodeId } from "../types";
import { CapabilityIdSchema, MetadataSchema, NodeIdSchema } from "../types";
import type {
    DelegationContractVersion,
    DelegationRequest,
    DelegationResult,
    DelegationStatus,
} from "./delegation-types";

/**
 * Delegation factory functions with Zod validation.
 *
 * @module delegation/delegation-factories
 */

const DELEGATE_TASK_CAPABILITY: CapabilityId = "cap:delegate-task";

/**
 * Zod schema for DelegationContractVersion validation.
 */
export const DelegationContractVersionSchema = z.literal(
    "gcp-delegation-contract/v1",
);

/**
 * Zod schema for DelegationStatus validation.
 */
export const DelegationStatusSchema = z.enum([
    "completed",
    "denied",
    "not-found",
    "invalid-request",
    "error",
]);

/**
 * Zod schema for DelegationRequest validation.
 */
export const DelegationRequestSchema = z.object({
    contractVersion: DelegationContractVersionSchema,
    delegationId: z.string().min(1),
    requester: RequesterDescriptorSchema,
    targetNodeId: NodeIdSchema,
    task: z.string().min(1),
    capabilityRequired: CapabilityIdSchema,
    metadata: MetadataSchema,
});

/**
 * Zod schema for DelegationResult validation.
 */
export const DelegationResultSchema = z.object({
    contractVersion: DelegationContractVersionSchema,
    delegationId: z.string().min(1),
    status: DelegationStatusSchema,
    sourceNodeId: NodeIdSchema,
    result: z.string().optional(),
    error: z.string().optional(),
    provenance: z.record(z.string(), z.unknown()).optional(),
    metadata: MetadataSchema,
});

/**
 * Creates a task-delegation request.
 *
 * @param delegationId - Unique identifier for the delegation
 * @param requester - Audit descriptor of the delegating principal
 * @param targetNodeId - Gated node the delegated task concerns
 * @param task - Natural-language task for the remote agent
 * @param capabilityRequired - Capability the delegation requires (defaults to cap:delegate-task)
 * @param metadata - Optional metadata
 * @returns A new DelegationRequest instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createDelegationRequest(
    delegationId: string,
    requester: DelegationRequest["requester"],
    targetNodeId: NodeId,
    task: string,
    capabilityRequired: CapabilityId = DELEGATE_TASK_CAPABILITY,
    metadata: Metadata = {},
): DelegationRequest {
    const input = DelegationRequestSchema.parse({
        contractVersion:
            "gcp-delegation-contract/v1" as DelegationContractVersion,
        delegationId,
        requester,
        targetNodeId,
        task,
        capabilityRequired,
        metadata,
    });

    return {
        contractVersion: input.contractVersion,
        delegationId: input.delegationId,
        requester: input.requester,
        targetNodeId: input.targetNodeId,
        task: input.task,
        capabilityRequired: input.capabilityRequired,
        metadata: input.metadata,
    };
}

/**
 * Creates a task-delegation result.
 *
 * @param delegationId - Unique identifier for the delegation
 * @param status - Response status
 * @param sourceNodeId - ID of the node responding
 * @param metadata - Optional metadata
 * @param result - Optional agent output (completed delegations)
 * @param error - Optional denial/error reason
 * @param provenance - Optional provenance record
 * @returns A new DelegationResult instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createDelegationResult(
    delegationId: string,
    status: DelegationStatus,
    sourceNodeId: NodeId,
    metadata: Metadata = {},
    result?: string,
    error?: string,
    provenance?: DelegationResult["provenance"],
): DelegationResult {
    const input = DelegationResultSchema.parse({
        contractVersion:
            "gcp-delegation-contract/v1" as DelegationContractVersion,
        delegationId,
        status,
        sourceNodeId,
        metadata,
        result,
        error,
        provenance,
    });

    return {
        contractVersion: input.contractVersion,
        delegationId: input.delegationId,
        status: input.status,
        sourceNodeId: input.sourceNodeId,
        metadata: input.metadata,
        result: input.result,
        error: input.error,
        provenance: provenance,
    };
}
