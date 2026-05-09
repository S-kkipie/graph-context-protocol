import { z } from "zod";
import type { CapabilityId, GraphId, Metadata, NodeId, RoleId } from "../types";
import {
    CapabilityIdSchema,
    GraphIdSchema,
    MetadataSchema,
    NodeIdSchema,
    RoleIdSchema,
} from "../types";
import type { Result } from "../result";

/** Contract version for federated context descriptors. */
export const ContractVersion = "gcp-context-contract/v1" as const;

/** Zod schema for federated context descriptor version. */
export const ContractVersionSchema = z.literal(ContractVersion);

/** Authentication schemes advertised by context peers. */
export const AuthSchemeSchema = z.enum([
    "none",
    "api-key",
    "bearer-token",
    "oauth2",
    "jwt",
    "signed-request",
    "mtls",
    "custom",
]);

/** Authentication scheme advertised by a context peer. */
export type AuthScheme = z.infer<typeof AuthSchemeSchema>;

/** Knowledge source types advertised by peer descriptors. */
export const KnowledgeTypeSchema = z.enum([
    "rag",
    "logs",
    "events",
    "decisions",
    "issues",
    "documents",
    "metrics",
    "text",
    "custom",
]);

/** Knowledge source type advertised by a peer descriptor. */
export type KnowledgeType = z.infer<typeof KnowledgeTypeSchema>;

/** Query modes supported by exposed knowledge nodes. */
export const QueryModeSchema = z.enum([
    "text",
    "semantic",
    "structured",
    "hybrid",
]);

/** Query mode supported by an exposed knowledge node. */
export type QueryMode = z.infer<typeof QueryModeSchema>;

/** Denial behavior advertised for an exposed knowledge node. */
export const DenialModeSchema = z.enum([
    "error",
    "empty-result",
    "fallback-if-allowed",
]);

/** Denial behavior advertised for an exposed knowledge node. */
export type DenialMode = z.infer<typeof DenialModeSchema>;

/** Stable metadata key for node-local access policy descriptors. */
export const GCP_ACCESS_POLICY_METADATA_KEY = "gcp.accessPolicy" as const;

/** Public authentication contract for a context peer. */
export interface AuthContract {
    readonly schemes: readonly AuthScheme[];
    readonly required: boolean;
    readonly acceptedRoles?: readonly RoleId[];
    readonly requiredCapabilities?: readonly CapabilityId[];
    readonly metadata: Metadata;
}

/** Zod schema for AuthContract. */
export const AuthContractSchema = z.object({
    schemes: z.array(AuthSchemeSchema).min(1),
    required: z.boolean(),
    acceptedRoles: z.array(RoleIdSchema).optional(),
    requiredCapabilities: z.array(CapabilityIdSchema).optional(),
    metadata: MetadataSchema,
});

/** Public query contract for an exposed knowledge node. */
export interface KnowledgeQueryContract {
    readonly modes: readonly QueryMode[];
    readonly inputSchema?: Record<string, unknown>;
    readonly outputSchema?: Record<string, unknown>;
    readonly maxQueryLength?: number;
    readonly supportsFilters: boolean;
    readonly supportedFilters: readonly string[];
    readonly timeoutMs?: number;
}

/** Zod schema for KnowledgeQueryContract. */
export const KnowledgeQueryContractSchema = z.object({
    modes: z.array(QueryModeSchema).min(1),
    inputSchema: z.record(z.string(), z.unknown()).optional(),
    outputSchema: z.record(z.string(), z.unknown()).optional(),
    maxQueryLength: z.number().int().positive().optional(),
    supportsFilters: z.boolean(),
    supportedFilters: z.array(z.string()),
    timeoutMs: z.number().int().positive().optional(),
});

/** Owner-controlled access policy advertised for exposed knowledge. */
export interface AccessPolicyDescriptor {
    readonly readableByRoles: readonly RoleId[];
    readonly requiredCapabilities: readonly CapabilityId[];
    readonly fallbackAllowed: boolean;
    readonly denialMode: DenialMode;
    readonly metadata: Metadata;
}

/** Zod schema for AccessPolicyDescriptor. */
export const AccessPolicyDescriptorSchema = z.object({
    readableByRoles: z.array(RoleIdSchema),
    requiredCapabilities: z.array(CapabilityIdSchema),
    fallbackAllowed: z.boolean(),
    denialMode: DenialModeSchema,
    metadata: MetadataSchema,
});

/** Optional source-of-truth metadata for query results and descriptors. */
export interface SourceOfTruthDescriptor {
    readonly ownerId: NodeId;
    readonly sourceId: string;
    readonly description?: string;
    readonly metadata: Metadata;
}

/** Zod schema for SourceOfTruthDescriptor. */
export const SourceOfTruthDescriptorSchema = z.object({
    ownerId: NodeIdSchema,
    sourceId: z.string().min(1),
    description: z.string().optional(),
    metadata: MetadataSchema,
});

/** Discovery-time descriptor for one exposed knowledge node. */
export interface ExposedKnowledgeDescriptor {
    readonly nodeId: NodeId;
    readonly kind: "knowledge";
    readonly knowledgeType: KnowledgeType;
    readonly queryable: boolean;
    readonly queryContract: KnowledgeQueryContract;
    readonly access: AccessPolicyDescriptor;
    readonly tags: readonly string[];
    readonly contentTypes: readonly string[];
    readonly metadata: Metadata;
}

/** Zod schema for ExposedKnowledgeDescriptor. */
export const ExposedKnowledgeDescriptorSchema = z.object({
    nodeId: NodeIdSchema,
    kind: z.literal("knowledge"),
    knowledgeType: KnowledgeTypeSchema,
    queryable: z.boolean(),
    queryContract: KnowledgeQueryContractSchema,
    access: AccessPolicyDescriptorSchema,
    tags: z.array(z.string()),
    contentTypes: z.array(z.string()),
    metadata: MetadataSchema,
});

/** Discovery-time descriptor for a federated context peer. */
export interface ContextPeerDescriptor {
    readonly version: typeof ContractVersion;
    readonly id: string;
    readonly peerId: string;
    readonly endpoint: string;
    readonly graphId?: GraphId;
    readonly displayName?: string;
    readonly auth: AuthContract;
    readonly exposedKnowledge: readonly ExposedKnowledgeDescriptor[];
    readonly capabilities: readonly CapabilityId[];
    readonly queryEndpoint?: string;
    readonly metadata: Metadata;
}

/** Zod schema for ContextPeerDescriptor. */
export const ContextPeerDescriptorSchema = z.object({
    version: ContractVersionSchema,
    id: z.string().min(1),
    peerId: z.string().min(1),
    endpoint: z.string().min(1),
    graphId: GraphIdSchema.optional(),
    displayName: z.string().optional(),
    auth: AuthContractSchema,
    exposedKnowledge: z.array(ExposedKnowledgeDescriptorSchema),
    capabilities: z.array(CapabilityIdSchema),
    queryEndpoint: z.string().optional(),
    metadata: MetadataSchema,
});

/**
 * Parses an AccessPolicyDescriptor from node metadata.
 *
 * @param metadata - Metadata containing a `gcp.accessPolicy` entry
 * @returns Result containing the parsed policy or validation error
 */
export function parseAccessPolicyFromMetadata(
    metadata: Metadata,
): Result<AccessPolicyDescriptor, Error> {
    const raw = metadata[GCP_ACCESS_POLICY_METADATA_KEY];

    if (raw === undefined) {
        return {
            success: false,
            error: new Error(
                `Metadata key "${GCP_ACCESS_POLICY_METADATA_KEY}" not found`,
            ),
        };
    }

    const result = AccessPolicyDescriptorSchema.safeParse(raw);

    if (result.success) {
        return { success: true, data: result.data };
    }

    return {
        success: false,
        error: new Error(
            `Invalid access policy descriptor: ${result.error.message}`,
        ),
    };
}

/**
 * Stores an access policy under the stable GCP metadata key.
 *
 * @param policy - Access policy to store
 * @param baseMetadata - Existing metadata to preserve
 * @returns Metadata with the embedded policy
 */
export function createMetadataWithAccessPolicy(
    policy: AccessPolicyDescriptor,
    baseMetadata: Metadata = {},
): Metadata {
    return {
        ...baseMetadata,
        [GCP_ACCESS_POLICY_METADATA_KEY]:
            AccessPolicyDescriptorSchema.parse(policy),
    };
}
