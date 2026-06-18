import { z } from "zod";
import type { CapabilityId, NodeId, RoleId, Timestamp } from "../types";
import {
    CapabilityIdSchema,
    NodeIdSchema,
    RoleIdSchema,
    TimestampSchema,
} from "../types";

/**
 * Read-provenance and audit types.
 *
 * @module provenance/provenance-types
 */

/** Outcome of an access-control decision for a context read. */
export type AccessDecision = "allow" | "deny";

/** Zod schema for AccessDecision. */
export const AccessDecisionSchema = z.enum(["allow", "deny"]);

/**
 * Structured, audit-grade record of a single context-read authorization
 * decision: who asked, what they targeted, when, and the outcome. This is the
 * substrate for the leakage (Claim 2) and cross-owner (Claim 4) metrics.
 */
export interface ReadProvenance {
    readonly principalId: string;
    readonly targetNodeId: NodeId;
    readonly queryId: string;
    readonly timestamp: Timestamp;
    readonly decision: AccessDecision;
    readonly matchedRoles?: readonly RoleId[];
    readonly matchedCapabilities?: readonly CapabilityId[];
    readonly reason?: string;
}

/** Zod schema for ReadProvenance. */
export const ReadProvenanceSchema = z.object({
    principalId: z.string().min(1),
    targetNodeId: NodeIdSchema,
    queryId: z.string().min(1),
    timestamp: TimestampSchema,
    decision: AccessDecisionSchema,
    matchedRoles: z.array(RoleIdSchema).optional(),
    matchedCapabilities: z.array(CapabilityIdSchema).optional(),
    reason: z.string().optional(),
});

/** A ReadProvenance entry as consumed by an audit sink. */
export type AuditRecord = ReadProvenance;
