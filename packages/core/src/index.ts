// Re-export from submodules with explicit organization

// Agent domain
export {
    createAgent,
    createDiscoverAgentsTool,
    createDiscoverKnowledgeTool,
    createGraphInfoTool,
    createSendMessageTool,
} from "./lib/agent";
export type {
    Agent,
    AgentContext,
    AgentTool,
    AgentToolResult,
} from "./lib/agent/agent-types";
export {
    ContextQueryContractVersionSchema,
    ContextQueryRequestSchema,
    ContextQueryResponseSchema,
    ContextQueryStatusSchema,
    createContext,
    createContextFilter,
    createContextQuery,
    createContextQueryResult,
    createRequesterDescriptor,
    propagateContext,
    QueryModeSchema,
    RequesterDescriptorSchema,
    validateContext,
} from "./lib/context";
export type {
    ContextQuery,
    ContextQueryContractVersion,
    ContextQueryRequest,
    ContextQueryResponse,
    ContextQueryResult,
    ContextQueryStatus,
    ContextReadProvenance,
    QueryMode,
    RequesterDescriptor,
} from "./lib/context/context-query-types";
// Context domain
export type {
    ContextData,
    ContextFilter,
    GraphContext,
    PropagationOptions,
    PropagationResult,
} from "./lib/context/context-types";
export {
    discoverAgents,
    discoverKnowledge,
    discoverNodes,
} from "./lib/discovery";
export {
    CreateAccessPolicyDescriptorInputSchema,
    CreateAuthContractInputSchema,
    CreateContextPeerDescriptorInputSchema,
    CreateExposedKnowledgeDescriptorInputSchema,
    CreateKnowledgeQueryContractInputSchema,
    CreateSourceOfTruthDescriptorInputSchema,
    createAccessPolicyDescriptor,
    createAuthContract,
    createContextPeerDescriptor,
    createExposedKnowledgeDescriptor,
    createExposedKnowledgeDescriptorFromNode,
    createKnowledgeQueryContract,
    createSourceOfTruthDescriptor,
} from "./lib/discovery/context-contract-factories";
export type {
    AccessPolicyDescriptor,
    AuthContract,
    AuthScheme,
    ContextPeerDescriptor,
    DenialMode,
    ExposedKnowledgeDescriptor,
    KnowledgeQueryContract,
    KnowledgeType,
    SourceOfTruthDescriptor,
} from "./lib/discovery/context-contract-types";
export {
    AccessPolicyDescriptorSchema,
    AuthContractSchema,
    AuthSchemeSchema,
    ContextPeerDescriptorSchema,
    ContractVersion,
    ContractVersionSchema,
    createMetadataWithAccessPolicy,
    DenialModeSchema,
    ExposedKnowledgeDescriptorSchema,
    GCP_ACCESS_POLICY_METADATA_KEY,
    KnowledgeQueryContractSchema,
    KnowledgeTypeSchema,
    parseAccessPolicyFromMetadata,
    SourceOfTruthDescriptorSchema,
} from "./lib/discovery/context-contract-types";
export type {
    DiscoveredNode,
    DiscoveryFilters,
    DiscoveryQuery,
    DiscoveryResult,
} from "./lib/discovery/discovery-types";
export { DiscoveryError } from "./lib/discovery/discovery-types";
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
} from "./lib/discovery/peer-discovery";
export {
    AccessEdge,
    BaseGraphEdge,
    BuiltInEdgeTypeSchema,
    BuiltInNodeKindSchema,
    CreateEdgeInputSchema,
    CreateNodeInputSchema,
    CustomEdge,
    createAgentNode,
    createDefaultEdgeRegistry,
    createEdge,
    createGraph,
    createKnowledgeNode,
    createNode,
    DependencyEdge,
    defaultEdgeRegistry,
    deserializeEdge,
    EdgeTypeSchema,
    ModifyEdge,
    NotificationEdge,
    serializeEdge,
    TraverseEdge,
} from "./lib/graph";
export type { EdgeDefinition, EdgeRegistry } from "./lib/graph/graph-factories";
export type {
    AgentNode,
    BuiltInEdgeType,
    BuiltInNodeKind,
    EdgeType,
    EdgeValidationContext,
    Graph,
    GraphConfig,
    GraphEdge,
    GraphNode,
    KnowledgeNode,
    NodeKind,
    SerializedGraphEdge,
} from "./lib/graph/graph-types";

export {
    addProvenance,
    createMessageHeader,
    createProtocolMessage,
    isMessageExpired,
} from "./lib/protocol";
// Protocol domain
export type {
    MessageHeader,
    MessageOptions,
    MessagePriority,
    MessageProvenance,
    MessageType,
    ProtocolMessage,
} from "./lib/protocol/protocol-types";
// Provenance / audit
export type {
    AccessDecision,
    AuditRecord,
    ReadProvenance,
    ReadProvenanceOptions,
} from "./lib/provenance";
export {
    AccessDecisionSchema,
    createReadProvenance,
    ReadProvenanceSchema,
} from "./lib/provenance";
// Result type helpers
export type { Result } from "./lib/result";
export { fail, ResultSchema, succeed, validateWithSchema } from "./lib/result";
export {
    CapabilitySchema,
    ContextRuleSchema,
    CreateCapabilityInputSchema,
    CreateContextRuleInputSchema,
    createCapability,
    createContextRule,
    createRole,
    RoleDefinitionSchema,
    SystemCapabilities,
    SystemRoles,
} from "./lib/role";
// Role domain
export type {
    Capability,
    ContextRule,
    RoleDefinition,
} from "./lib/role/role-types";
// Base types (core identifiers)
export type {
    CapabilityId,
    ContextId,
    EdgeId,
    GraphId,
    MessageId,
    Metadata,
    NodeId,
    RoleId,
    Timestamp,
} from "./lib/types";
export {
    CapabilityIdSchema,
    ContextIdSchema,
    EdgeIdSchema,
    GraphIdSchema,
    MessageIdSchema,
    MetadataSchema,
    NodeIdSchema,
    RoleIdSchema,
    TimestampSchema,
} from "./lib/types";

// Zod re-export
import { z } from "zod";

export { z };
