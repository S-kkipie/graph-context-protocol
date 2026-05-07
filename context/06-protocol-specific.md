# Protocol-Specific Guidelines

> Guidelines specific to the Graph Context Protocol implementation.

## Graph Node Design

Nodes should be:
- **Immutable**: Changes create new node instances
- **Context-aware**: Carry role and permission information
- **Serializable**: Can be serialized to JSON for transmission

```typescript
interface GraphNode {
    readonly id: NodeId;
    readonly role: RoleDefinition;
    readonly metadata: NodeMetadata;
    readonly createdAt: Timestamp;

    withRole(role: RoleDefinition): GraphNode;
    withMetadata(metadata: Partial<NodeMetadata>): GraphNode;
    canAccess(context: GraphContext): boolean;
}
```

### Node Factory Pattern

```typescript
export function createNode(
    id: NodeId,
    role: RoleDefinition,
    metadata: Metadata = {},
): GraphNode {
    const input = CreateNodeInputSchema.parse({ id, metadata });

    return {
        id: input.id,
        role,
        metadata: input.metadata,
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

## Context Propagation

Context should flow through the graph based on:

1. **Role permissions**: What each node is allowed to access
2. **Edge types**: Some edges allow context flow, others block it
3. **Scope rules**: Context may be narrowed as it propagates

```typescript
interface ContextPropagation {
    readonly sourceContext: GraphContext;
    readonly targetNode: GraphNode;
    readonly propagatedContext: GraphContext;
    readonly filtersApplied: ContextFilter[];
}
```

### Propagation Rules

- Target node must have matching context rules (access !== "none")
- Filters can exclude fields from propagated context
- Path tracks traversal history
- Immutable - returns new context, doesn't modify source

```typescript
export function propagateContext(
    context: GraphContext,
    targetNode: GraphNode,
    filters: readonly ContextFilter[] = [],
): PropagationResult {
    const canAccess = targetNode.role.contextRules.some(
        (rule) =>
            rule.access !== "none" &&
            context.accumulatedData[rule.path] !== undefined,
    );

    if (!canAccess) {
        return {
            sourceContext: context,
            targetNode,
            propagatedContext: context,
            filtersApplied: filters,
            success: false,
            error: "Target node does not have access to context data",
        };
    }

    const filteredData = applyFilters(context.accumulatedData, filters);
    const propagatedContext: GraphContext = {
        ...context,
        currentNode: targetNode.id,
        accumulatedData: filteredData,
        path: [...context.path, targetNode.id],
    };

    return {
        sourceContext: context,
        targetNode,
        propagatedContext,
        filtersApplied: filters,
        success: true,
    };
}
```

## Role Definition

Roles should be:
- **Composable**: Built from smaller capability units
- **Hierarchical**: Can inherit from base roles
- **Verifiable**: Runtime validation of role compatibility

```typescript
interface RoleDefinition {
    readonly name: string;
    readonly extends?: RoleId;
    readonly capabilities: readonly Capability[];
    readonly contextRules: readonly ContextRule[];

    hasCapability(capabilityId: CapabilityId): boolean;
    canTraverse(edgeType: EdgeType): boolean;
    getEffectiveContextRules(): readonly ContextRule[];
}
```

### System Roles

Predefined roles for common use cases:

```typescript
export const SystemRoles = {
    ADMIN: "role:admin",
    AGENT: "role:agent",
    USER: "role:user",
    OBSERVER: "role:observer",
} as const;
```

### System Capabilities

Predefined capabilities:

```typescript
export const SystemCapabilities = {
    READ_CONTEXT: "cap:read-context",
    WRITE_CONTEXT: "cap:write-context",
    TRAVERSE_GRAPH: "cap:traverse-graph",
    MODIFY_GRAPH: "cap:modify-graph",
    SEND_MESSAGES: "cap:send-messages",
    RECEIVE_MESSAGES: "cap:receive-messages",
} as const;
```

## Protocol Messages

Messages carry:
- **Header**: Routing, priority, and metadata
- **Context**: Current graph context snapshot
- **Payload**: Operation-specific data
- **Provenance**: Path traversal history

```typescript
interface ProtocolMessage {
    readonly header: MessageHeader;
    readonly context: GraphContext;
    readonly payload: unknown;
    readonly provenance: readonly MessageProvenance[];
}

interface MessageHeader {
    readonly messageId: MessageId;
    readonly correlationId?: MessageId;
    readonly source: NodeId;
    readonly target: NodeId;
    readonly type: MessageType;
    readonly priority: MessagePriority;
    readonly timestamp: Timestamp;
    readonly ttl: number;
    readonly metadata: Metadata;
}

interface MessageProvenance {
    readonly nodeId: NodeId;
    readonly timestamp: Timestamp;
    readonly action: "received" | "processed" | "forwarded";
}
```

### Message Types

```typescript
type MessageType =
    | "context-request"
    | "context-response"
    | "action-request"
    | "action-response"
    | "notification"
    | "error";
```

### Message Priority

```typescript
type MessagePriority = "low" | "normal" | "high" | "critical";
```

## Edge Types

Types of relationships between nodes:

```typescript
export const EdgeTypeSchema = z.enum([
    "can-access",
    "can-modify",
    "can-traverse",
    "depends-on",
    "notifies",
    "custom",
]);
```

- **can-access**: Source can access target's context
- **can-modify**: Source can modify target
- **can-traverse**: Source can traverse through target
- **depends-on**: Source depends on target
- **notifies**: Source receives notifications from target
- **custom**: User-defined relationship

## Context Rules

Rules for context data access:

```typescript
interface ContextRule {
    readonly path: string;
    readonly access: "read" | "write" | "none";
    readonly conditions?: readonly string[];
}
```

- **read**: Can read data at path
- **write**: Can read and write data at path
- **none**: Cannot access data at path

## Validation

Context data must comply with role rules:

```typescript
export function validateContext(context: GraphContext): boolean {
    const { role, accumulatedData } = context;

    for (const rule of role.contextRules) {
        if (
            rule.access === "none" &&
            accumulatedData[rule.path] !== undefined
        ) {
            return false;
        }
    }

    return true;
}
```

## Message Expiration

Messages can expire based on TTL:

```typescript
export function isMessageExpired(message: ProtocolMessage): boolean {
    const now = Date.now();
    const created = new Date(message.header.timestamp).getTime();
    const ttlMs = message.header.ttl * 1000;

    return now - created > ttlMs;
}
```

Default TTL: 60 seconds

## See Also

- [Architecture](./01-architecture.md) - Overall architecture
- [Patterns](./03-patterns.md) - Implementation patterns
- [Testing](./04-testing.md) - Testing guidelines
