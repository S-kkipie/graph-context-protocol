// Re-export from submodules with explicit organization

export {
    createContext,
    createContextFilter,
    propagateContext,
    validateContext,
} from "./lib/context";
// Context domain
export type {
    ContextData,
    ContextFilter,
    GraphContext,
    PropagationOptions,
    PropagationResult,
} from "./lib/context/types";
export {
    discoverAgents,
    discoverKnowledge,
    discoverNodes,
} from "./lib/discovery";
export type {
    DiscoveredNode,
    DiscoveryFilters,
    DiscoveryQuery,
    DiscoveryResult,
} from "./lib/discovery/types";
export { DiscoveryError } from "./lib/discovery/types";
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
export type { EdgeDefinition, EdgeRegistry } from "./lib/graph/implementation";
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
} from "./lib/graph/types";

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
} from "./lib/protocol/types";
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
} from "./lib/role/types";
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
