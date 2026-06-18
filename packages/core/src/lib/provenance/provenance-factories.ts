import type { CapabilityId, NodeId, RoleId, Timestamp } from "../types";
import {
    type AccessDecision,
    type ReadProvenance,
    ReadProvenanceSchema,
} from "./provenance-types";

/**
 * Read-provenance factory.
 *
 * @module provenance/provenance-factories
 */

/** Optional matched-policy fields for {@link createReadProvenance}. */
export interface ReadProvenanceOptions {
    readonly matchedRoles?: readonly RoleId[];
    readonly matchedCapabilities?: readonly CapabilityId[];
    readonly reason?: string;
}

/**
 * Creates a validated ReadProvenance record.
 *
 * @param principalId - Authenticated (or audit-claimed) principal id
 * @param targetNodeId - Knowledge node the read targeted
 * @param queryId - Correlating query id
 * @param timestamp - ISO 8601 decision time
 * @param decision - "allow" or "deny"
 * @param options - Matched roles/capabilities and/or a denial reason
 * @returns A new ReadProvenance instance
 * @throws {z.ZodError} If inputs are invalid (e.g. a non-ISO timestamp)
 */
export function createReadProvenance(
    principalId: string,
    targetNodeId: NodeId,
    queryId: string,
    timestamp: Timestamp,
    decision: AccessDecision,
    options: ReadProvenanceOptions = {},
): ReadProvenance {
    const parsed = ReadProvenanceSchema.parse({
        principalId,
        targetNodeId,
        queryId,
        timestamp,
        decision,
        matchedRoles: options.matchedRoles,
        matchedCapabilities: options.matchedCapabilities,
        reason: options.reason,
    });

    return {
        principalId: parsed.principalId,
        targetNodeId: parsed.targetNodeId,
        queryId: parsed.queryId,
        timestamp: parsed.timestamp,
        decision: parsed.decision,
        matchedRoles: parsed.matchedRoles,
        matchedCapabilities: parsed.matchedCapabilities,
        reason: parsed.reason,
    };
}
