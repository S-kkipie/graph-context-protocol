import type { CapabilityId, RoleId } from "../types";
import type {
    ContextPeerDescriptor,
    ExposedKnowledgeDescriptor,
    KnowledgeType,
    QueryMode,
} from "./context-contract-types";

/**
 * Peer discovery helper functions.
 *
 * Pure functions for filtering context peer descriptors and exposed
 * knowledge descriptors without requiring a global graph.
 *
 * @module discovery/peer-discovery
 */

/**
 * Filters exposed knowledge descriptors by role.
 *
 * @param descriptors - The descriptors to filter
 * @param roleId - The role ID to match
 * @returns Descriptors accessible by the given role
 */
export function filterExposedKnowledgeByRole(
    descriptors: readonly ExposedKnowledgeDescriptor[],
    roleId: RoleId,
): ExposedKnowledgeDescriptor[] {
    return descriptors.filter((descriptor) =>
        descriptor.access.readableByRoles.includes(roleId),
    );
}

/**
 * Filters exposed knowledge descriptors by capability.
 *
 * @param descriptors - The descriptors to filter
 * @param capabilityId - The capability ID to match
 * @returns Descriptors requiring the given capability
 */
export function filterExposedKnowledgeByCapability(
    descriptors: readonly ExposedKnowledgeDescriptor[],
    capabilityId: CapabilityId,
): ExposedKnowledgeDescriptor[] {
    return descriptors.filter((descriptor) =>
        descriptor.access.requiredCapabilities.includes(capabilityId),
    );
}

/**
 * Filters exposed knowledge descriptors by tags.
 *
 * @param descriptors - The descriptors to filter
 * @param tags - Tags to match
 * @param mode - Tag matching mode: "any" or "all"
 * @returns Descriptors matching the given tags
 */
export function filterExposedKnowledgeByTags(
    descriptors: readonly ExposedKnowledgeDescriptor[],
    tags: readonly string[],
    mode: "any" | "all" = "any",
): ExposedKnowledgeDescriptor[] {
    if (tags.length === 0) return [...descriptors];

    return descriptors.filter((descriptor) => {
        if (mode === "all") {
            return tags.every((tag) => descriptor.tags.includes(tag));
        }

        return tags.some((tag) => descriptor.tags.includes(tag));
    });
}

/**
 * Filters exposed knowledge descriptors by query mode support.
 *
 * @param descriptors - The descriptors to filter
 * @param queryMode - The query mode to match
 * @returns Descriptors supporting the given query mode
 */
export function filterExposedKnowledgeByQueryMode(
    descriptors: readonly ExposedKnowledgeDescriptor[],
    queryMode: QueryMode,
): ExposedKnowledgeDescriptor[] {
    return descriptors.filter(
        (descriptor) =>
            descriptor.queryable &&
            descriptor.queryContract.modes.includes(queryMode),
    );
}

/**
 * Filters exposed knowledge descriptors by knowledge type.
 *
 * @param descriptors - The descriptors to filter
 * @param knowledgeType - The knowledge type to match
 * @returns Descriptors of the given knowledge type
 */
export function filterExposedKnowledgeByType(
    descriptors: readonly ExposedKnowledgeDescriptor[],
    knowledgeType: KnowledgeType,
): ExposedKnowledgeDescriptor[] {
    return descriptors.filter(
        (descriptor) => descriptor.knowledgeType === knowledgeType,
    );
}

/**
 * Filters exposed knowledge descriptors by queryable flag.
 *
 * @param descriptors - The descriptors to filter
 * @returns Only queryable descriptors
 */
export function filterExposedKnowledgeByQueryable(
    descriptors: readonly ExposedKnowledgeDescriptor[],
): ExposedKnowledgeDescriptor[] {
    return descriptors.filter((descriptor) => descriptor.queryable);
}

/**
 * Filters context peer descriptors by capability.
 *
 * @param peers - The peers to filter
 * @param capabilityId - The capability ID to match
 * @returns Peers advertising the given capability
 */
export function filterPeersByCapability(
    peers: readonly ContextPeerDescriptor[],
    capabilityId: CapabilityId,
): ContextPeerDescriptor[] {
    return peers.filter((peer) => peer.capabilities.includes(capabilityId));
}

/**
 * Filters context peer descriptors by exposed knowledge tags.
 *
 * @param peers - The peers to filter
 * @param tags - Tags to match
 * @param mode - Tag matching mode: "any" or "all"
 * @returns Peers with knowledge matching the given tags
 */
export function filterPeersByKnowledgeTags(
    peers: readonly ContextPeerDescriptor[],
    tags: readonly string[],
    mode: "any" | "all" = "any",
): ContextPeerDescriptor[] {
    if (tags.length === 0) return [...peers];

    return peers.filter((peer) =>
        peer.exposedKnowledge.some((knowledge) => {
            if (mode === "all") {
                return tags.every((tag) => knowledge.tags.includes(tag));
            }

            return tags.some((tag) => knowledge.tags.includes(tag));
        }),
    );
}

/**
 * Filters context peer descriptors by queryable knowledge.
 *
 * @param peers - The peers to filter
 * @param queryMode - The query mode to match
 * @returns Peers with knowledge supporting the given query mode
 */
export function filterPeersByQueryable(
    peers: readonly ContextPeerDescriptor[],
    queryMode: QueryMode,
): ContextPeerDescriptor[] {
    return peers.filter((peer) =>
        peer.exposedKnowledge.some(
            (knowledge) =>
                knowledge.queryable &&
                knowledge.queryContract.modes.includes(queryMode),
        ),
    );
}

/**
 * Discovers peer context sources matching the given filters.
 *
 * Pure function — operates on an array of peer descriptors without
 * requiring a global graph instance.
 *
 * @param peers - All available peer descriptors
 * @param filters - Filters to apply
 * @returns Peers matching all provided filters
 */
export function discoverPeerContextSources(
    peers: readonly ContextPeerDescriptor[],
    filters?: {
        readonly capability?: CapabilityId;
        readonly tags?: readonly string[];
        readonly tagMode?: "any" | "all";
        readonly queryMode?: QueryMode;
    },
): ContextPeerDescriptor[] {
    if (!filters) return [...peers];

    let result = [...peers];

    if (filters.capability) {
        result = filterPeersByCapability(result, filters.capability);
    }

    if (filters.tags && filters.tags.length > 0) {
        result = filterPeersByKnowledgeTags(
            result,
            filters.tags,
            filters.tagMode,
        );
    }

    if (filters.queryMode) {
        result = filterPeersByQueryable(result, filters.queryMode);
    }

    return result;
}

/**
 * Filters exposed knowledge descriptors by multiple criteria.
 *
 * Pure function — operates on an array of descriptors without
 * requiring a global graph instance.
 *
 * @param descriptors - All available exposed knowledge descriptors
 * @param filters - Filters to apply
 * @returns Descriptors matching all provided filters
 */
export function filterExposedKnowledge(
    descriptors: readonly ExposedKnowledgeDescriptor[],
    filters?: {
        readonly roleId?: RoleId;
        readonly capability?: CapabilityId;
        readonly tags?: readonly string[];
        readonly tagMode?: "any" | "all";
        readonly queryMode?: QueryMode;
        readonly knowledgeType?: KnowledgeType;
        readonly queryable?: boolean;
    },
): ExposedKnowledgeDescriptor[] {
    if (!filters) return [...descriptors];

    let result = [...descriptors];

    if (filters.roleId) {
        result = filterExposedKnowledgeByRole(result, filters.roleId);
    }

    if (filters.capability) {
        result = filterExposedKnowledgeByCapability(result, filters.capability);
    }

    if (filters.tags && filters.tags.length > 0) {
        result = filterExposedKnowledgeByTags(
            result,
            filters.tags,
            filters.tagMode,
        );
    }

    if (filters.queryMode) {
        result = filterExposedKnowledgeByQueryMode(result, filters.queryMode);
    }

    if (filters.queryable !== undefined) {
        result = result.filter(
            (descriptor) => descriptor.queryable === filters.queryable,
        );
    }

    if (filters.knowledgeType) {
        result = filterExposedKnowledgeByType(result, filters.knowledgeType);
    }

    return result;
}
