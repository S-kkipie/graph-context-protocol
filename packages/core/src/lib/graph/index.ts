// Types

export type { EdgeDefinition, EdgeRegistry } from "./implementation";
// Implementation - Base class and built-in edges
export {
    AccessEdge,
    BaseGraphEdge,
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
    ModifyEdge,
    NotificationEdge,
    SerializedGraphEdgeSchema,
    serializeEdge,
    TraverseEdge,
} from "./implementation";
// Type guards
export {
    isAccessEdge,
    isAgentNode,
    isBuiltInEdge,
    isCustomEdge,
    isDependencyEdge,
    isKnowledgeNode,
    isModifyEdge,
    isNotificationEdge,
    isTraverseEdge,
} from "./type-guards";
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
} from "./types";
// Schemas
export {
    BuiltInEdgeTypeSchema,
    BuiltInNodeKindSchema,
    EdgeTypeSchema,
} from "./types";
