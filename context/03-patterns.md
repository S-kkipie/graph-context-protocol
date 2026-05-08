# Common Patterns

> Reusable patterns and idioms used throughout the codebase.

## Result Type

Functional error handling pattern for operations that can fail:

```typescript
export type Result<T, E = Error> =
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error: E };

export function succeed<T>(data: T): Result<T, never> {
    return { success: true, data };
}

export function fail<E>(error: E): Result<never, E> {
    return { success: false, error };
}

export function validateWithSchema<T>(
    schema: z.ZodSchema<T>,
    data: unknown,
): Result<T, z.ZodError> {
    const result = schema.safeParse(data);

    if (result.success) {
        return succeed(result.data);
    }

    return fail(result.error);
}

// Usage
function parseContext(data: unknown): Result<GraphContext, ParseError> {
    try {
        const context = validateContext(data);
        return succeed(context);
    } catch (error) {
        return fail(new ParseError('Invalid context', error));
    }
}
```

## Immutable Data Structures

All data structures should be immutable:

```typescript
interface GraphNode {
    readonly id: NodeId;
    readonly role: RoleDefinition;
    readonly metadata: Metadata;
    readonly createdAt: Timestamp;

    // Returns new instance instead of mutating
    withRole(role: RoleDefinition): GraphNode;
    withMetadata(metadata: Metadata): GraphNode;
}

// Implementation using closures
export function createNode(
    id: NodeId,
    role: RoleDefinition,
    metadata: Metadata = {},
): GraphNode {
    return {
        id,
        role,
        metadata,
        createdAt: new Date().toISOString(),
        withRole(newRole: RoleDefinition): GraphNode {
            return createNode(id, newRole, metadata);
        },
        withMetadata(newMetadata: Metadata): GraphNode {
            return createNode(id, role, { ...metadata, ...newMetadata });
        },
    };
}
```

## Factory Functions with Validation

Use Zod schemas for input validation in factory functions:

```typescript
export const CreateNodeInputSchema = z.object({
    id: NodeIdSchema,
    metadata: MetadataSchema.default({}),
});

export function createNode(
    id: NodeId,
    role: RoleDefinition,
    metadata: Metadata = {},
): GraphNode {
    const input = CreateNodeInputSchema.parse({ id, metadata });
    const createdAt = new Date().toISOString();

    return {
        id: input.id,
        role,
        metadata: input.metadata,
        createdAt,
        withRole(newRole: RoleDefinition): GraphNode {
            return createNode(id, newRole, metadata);
        },
        withMetadata(newMetadata: Metadata): GraphNode {
            return createNode(id, role, { ...metadata, ...newMetadata });
        },
    };
}
```

## Builder Pattern

For complex object construction:

```typescript
export class GraphBuilder {
    private nodes: GraphNode[] = [];
    private edges: GraphEdge[] = [];
    private config: Partial<GraphConfig> = {};

    addNode(node: GraphNode): this {
        this.nodes.push(node);
        return this;
    }

    addEdge(edge: GraphEdge): this {
        this.edges.push(edge);
        return this;
    }

    withConfig(config: Partial<GraphConfig>): this {
        this.config = { ...this.config, ...config };
        return this;
    }

    build(): Graph {
        return new Graph(this.nodes, this.edges, this.config as GraphConfig);
    }
}

// Usage
const graph = new GraphBuilder()
    .addNode(agentNode)
    .addNode(contextNode)
    .addEdge(permissionEdge)
    .withConfig({ maxDepth: 5 })
    .build();
```

## Type Guards

For runtime type checking:

```typescript
export function isGraphNode(value: unknown): value is GraphNode {
    return (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        'role' in value &&
        typeof (value as GraphNode).id === 'string'
    );
}

export function assertGraphNode(value: unknown): asserts value is GraphNode {
    if (!isGraphNode(value)) {
        throw new TypeError('Value is not a GraphNode');
    }
}
```

## Pure Functions

Minimize side effects, make data flow explicit:

```typescript
// ❌ Bad: Mutates input
function addNode(graph: Graph, node: GraphNode): void {
    graph.nodes.push(node); // Mutates input
}

// ✅ Good: Returns new object
function withNode(graph: Graph, node: GraphNode): Graph {
    return {
        ...graph,
        nodes: [...graph.nodes, node]
    };
}
```

## Barrel Exports

Each module exposes its public API through an `index.ts` barrel file, re-exporting from semantic file names:

```typescript
// lib/graph/index.ts
// Types
export type {
    EdgeType,
    Graph,
    GraphConfig,
    GraphEdge,
    GraphNode,
} from "./graph-types";

// Schemas
export { EdgeTypeSchema } from "./graph-types";

// Factories
export {
    CreateNodeInputSchema,
    createNode,
    CreateEdgeInputSchema,
    createEdge,
} from "./graph-factories";

// Type guards
export { isAgentNode, isKnowledgeNode } from "./graph-type-guards";
```

## Error Handling

Use descriptive error types:

```typescript
export class GraphTraversalError extends Error {
    constructor(
        message: string,
        public readonly path: NodeId[],
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'GraphTraversalError';
    }
}

export class ValidationError extends Error {
    constructor(
        message: string,
        public readonly field: string,
        public readonly value: unknown
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}
```

## Schema-First Design

Define Zod schemas before types:

```typescript
// Schema first
export const CapabilityIdSchema = z.string().min(1);

// Type derived from schema
export type CapabilityId = z.infer<typeof CapabilityIdSchema>;

// Input validation schema
export const CreateCapabilityInputSchema = z.object({
    id: CapabilityIdSchema,
    name: z.string().min(1),
    description: z.string(),
    metadata: MetadataSchema.default({}),
});

// Factory function
export function createCapability(
    id: CapabilityId,
    name: string,
    description: string,
    metadata: Metadata = {},
): Capability {
    const input = CreateCapabilityInputSchema.parse({
        id,
        name,
        description,
        metadata,
    });

    return {
        id: input.id,
        name: input.name,
        description: input.description,
        metadata: input.metadata,
    };
}
```

## See Also

- [Architecture](./01-architecture.md) - Overall architecture
- [Code Style](./02-code-style.md) - Formatting and conventions
- [Testing](./04-testing.md) - Testing patterns
