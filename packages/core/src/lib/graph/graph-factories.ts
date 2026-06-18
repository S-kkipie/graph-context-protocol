import { z } from "zod";
import type { RoleDefinition } from "../role/role-types";
import type { EdgeId, GraphId, Metadata, NodeId, Timestamp } from "../types";
import {
    EdgeIdSchema,
    MetadataSchema,
    NodeIdSchema,
    TimestampSchema,
} from "../types";
import type {
    AgentNode,
    EdgeType,
    Graph,
    GraphConfig,
    GraphEdge,
    GraphNode,
    KnowledgeNode,
    SerializedGraphEdge,
} from "./graph-types";
import { EdgeTypeSchema } from "./graph-types";

/**
 * Graph factory functions.
 *
 * @module graph/graph-factories
 */

/**
 * Schema for serialized graph edge validation.
 */
export const SerializedGraphEdgeSchema = z.object({
    version: z.literal(1),
    id: EdgeIdSchema,
    source: NodeIdSchema,
    target: NodeIdSchema,
    type: EdgeTypeSchema,
    metadata: MetadataSchema.default({}),
    createdAt: TimestampSchema,
    bidirectional: z.boolean().default(false),
});

/**
 * Abstract base class for graph edges.
 * Provides shared implementation for all edge types.
 */
export abstract class BaseGraphEdge<TType extends string = string>
    implements GraphEdge<TType>
{
    readonly id: EdgeId;
    readonly source: NodeId;
    readonly target: NodeId;
    readonly type: TType;
    readonly metadata: Metadata;
    readonly createdAt: Timestamp;
    readonly bidirectional: boolean;

    constructor(
        id: EdgeId,
        source: NodeId,
        target: NodeId,
        type: TType,
        metadata: Metadata,
        createdAt: Timestamp,
        bidirectional: boolean,
    ) {
        this.id = id;
        this.source = source;
        this.target = target;
        this.type = type;
        this.metadata = metadata;
        this.createdAt = createdAt;
        this.bidirectional = bidirectional;
    }

    getEdgeType(): TType {
        return this.type;
    }

    isValidBetween(_source: GraphNode, _target: GraphNode): boolean {
        return true;
    }

    toJSON(): SerializedGraphEdge {
        return {
            version: 1,
            id: this.id,
            source: this.source,
            target: this.target,
            type: this.type,
            metadata: this.metadata,
            createdAt: this.createdAt,
            bidirectional: this.bidirectional,
        };
    }
}

/**
 * Access edge - represents read access relationship.
 */
export class AccessEdge extends BaseGraphEdge<"can-access"> {
    constructor(
        id: EdgeId,
        source: NodeId,
        target: NodeId,
        metadata: Metadata = {},
        createdAt: Timestamp = new Date().toISOString(),
        bidirectional: boolean = false,
    ) {
        super(
            id,
            source,
            target,
            "can-access",
            metadata,
            createdAt,
            bidirectional,
        );
    }
}

/**
 * Modify edge - represents write/modify access relationship.
 */
export class ModifyEdge extends BaseGraphEdge<"can-modify"> {
    constructor(
        id: EdgeId,
        source: NodeId,
        target: NodeId,
        metadata: Metadata = {},
        createdAt: Timestamp = new Date().toISOString(),
        bidirectional: boolean = false,
    ) {
        super(
            id,
            source,
            target,
            "can-modify",
            metadata,
            createdAt,
            bidirectional,
        );
    }
}

/**
 * Traverse edge - represents traversal permission.
 */
export class TraverseEdge extends BaseGraphEdge<"can-traverse"> {
    constructor(
        id: EdgeId,
        source: NodeId,
        target: NodeId,
        metadata: Metadata = {},
        createdAt: Timestamp = new Date().toISOString(),
        bidirectional: boolean = false,
    ) {
        super(
            id,
            source,
            target,
            "can-traverse",
            metadata,
            createdAt,
            bidirectional,
        );
    }
}

/**
 * Dependency edge - represents dependency relationship.
 */
export class DependencyEdge extends BaseGraphEdge<"depends-on"> {
    constructor(
        id: EdgeId,
        source: NodeId,
        target: NodeId,
        metadata: Metadata = {},
        createdAt: Timestamp = new Date().toISOString(),
        bidirectional: boolean = false,
    ) {
        super(
            id,
            source,
            target,
            "depends-on",
            metadata,
            createdAt,
            bidirectional,
        );
    }
}

/**
 * Notification edge - represents notification relationship.
 */
export class NotificationEdge extends BaseGraphEdge<"notifies"> {
    constructor(
        id: EdgeId,
        source: NodeId,
        target: NodeId,
        metadata: Metadata = {},
        createdAt: Timestamp = new Date().toISOString(),
        bidirectional: boolean = false,
    ) {
        super(
            id,
            source,
            target,
            "notifies",
            metadata,
            createdAt,
            bidirectional,
        );
    }
}

/**
 * Custom edge - for user-defined edge types.
 */
export class CustomEdge extends BaseGraphEdge<string> {
    constructor(
        id: EdgeId,
        source: NodeId,
        target: NodeId,
        type: string,
        metadata: Metadata = {},
        createdAt: Timestamp = new Date().toISOString(),
        bidirectional: boolean = false,
    ) {
        super(id, source, target, type, metadata, createdAt, bidirectional);
    }
}

/**
 * Input schema for createNode function.
 */
export const CreateNodeInputSchema = z.object({
    id: NodeIdSchema,
    metadata: MetadataSchema.default({}),
    kind: z.string().default("generic"),
});

/**
 * Creates a new graph node with validation.
 *
 * @param id - Unique identifier for the node
 * @param role - Role definition for the node
 * @param metadata - Optional metadata
 * @param kind - Node kind (defaults to "generic")
 * @returns A new GraphNode instance
 * @throws {z.ZodError} If inputs are invalid
 */
export function createNode(
    id: NodeId,
    role: RoleDefinition,
    metadata: Metadata = {},
    kind = "generic",
): GraphNode {
    const input = CreateNodeInputSchema.parse({ id, metadata, kind });
    const createdAt = new Date().toISOString();

    return {
        id: input.id,
        kind: input.kind,
        role,
        metadata: input.metadata,
        createdAt,
        withRole(newRole: RoleDefinition): GraphNode {
            return createNode(id, newRole, metadata, input.kind);
        },
        withMetadata(newMetadata: Metadata): GraphNode {
            return createNode(
                id,
                role,
                { ...metadata, ...newMetadata },
                input.kind,
            );
        },
    };
}

/**
 * Creates an agent node.
 */
export function createAgentNode(
    id: NodeId,
    role: RoleDefinition,
    metadata: Metadata = {},
): AgentNode {
    const node = createNode(id, role, metadata, "agent");
    return node as AgentNode;
}

/**
 * Creates a knowledge node.
 */
export function createKnowledgeNode(
    id: NodeId,
    role: RoleDefinition,
    metadata: Metadata = {},
): KnowledgeNode {
    const node = createNode(id, role, metadata, "knowledge");
    return node as KnowledgeNode;
}

/**
 * Input schema for createEdge function.
 */
export const CreateEdgeInputSchema = z.object({
    id: EdgeIdSchema,
    source: NodeIdSchema,
    target: NodeIdSchema,
    type: EdgeTypeSchema,
    metadata: MetadataSchema.default({}),
    bidirectional: z.boolean().default(false),
});

/**
 * Creates a new graph edge with validation.
 * Returns the appropriate edge class based on type.
 *
 * @param id - Unique identifier for the edge
 * @param source - Source node ID
 * @param target - Target node ID
 * @param type - Type of relationship
 * @param metadata - Optional metadata
 * @param bidirectional - Whether the edge is bidirectional
 * @returns A new GraphEdge instance of the appropriate class
 * @throws {z.ZodError} If inputs are invalid
 */
export function createEdge(
    id: EdgeId,
    source: NodeId,
    target: NodeId,
    type: EdgeType,
    metadata: Metadata = {},
    bidirectional = false,
): GraphEdge {
    const input = CreateEdgeInputSchema.parse({
        id,
        source,
        target,
        type,
        metadata,
        bidirectional,
    });

    const createdAt = new Date().toISOString();

    // Return appropriate edge class based on type
    switch (input.type) {
        case "can-access":
            return new AccessEdge(
                input.id,
                input.source,
                input.target,
                input.metadata,
                createdAt,
                input.bidirectional,
            );
        case "can-modify":
            return new ModifyEdge(
                input.id,
                input.source,
                input.target,
                input.metadata,
                createdAt,
                input.bidirectional,
            );
        case "can-traverse":
            return new TraverseEdge(
                input.id,
                input.source,
                input.target,
                input.metadata,
                createdAt,
                input.bidirectional,
            );
        case "depends-on":
            return new DependencyEdge(
                input.id,
                input.source,
                input.target,
                input.metadata,
                createdAt,
                input.bidirectional,
            );
        case "notifies":
            return new NotificationEdge(
                input.id,
                input.source,
                input.target,
                input.metadata,
                createdAt,
                input.bidirectional,
            );
        default:
            return new CustomEdge(
                input.id,
                input.source,
                input.target,
                input.type,
                input.metadata,
                createdAt,
                input.bidirectional,
            );
    }
}

/**
 * Definition for registering custom edge types.
 */
export interface EdgeDefinition<
    TType extends string = string,
    TEdge extends GraphEdge<TType> = GraphEdge<TType>,
> {
    readonly type: TType;
    create(
        id: EdgeId,
        source: NodeId,
        target: NodeId,
        metadata?: Metadata,
        bidirectional?: boolean,
    ): TEdge;
}

/**
 * Immutable registry for edge type definitions.
 */
export class EdgeRegistry {
    private readonly definitions: ReadonlyMap<string, EdgeDefinition>;

    constructor(definitions: ReadonlyMap<string, EdgeDefinition> = new Map()) {
        this.definitions = definitions;
    }

    /**
     * Gets an edge definition by type.
     */
    get(type: string): EdgeDefinition | undefined {
        return this.definitions.get(type);
    }

    /**
     * Registers a new edge definition.
     * Returns a new registry (immutable).
     */
    register<TType extends string, TEdge extends GraphEdge<TType>>(
        definition: EdgeDefinition<TType, TEdge>,
    ): EdgeRegistry {
        const newDefinitions = new Map(this.definitionsMap);
        newDefinitions.set(definition.type, definition);
        return new EdgeRegistry(newDefinitions);
    }

    /**
     * Creates an edge using the registered definition.
     * Falls back to CustomEdge for unknown types.
     */
    createEdge(
        id: EdgeId,
        source: NodeId,
        target: NodeId,
        type: string,
        metadata: Metadata = {},
        bidirectional = false,
    ): GraphEdge {
        const definition = this.get(type);
        if (definition) {
            return definition.create(
                id,
                source,
                target,
                metadata,
                bidirectional,
            );
        }
        return new CustomEdge(
            id,
            source,
            target,
            type,
            metadata,
            new Date().toISOString(),
            bidirectional,
        );
    }

    private get definitionsMap(): Map<string, EdgeDefinition> {
        return new Map(this.definitions);
    }
}

/**
 * Creates the default edge registry with built-in edge types.
 */
export function createDefaultEdgeRegistry(): EdgeRegistry {
    const registry = new EdgeRegistry();
    return registry
        .register({
            type: "can-access",
            create: (id, source, target, metadata, bidirectional) =>
                new AccessEdge(
                    id,
                    source,
                    target,
                    metadata,
                    new Date().toISOString(),
                    bidirectional,
                ),
        })
        .register({
            type: "can-modify",
            create: (id, source, target, metadata, bidirectional) =>
                new ModifyEdge(
                    id,
                    source,
                    target,
                    metadata,
                    new Date().toISOString(),
                    bidirectional,
                ),
        })
        .register({
            type: "can-traverse",
            create: (id, source, target, metadata, bidirectional) =>
                new TraverseEdge(
                    id,
                    source,
                    target,
                    metadata,
                    new Date().toISOString(),
                    bidirectional,
                ),
        })
        .register({
            type: "depends-on",
            create: (id, source, target, metadata, bidirectional) =>
                new DependencyEdge(
                    id,
                    source,
                    target,
                    metadata,
                    new Date().toISOString(),
                    bidirectional,
                ),
        })
        .register({
            type: "notifies",
            create: (id, source, target, metadata, bidirectional) =>
                new NotificationEdge(
                    id,
                    source,
                    target,
                    metadata,
                    new Date().toISOString(),
                    bidirectional,
                ),
        });
}

/**
 * Default edge registry instance.
 */
export const defaultEdgeRegistry = createDefaultEdgeRegistry();

/**
 * Serializes a graph edge to a plain object.
 */
export function serializeEdge(edge: GraphEdge): SerializedGraphEdge {
    return edge.toJSON();
}

/**
 * Deserializes a plain object to a graph edge.
 * Uses the registry to create the appropriate edge type.
 */
export function deserializeEdge(
    data: unknown,
    registry: EdgeRegistry = defaultEdgeRegistry,
): GraphEdge {
    const edge = SerializedGraphEdgeSchema.parse(data);
    return registry.createEdge(
        edge.id,
        edge.source,
        edge.target,
        edge.type,
        edge.metadata,
        edge.bidirectional,
    );
}

/**
 * Creates a new immutable graph with the given nodes and edges.
 */
export function createGraph(
    id: GraphId,
    nodes: ReadonlyMap<NodeId, GraphNode> = new Map(),
    edges: ReadonlyMap<EdgeId, GraphEdge> = new Map(),
    config?: GraphConfig,
): Graph {
    const graphConfig = config ?? {
        maxDepth: 10,
        allowCycles: true,
        defaultRole: {
            id: "role:default",
            name: "Default",
            description: "Default role",
            capabilities: [],
            contextRules: [],
            metadata: {},
            hasCapability: () => false,
            getEffectiveCapabilities: () => [],
            getEffectiveContextRules: () => [],
        },
    };

    return {
        id,
        nodes,
        edges,
        config: graphConfig,

        addNode(node: GraphNode): Graph {
            const newNodes = new Map(nodes);
            newNodes.set(node.id, node);
            return createGraph(id, newNodes, edges, graphConfig);
        },

        removeNode(nodeId: NodeId): Graph {
            const newNodes = new Map(nodes);
            newNodes.delete(nodeId);

            const newEdges = new Map(edges);
            for (const [edgeId, edge] of edges) {
                if (edge.source === nodeId || edge.target === nodeId) {
                    newEdges.delete(edgeId);
                }
            }

            return createGraph(id, newNodes, newEdges, graphConfig);
        },

        addEdge(edge: GraphEdge): Graph {
            const newEdges = new Map(edges);
            newEdges.set(edge.id, edge);
            return createGraph(id, nodes, newEdges, graphConfig);
        },

        removeEdge(edgeId: EdgeId): Graph {
            const newEdges = new Map(edges);
            newEdges.delete(edgeId);
            return createGraph(id, nodes, newEdges, graphConfig);
        },

        getNodeEdges(nodeId: NodeId): readonly GraphEdge[] {
            const result: GraphEdge[] = [];
            for (const edge of edges.values()) {
                if (edge.source === nodeId || edge.target === nodeId) {
                    result.push(edge);
                }
            }
            return result;
        },

        hasPath(source: NodeId, target: NodeId): boolean {
            if (source === target) return true;

            const visited = new Set<NodeId>();
            const queue: NodeId[] = [source];
            visited.add(source);

            while (queue.length > 0) {
                const current = queue.shift();
                if (current === undefined) continue;

                for (const edge of edges.values()) {
                    let next: NodeId | null = null;

                    if (edge.source === current) {
                        next = edge.target;
                    } else if (edge.bidirectional && edge.target === current) {
                        next = edge.source;
                    }

                    if (next && !visited.has(next)) {
                        if (next === target) return true;
                        visited.add(next);
                        queue.push(next);
                    }
                }
            }

            return false;
        },
    };
}
