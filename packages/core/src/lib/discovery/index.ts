export {
    discoverAgents,
    discoverKnowledge,
    discoverNodes,
} from "./discovery-functions";
export type {
    DiscoveredNode,
    DiscoveryFilters,
    DiscoveryQuery,
    DiscoveryResult,
} from "./discovery-types";
export { DiscoveryError } from "./discovery-types";

// Context contract types and factories
export type {
    AccessPolicyDescriptor,
    AuthContract,
    AuthScheme,
    ContextPeerDescriptor,
    DenialMode,
    ExposedKnowledgeDescriptor,
    KnowledgeQueryContract,
    KnowledgeType,
    QueryMode,
    SourceOfTruthDescriptor,
} from "./context-contract-types";
export {
    AccessPolicyDescriptorSchema,
    AuthContractSchema,
    AuthSchemeSchema,
    ContractVersion,
    ContractVersionSchema,
    ContextPeerDescriptorSchema,
    createMetadataWithAccessPolicy,
    DenialModeSchema,
    ExposedKnowledgeDescriptorSchema,
    GCP_ACCESS_POLICY_METADATA_KEY,
    KnowledgeQueryContractSchema,
    KnowledgeTypeSchema,
    parseAccessPolicyFromMetadata,
    QueryModeSchema,
    SourceOfTruthDescriptorSchema,
} from "./context-contract-types";
export {
    CreateAccessPolicyDescriptorInputSchema,
    createAccessPolicyDescriptor,
    CreateAuthContractInputSchema,
    createAuthContract,
    CreateContextPeerDescriptorInputSchema,
    createContextPeerDescriptor,
    CreateExposedKnowledgeDescriptorInputSchema,
    createExposedKnowledgeDescriptor,
    createExposedKnowledgeDescriptorFromNode,
    CreateKnowledgeQueryContractInputSchema,
    createKnowledgeQueryContract,
    CreateSourceOfTruthDescriptorInputSchema,
    createSourceOfTruthDescriptor,
} from "./context-contract-factories";
export {
    discoverPeerContextSources,
    filterExposedKnowledge,
    filterExposedKnowledgeByCapability,
    filterExposedKnowledgeByQueryMode,
    filterExposedKnowledgeByRole,
    filterExposedKnowledgeByTags,
    filterExposedKnowledgeByType,
    filterPeersByCapability,
    filterPeersByKnowledgeTags,
    filterPeersByQueryable,
} from "./peer-discovery";
