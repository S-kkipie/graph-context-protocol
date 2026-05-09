import { z } from "zod";
import type { CapabilityId, GraphId, Metadata, NodeId, RoleId } from "../types";
import { CapabilityIdSchema, GraphIdSchema, MetadataSchema } from "../types";
import type { KnowledgeNode } from "../graph/graph-types";
import {
    type AccessPolicyDescriptor,
    AccessPolicyDescriptorSchema,
    type AuthContract,
    AuthContractSchema,
    type AuthScheme,
    type ContextPeerDescriptor,
    ContextPeerDescriptorSchema,
    ContractVersion,
    type DenialMode,
    type ExposedKnowledgeDescriptor,
    ExposedKnowledgeDescriptorSchema,
    type KnowledgeQueryContract,
    KnowledgeQueryContractSchema,
    type KnowledgeType,
    type QueryMode,
    type SourceOfTruthDescriptor,
    SourceOfTruthDescriptorSchema,
} from "./context-contract-types";

/** Input schema for createAuthContract. */
export const CreateAuthContractInputSchema = z.object({
    schemes: z.array(AuthContractSchema.shape.schemes.element).min(1),
    required: z.boolean(),
    acceptedRoles: AuthContractSchema.shape.acceptedRoles,
    requiredCapabilities: AuthContractSchema.shape.requiredCapabilities,
    metadata: MetadataSchema.default({}),
});

/**
 * Creates an authentication contract with validation.
 *
 * @param schemes - Accepted authentication schemes
 * @param required - Whether authentication is required
 * @param acceptedRoles - Optional accepted roles
 * @param requiredCapabilities - Optional required capabilities
 * @param metadata - Public auth metadata
 * @returns A new AuthContract instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createAuthContract(
    schemes: readonly AuthScheme[],
    required: boolean,
    acceptedRoles?: readonly RoleId[],
    requiredCapabilities?: readonly CapabilityId[],
    metadata: Metadata = {},
): AuthContract {
    const input = CreateAuthContractInputSchema.parse({
        schemes,
        required,
        acceptedRoles,
        requiredCapabilities,
        metadata,
    });

    return {
        schemes: input.schemes,
        required: input.required,
        acceptedRoles: input.acceptedRoles,
        requiredCapabilities: input.requiredCapabilities,
        metadata: filterPublicMetadata(input.metadata),
    };
}

/** Input schema for createKnowledgeQueryContract. */
export const CreateKnowledgeQueryContractInputSchema = z.object({
    modes: KnowledgeQueryContractSchema.shape.modes,
    inputSchema: KnowledgeQueryContractSchema.shape.inputSchema,
    outputSchema: KnowledgeQueryContractSchema.shape.outputSchema,
    maxQueryLength: KnowledgeQueryContractSchema.shape.maxQueryLength,
    supportsFilters: z.boolean(),
    supportedFilters: z.array(z.string()),
    timeoutMs: KnowledgeQueryContractSchema.shape.timeoutMs,
});

/**
 * Creates a knowledge query contract with validation.
 *
 * @param modes - Supported query modes
 * @param supportsFilters - Whether filters are supported
 * @param supportedFilters - Supported filter keys
 * @param options - Optional schemas and limits
 * @returns A new KnowledgeQueryContract instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createKnowledgeQueryContract(
    modes: readonly QueryMode[],
    supportsFilters: boolean,
    supportedFilters: readonly string[] = [],
    options: {
        readonly inputSchema?: Record<string, unknown>;
        readonly outputSchema?: Record<string, unknown>;
        readonly maxQueryLength?: number;
        readonly timeoutMs?: number;
    } = {},
): KnowledgeQueryContract {
    const input = CreateKnowledgeQueryContractInputSchema.parse({
        modes,
        supportsFilters,
        supportedFilters,
        inputSchema: options.inputSchema,
        outputSchema: options.outputSchema,
        maxQueryLength: options.maxQueryLength,
        timeoutMs: options.timeoutMs,
    });

    return {
        modes: input.modes,
        inputSchema: input.inputSchema,
        outputSchema: input.outputSchema,
        maxQueryLength: input.maxQueryLength,
        supportsFilters: input.supportsFilters,
        supportedFilters: input.supportedFilters,
        timeoutMs: input.timeoutMs,
    };
}

/** Input schema for createAccessPolicyDescriptor. */
export const CreateAccessPolicyDescriptorInputSchema = z.object({
    readableByRoles: AccessPolicyDescriptorSchema.shape.readableByRoles,
    requiredCapabilities:
        AccessPolicyDescriptorSchema.shape.requiredCapabilities,
    fallbackAllowed: z.boolean(),
    denialMode: AccessPolicyDescriptorSchema.shape.denialMode,
    metadata: MetadataSchema.default({}),
});

/**
 * Creates an access policy descriptor with validation.
 *
 * @param readableByRoles - Roles allowed to read the knowledge node
 * @param requiredCapabilities - Capabilities required for querying
 * @param fallbackAllowed - Whether direct fallback is owner-allowed
 * @param denialMode - Denial behavior
 * @param metadata - Public policy metadata
 * @returns A new AccessPolicyDescriptor instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createAccessPolicyDescriptor(
    readableByRoles: readonly RoleId[],
    requiredCapabilities: readonly CapabilityId[],
    fallbackAllowed: boolean,
    denialMode: DenialMode,
    metadata: Metadata = {},
): AccessPolicyDescriptor {
    const input = CreateAccessPolicyDescriptorInputSchema.parse({
        readableByRoles,
        requiredCapabilities,
        fallbackAllowed,
        denialMode,
        metadata,
    });

    return {
        readableByRoles: input.readableByRoles,
        requiredCapabilities: input.requiredCapabilities,
        fallbackAllowed: input.fallbackAllowed,
        denialMode: input.denialMode,
        metadata: filterPublicMetadata(input.metadata),
    };
}

/** Input schema for createSourceOfTruthDescriptor. */
export const CreateSourceOfTruthDescriptorInputSchema = z.object({
    ownerId: SourceOfTruthDescriptorSchema.shape.ownerId,
    sourceId: SourceOfTruthDescriptorSchema.shape.sourceId,
    description: SourceOfTruthDescriptorSchema.shape.description,
    metadata: MetadataSchema.default({}),
});

/**
 * Creates source-of-truth metadata with validation.
 *
 * @param ownerId - Owner node id
 * @param sourceId - Source identifier
 * @param description - Optional description
 * @param metadata - Public source metadata
 * @returns A new SourceOfTruthDescriptor instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createSourceOfTruthDescriptor(
    ownerId: NodeId,
    sourceId: string,
    description?: string,
    metadata: Metadata = {},
): SourceOfTruthDescriptor {
    const input = CreateSourceOfTruthDescriptorInputSchema.parse({
        ownerId,
        sourceId,
        description,
        metadata,
    });

    return {
        ownerId: input.ownerId,
        sourceId: input.sourceId,
        description: input.description,
        metadata: filterPublicMetadata(input.metadata),
    };
}

/** Input schema for createExposedKnowledgeDescriptor. */
export const CreateExposedKnowledgeDescriptorInputSchema = z.object({
    nodeId: ExposedKnowledgeDescriptorSchema.shape.nodeId,
    knowledgeType: ExposedKnowledgeDescriptorSchema.shape.knowledgeType,
    queryable: z.boolean(),
    queryContract: ExposedKnowledgeDescriptorSchema.shape.queryContract,
    access: ExposedKnowledgeDescriptorSchema.shape.access,
    tags: z.array(z.string()),
    contentTypes: z.array(z.string()),
    metadata: MetadataSchema.default({}),
});

/**
 * Creates an exposed knowledge descriptor with validation and metadata sanitization.
 *
 * @param nodeId - Knowledge node id
 * @param knowledgeType - Knowledge source type
 * @param queryable - Whether the node accepts remote queries
 * @param queryContract - Query contract
 * @param access - Access policy
 * @param tags - Public tags
 * @param contentTypes - Public content types
 * @param metadata - Public metadata to sanitize
 * @returns A new ExposedKnowledgeDescriptor instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createExposedKnowledgeDescriptor(
    nodeId: NodeId,
    knowledgeType: KnowledgeType,
    queryable: boolean,
    queryContract: KnowledgeQueryContract,
    access: AccessPolicyDescriptor,
    tags: readonly string[] = [],
    contentTypes: readonly string[] = [],
    metadata: Metadata = {},
): ExposedKnowledgeDescriptor {
    const input = CreateExposedKnowledgeDescriptorInputSchema.parse({
        nodeId,
        knowledgeType,
        queryable,
        queryContract,
        access,
        tags,
        contentTypes,
        metadata,
    });

    return {
        nodeId: input.nodeId,
        kind: "knowledge",
        knowledgeType: input.knowledgeType,
        queryable: input.queryable,
        queryContract: input.queryContract,
        access: input.access,
        tags: input.tags,
        contentTypes: input.contentTypes,
        metadata: filterPublicMetadata(input.metadata),
    };
}

/**
 * Creates an exposed knowledge descriptor from a knowledge node.
 *
 * @param node - Knowledge node to describe
 * @param knowledgeType - Knowledge source type
 * @param queryable - Whether the node accepts remote queries
 * @param queryContract - Query contract
 * @param access - Access policy
 * @param tags - Optional override tags
 * @param contentTypes - Optional override content types
 * @returns A new ExposedKnowledgeDescriptor instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createExposedKnowledgeDescriptorFromNode(
    node: KnowledgeNode,
    knowledgeType: KnowledgeType,
    queryable: boolean,
    queryContract: KnowledgeQueryContract,
    access: AccessPolicyDescriptor,
    tags: readonly string[] = getStringArrayMetadata(node.metadata, "tags"),
    contentTypes: readonly string[] = getContentTypes(node.metadata),
): ExposedKnowledgeDescriptor {
    return createExposedKnowledgeDescriptor(
        node.id,
        knowledgeType,
        queryable,
        queryContract,
        access,
        tags,
        contentTypes,
        node.metadata,
    );
}

/** Input schema for createContextPeerDescriptor. */
export const CreateContextPeerDescriptorInputSchema = z.object({
    id: ContextPeerDescriptorSchema.shape.id,
    peerId: ContextPeerDescriptorSchema.shape.peerId,
    endpoint: ContextPeerDescriptorSchema.shape.endpoint,
    graphId: GraphIdSchema.optional(),
    displayName: ContextPeerDescriptorSchema.shape.displayName,
    auth: ContextPeerDescriptorSchema.shape.auth,
    exposedKnowledge: z.array(ExposedKnowledgeDescriptorSchema),
    capabilities: z.array(CapabilityIdSchema),
    queryEndpoint: ContextPeerDescriptorSchema.shape.queryEndpoint,
    metadata: MetadataSchema.default({}),
});

/**
 * Creates a context peer descriptor with validation and metadata sanitization.
 *
 * @param id - Descriptor id
 * @param peerId - Peer id
 * @param endpoint - Peer base endpoint
 * @param auth - Auth contract
 * @param exposedKnowledge - Public exposed knowledge descriptors
 * @param capabilities - Peer-advertised capabilities
 * @param options - Optional graph id, display name, query endpoint, and metadata
 * @returns A new ContextPeerDescriptor instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createContextPeerDescriptor(
    id: string,
    peerId: string,
    endpoint: string,
    auth: AuthContract,
    exposedKnowledge: readonly ExposedKnowledgeDescriptor[],
    capabilities: readonly CapabilityId[],
    options: {
        readonly graphId?: GraphId;
        readonly displayName?: string;
        readonly queryEndpoint?: string;
        readonly metadata?: Metadata;
    } = {},
): ContextPeerDescriptor {
    const input = CreateContextPeerDescriptorInputSchema.parse({
        id,
        peerId,
        endpoint,
        auth,
        exposedKnowledge,
        capabilities,
        graphId: options.graphId,
        displayName: options.displayName,
        queryEndpoint: options.queryEndpoint,
        metadata: options.metadata ?? {},
    });

    return {
        version: ContractVersion,
        id: input.id,
        peerId: input.peerId,
        endpoint: input.endpoint,
        graphId: input.graphId,
        displayName: input.displayName,
        auth: input.auth,
        exposedKnowledge: input.exposedKnowledge,
        capabilities: input.capabilities,
        queryEndpoint: input.queryEndpoint,
        metadata: filterPublicMetadata(input.metadata),
    };
}

const PRIVATE_METADATA_KEYS: readonly string[] = [
    "content",
    "contentBody",
    "rawContent",
    "payload",
    "rawPayload",
    "logEntry",
    "eventPayload",
    "privateData",
    "secret",
    "secrets",
    "token",
    "apiKey",
    "password",
    "credentials",
];

function filterPublicMetadata(metadata: Metadata): Metadata {
    const result: Metadata = {};

    for (const [key, value] of Object.entries(metadata)) {
        if (!PRIVATE_METADATA_KEYS.includes(key)) {
            result[key] = value;
        }
    }

    return result;
}

function getStringArrayMetadata(
    metadata: Metadata,
    key: string,
): readonly string[] {
    const value = metadata[key];

    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((entry): entry is string => typeof entry === "string");
}

function getContentTypes(metadata: Metadata): readonly string[] {
    const contentTypes = getStringArrayMetadata(metadata, "contentTypes");

    if (contentTypes.length > 0) {
        return contentTypes;
    }

    const contentType = metadata.contentType;
    return typeof contentType === "string" ? [contentType] : [];
}
