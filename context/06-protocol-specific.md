# Protocol-Specific Guidelines

> Guidelines specific to the Graph Context Protocol implementation.

## Graph Node Design

Nodes should be:
- **Immutable**: Changes create new node instances
- **Context-aware**: Carry role and permission information
- **Serializable**: Can be serialized to JSON for transmission
- **Typed**: Have a `kind` field for node taxonomy

```typescript
interface GraphNode {
    readonly id: NodeId;
    readonly kind: NodeKind;  // "agent", "knowledge", "context", "generic"
    readonly role: RoleDefinition;
    readonly metadata: NodeMetadata;
    readonly createdAt: Timestamp;

    withRole(role: RoleDefinition): GraphNode;
    withMetadata(metadata: Partial<NodeMetadata>): GraphNode;
    canAccess(context: GraphContext): boolean;
}
```

### Node Taxonomy

The protocol supports different node types:

```typescript
// Agent node - can discover, query, and communicate
interface AgentNode extends GraphNode {
    readonly kind: "agent";
}

// Knowledge node - contains information/documents
interface KnowledgeNode extends GraphNode {
    readonly kind: "knowledge";
}
```

### Creating Typed Nodes

```typescript
// Generic node (backward compatible)
const node = createNode('node-1', role, { key: 'value' });

// Agent node
const agent = createAgentNode('agent:researcher', role, {
    capabilities: ['cap:read-context']
});

// Knowledge node
const doc = createKnowledgeNode('knowledge:api-docs', role, {
    tags: ['api', 'documentation'],
    contentType: 'text/markdown',
    source: 'github.com/org/repo'
});
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
    DISCOVER_AGENTS: "cap:discover-agents",
    DISCOVER_KNOWLEDGE: "cap:discover-knowledge",
    QUERY_REMOTE_CONTEXT: "cap:query-remote-context",
    DISCOVER_PEERS: "cap:discover-peers",
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
    | "context-query"
    | "context-query-response"
    | "action-request"
    | "action-response"
    | "notification"
    | "error";
```

### Message Priority

```typescript
type MessagePriority = "low" | "normal" | "high" | "critical";
```

## Remote Context Query

The primary protocol flow is **read-first**: principals query permitted context exposed by knowledge nodes, rather than sending direct messages. **Task delegation** rides the same request/response path but requires a stricter capability than read access — its result is an action outcome rather than stored context. Denial-fallback ("ask the agent directly when a read is denied") is one special case of delegation, gated by owner policy.

### Context Query Request

```typescript
interface ContextQueryRequest {
    readonly contractVersion: "gcp-context-contract/v1";
    readonly queryId: string;
    readonly requester: RequesterDescriptor;
    readonly targetNodeId: NodeId;
    readonly mode: QueryMode;
    readonly query: string | Record<string, unknown>;
    readonly filters?: Record<string, unknown>;
    readonly metadata: Record<string, unknown>;
}

interface RequesterDescriptor {
    readonly principalId: string;
    readonly roles: readonly RoleId[];
    readonly capabilities: readonly CapabilityId[];
    readonly metadata: Record<string, unknown>;
}
```

The `requester` field is **audit metadata only** and is never trusted for authorization. The server must authenticate the caller independently through its configured `AuthProvider`.

### Context Query Response

```typescript
interface ContextQueryResponse {
    readonly contractVersion: "gcp-context-contract/v1";
    readonly queryId: string;
    readonly status: ContextQueryStatus;
    readonly sourceNodeId: NodeId;
    readonly result?: unknown;
    readonly error?: string;
    readonly provenance?: Record<string, unknown>;
    readonly metadata: Record<string, unknown>;
}

type ContextQueryStatus = "ok" | "denied" | "not-found" | "invalid-query" | "unavailable" | "error";
```

### Server Handler Flow

1. **Validate payload** with `ContextQueryRequestSchema`
2. **Authenticate caller** via `AuthProvider` (not from `requester` descriptor)
3. **Resolve target node** from local graph
4. **Authorize access** against node's `gcp.accessPolicy` metadata
5. **Execute query** against exactly one matching knowledge adapter
6. **Return result** without transferring source ownership

Denied queries never call knowledge adapters.

## Node-Centered Authorization

Access decisions are local and node-centered. The target knowledge node's owner grants access through its `gcp.accessPolicy` metadata:

```typescript
interface AccessPolicyDescriptor {
    readonly readableByRoles: readonly RoleId[];
    readonly requiredCapabilities: readonly CapabilityId[];
    readonly fallbackAllowed: boolean;
    readonly denialMode: "error" | "empty-result" | "fallback-if-allowed";
}
```

### Authorization Sequence

```text
incoming context query
    ↓
authenticate with host app adapter
    ↓
resolve Principal
    ↓
map Principal to RoleDefinition and capabilities
    ↓
resolve target knowledge node
    ↓
parse gcp.accessPolicy from node metadata
    ↓
check principal role against readableByRoles
    ↓
check principal capabilities against requiredCapabilities
    ↓
delegate to AuthProvider for baseline authorization
    ↓
authorize query or return denied
```

Example policy on a knowledge node:

```typescript
const eventsPolicy = createAccessPolicyDescriptor(
    ["role:ceo", "role:developer"],
    [SystemCapabilities.QUERY_REMOTE_CONTEXT],
    false,  // fallback not allowed
    "error"
);

const knowledgeNode = createKnowledgeNode(
    'knowledge:issues-today',
    role,
    createMetadataWithAccessPolicy(eventsPolicy, {
        tags: ['issues', 'today'],
        knowledgeType: 'issues'
    })
);
```

## Context Peer Descriptors

Peers advertise queryable knowledge surfaces through typed descriptors that are safe to expose before authorization:

```typescript
interface ContextPeerDescriptor {
    readonly version: "gcp-context-contract/v1";
    readonly id: string;
    readonly peerId: PeerId;
    readonly endpoint: string;
    readonly graphId?: string;
    readonly displayName?: string;
    readonly auth: AuthContract;
    readonly exposedKnowledge: readonly ExposedKnowledgeDescriptor[];
    readonly capabilities: readonly string[];
    readonly queryEndpoint?: string;
    readonly metadata: Record<string, unknown>;
}
```

Descriptors separate **discovery-time metadata** from **query-time data**. A peer descriptor reveals that `knowledge:events` exists and requires `role:developer`, but never reveals event contents until a valid `ContextQueryRequest` passes local auth and policy checks.

### Building a Peer Descriptor

```typescript
const peerDescriptor = createContextPeerDescriptor(
    'descriptor:node-b',
    'peer:node-b',
    'https://node-b.example.com',
    createAuthContract(['bearer-token'], true, ['role:developer']),
    [
        createExposedKnowledgeDescriptor(
            'knowledge:node-b-events',
            'events',
            true,
            createKnowledgeQueryContract(['text', 'structured'], true, ['since', 'tag']),
            createAccessPolicyDescriptor(
                ['role:developer', 'role:ceo'],
                [SystemCapabilities.QUERY_REMOTE_CONTEXT],
                false,
                'error'
            ),
            ['events', 'today'],
            ['application/json']
        )
    ],
    [SystemCapabilities.QUERY_REMOTE_CONTEXT, SystemCapabilities.DISCOVER_PEERS]
);
```

## Edge Types (Extensible System)

The protocol supports an extensible edge system where edges are class-based and can be customized:

### Built-in Edge Types

```typescript
export const BuiltInEdgeTypeSchema = z.enum([
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

### Custom Edges

Create custom edge types by extending `BaseGraphEdge`:

```typescript
class CustomEdge extends BaseGraphEdge<"my-edge-type"> {
    override isValidBetween(source: GraphNode, target: GraphNode): boolean {
        // Custom validation logic
        return source.kind === "agent" && target.kind === "knowledge";
    }
}

// Register in registry
const registry = defaultEdgeRegistry.register({
    type: "my-edge-type",
    create: (id, source, target, metadata, bidirectional) => 
        new CustomEdge(id, source, target, "my-edge-type", metadata, new Date().toISOString(), bidirectional)
});
```

### Edge Registry

The `EdgeRegistry` allows registering and creating custom edge types:

```typescript
const registry = createDefaultEdgeRegistry();
const customRegistry = registry.register(customEdgeDefinition);
const edge = customRegistry.createEdge("edge:1", "node:a", "node:b", "my-edge-type");
```

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

## Discovery System

The discovery system allows agents to find other agents and knowledge in the graph through BFS traversal with role-based access control.

### Discovery Query

```typescript
interface DiscoveryQuery {
    readonly kinds?: readonly NodeKind[];        // Filter by node type
    readonly maxDepth?: number;                   // BFS depth limit (default: 10)
    readonly edgeTypes?: readonly EdgeType[];    // Which edges to follow
    readonly filters?: DiscoveryFilters;          // Additional filters
}
```

### Discovery Filters

```typescript
interface DiscoveryFilters {
    readonly nodeIds?: readonly NodeId[];
    readonly metadata?: Metadata;
    readonly roleIds?: readonly RoleId[];
    readonly capabilities?: readonly CapabilityId[];  // For agent nodes
    readonly tags?: readonly string[];                // For knowledge nodes
    readonly tagMode?: "any" | "all";                 // Tag matching mode
    readonly contentTypes?: readonly string[];        // For knowledge nodes
    readonly sources?: readonly string[];             // For knowledge nodes
}
```

### Discovery Functions

```typescript
// Discover any nodes
const result = discoverNodes(graph, 'agent:researcher', {
    kinds: ['agent', 'knowledge'],
    maxDepth: 3,
    edgeTypes: ['can-traverse', 'can-access'],
    filters: {
        metadata: { status: 'active' },
        tags: ['documentation']
    }
});

// Discover agents specifically
const agents = discoverAgents(graph, 'agent:researcher', {
    capabilities: ['cap:read-context'],
    roleIds: ['role:admin']
});

// Discover knowledge specifically
const knowledge = discoverKnowledge(graph, 'agent:researcher', {
    tags: ['api', 'documentation'],
    tagMode: 'any',
    contentTypes: ['text/markdown']
});
```

### Discovery Result

```typescript
interface DiscoveryResult<T extends GraphNode> {
    readonly requester: AgentNode;
    readonly nodes: readonly DiscoveredNode<T>[];
    readonly denied: readonly NodeId[];
}

interface DiscoveredNode<T extends GraphNode> {
    readonly node: T;
    readonly path: readonly NodeId[];
    readonly distance: number;
}
```

### Access Control for Discovery

Discovery requires specific capabilities:

```typescript
// Role that can discover agents
const role = createRole(
    'role:coordinator',
    'Coordinator',
    'Can discover and coordinate agents',
    [
        createCapability(SystemCapabilities.DISCOVER_AGENTS, 'Discover Agents', ''),
        createCapability(SystemCapabilities.TRAVERSE_GRAPH, 'Traverse Graph', '')
    ],
    [
        { path: 'graph.nodes.agent', access: 'read' }
    ]
);

// Role that can discover knowledge
const researcherRole = createRole(
    'role:researcher',
    'Researcher',
    'Can discover knowledge sources',
    [
        createCapability(SystemCapabilities.DISCOVER_KNOWLEDGE, 'Discover Knowledge', ''),
        createCapability(SystemCapabilities.TRAVERSE_GRAPH, 'Traverse Graph', '')
    ],
    [
        { path: 'graph.nodes.knowledge', access: 'read' }
    ]
);
```

### Context Rules for Discovery

Discovery respects context rules with path matching:

- `graph.nodes.agent` - Controls access to agent discovery
- `graph.nodes.knowledge` - Controls access to knowledge discovery
- `graph.nodes.*` - Wildcard for all node types

Deny rules override allow rules:

```typescript
// Allow all discovery except agents
[
    { path: 'graph.nodes.*', access: 'read' },
    { path: 'graph.nodes.agent', access: 'none' }
]
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
- [Direction](./11-direction.md) - Strategic direction for read-first context query
- [Research & Evaluation](./12-research-and-evaluation.md) - Thesis, benchmark suite, prior art
