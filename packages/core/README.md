# @graph-context-protocol/core

> Core library for the Graph Context Protocol - A TypeScript library for graph-based, role-based context sharing between AI Native Apps and Autonomous Agents.

## Overview

This package provides the foundational data structures and operations for the Graph Context Protocol, enabling:

- **Graph-based context flow** - Context propagates through graph relationships, not direct messaging
- **Role-based access control** - Capabilities and context rules define what nodes can access
- **Immutable data structures** - All operations return new objects, never mutate
- **Runtime validation** - Zod schemas ensure data integrity

## Architecture

The core is organized into domain modules, each with separated types and implementation:

```
src/lib/
├── types.ts              # Base identifiers (NodeId, EdgeId, Metadata, Timestamp)
├── result.ts             # Result<T,E> type for functional error handling
├── graph/                # Graph data structures
│   ├── types.ts          # GraphNode, GraphEdge, EdgeType, NodeKind interfaces
│   ├── implementation.ts # createNode(), createEdge(), createGraph() factories
│   ├── index.ts          # Public exports
│   └── graph.spec.ts     # Tests
├── role/                 # Role and capability management
│   ├── types.ts          # RoleDefinition, Capability, ContextRule
│   ├── implementation.ts # createRole(), createCapability() factories
│   ├── index.ts          # Public exports
│   └── role.spec.ts      # Tests
├── context/              # Context propagation
│   ├── types.ts          # GraphContext, ContextFilter, PropagationResult
│   ├── implementation.ts # createContext(), propagateContext()
│   ├── index.ts          # Public exports
│   └── context.spec.ts   # Tests
├── protocol/             # Protocol messages
│   ├── types.ts          # ProtocolMessage, MessageHeader, MessageProvenance
│   ├── implementation.ts # createMessageHeader(), createProtocolMessage()
│   ├── index.ts          # Public exports
│   └── protocol.spec.ts  # Tests
└── discovery/            # Discovery and query system
    ├── types.ts          # DiscoveryQuery, DiscoveryResult, DiscoveryFilters
    ├── implementation.ts # discoverNodes(), discoverAgents(), discoverKnowledge()
    ├── index.ts          # Public exports
    └── discovery.spec.ts # Tests
```

## Key Features

### Graph Domain (`graph/`)

Immutable graph nodes with role bindings:

```typescript
const node = createNode('node-1', role, { key: 'value' });
const updatedNode = node.withRole(newRole);
const withMetadata = node.withMetadata({ new: 'data' });
```

Typed edges between nodes (extensible system):

```typescript
// Built-in edge types
const edge = createEdge(
    'edge-1',
    'node-a',
    'node-b',
    'can-access',
    { weight: 1 },
    true // bidirectional
);

// Custom edge types via registry
const registry = defaultEdgeRegistry.register({
    type: 'my-custom-edge',
    create: (id, source, target, metadata, bidirectional) => 
        new CustomEdge(id, source, target, 'my-custom-edge', metadata, new Date().toISOString(), bidirectional)
});
```

Graph container with immutable operations:

```typescript
const graph = createGraph('graph:main')
    .addNode(createAgentNode('agent:1', role))
    .addNode(createKnowledgeNode('knowledge:1', role))
    .addEdge(createEdge('edge:1', 'agent:1', 'knowledge:1', 'can-access'));
```

### Role Domain (`role/`)

Composable roles with capabilities:

```typescript
const capability = createCapability(
    'cap:read-context',
    'Read Context',
    'Can read context data'
);

const role = createRole(
    'role:admin',
    'Administrator',
    'Full system access',
    [capability],
    [{ path: '*', access: 'read' }]
);

// Check capabilities
role.hasCapability('cap:read-context'); // true
```

Context rules define data access:

```typescript
const rule = createContextRule('user.name', 'read');
const denyRule = createContextRule('secrets', 'none');
```

### Context Domain (`context/`)

Context propagates through the graph with filtering:

```typescript
const context = createContext(
    'ctx:1',
    'graph:1',
    'node:start',
    role,
    { 'user.name': 'John', 'session.id': 'abc' }
);

const result = propagateContext(context, targetNode, [
    createContextFilter('session.id', 'exclude')
]);

result.success; // true if target can access
result.propagatedContext.accumulatedData; // { 'user.name': 'John' }
```

### Protocol Domain (`protocol/`)

Messages carry context and provenance:

```typescript
const header = createMessageHeader(
    'msg:1',
    'node:source',
    'node:target',
    'context-request',
    { priority: 'high', ttl: 120 }
);

const message = createProtocolMessage(header, context, { action: 'fetch' });

// Track message path
const forwarded = addProvenance(message, 'node:intermediate', 'forwarded');

// Check expiration
isMessageExpired(message); // false
```

### Discovery Domain (`discovery/`)

Agents can discover other agents and knowledge through the graph:

```typescript
// Discover all reachable nodes
const result = discoverNodes(graph, 'agent:researcher', {
    kinds: ['agent', 'knowledge'],
    maxDepth: 3,
    edgeTypes: ['can-traverse', 'can-access'],
    filters: {
        metadata: { status: 'active' },
        tags: ['documentation']
    }
});

// Discover agents with specific capabilities
const agents = discoverAgents(graph, 'agent:researcher', {
    capabilities: ['cap:read-context', 'cap:write-context'],
    roleIds: ['role:admin', 'role:developer']
});

// Discover knowledge by tags
const docs = discoverKnowledge(graph, 'agent:researcher', {
    tags: ['api', 'documentation'],
    tagMode: 'any',
    contentTypes: ['text/markdown', 'text/plain'],
    maxDepth: 2
});

console.log(result.nodes);    // Discovered nodes with paths
console.log(result.denied);   // Node IDs found but access denied
```

Role-based discovery access:

```typescript
const role = createRole(
    'role:researcher',
    'Researcher',
    'Can discover agents and knowledge',
    [
        createCapability(SystemCapabilities.DISCOVER_AGENTS, 'Discover Agents', ''),
        createCapability(SystemCapabilities.DISCOVER_KNOWLEDGE, 'Discover Knowledge', '')
    ],
    [
        { path: 'graph.nodes.agent', access: 'read' },
        { path: 'graph.nodes.knowledge', access: 'read' }
    ]
);
```

## Design Principles

1. **Immutable Data** - All structures use readonly properties
2. **Pure Functions** - No mutations, always return new objects
3. **Validation First** - Zod schemas validate all public function inputs
4. **Explicit Exports** - No wildcard exports, everything is intentional
5. **Co-located Tests** - Test files live next to source (`.spec.ts`)

## API Reference

### Base Types

- `NodeId`, `EdgeId`, `GraphId` - Unique identifiers
- `ContextId`, `RoleId`, `CapabilityId`, `MessageId` - Domain identifiers
- `Timestamp` - ISO 8601 timestamps
- `Metadata` - Flexible metadata records
- `NodeKind` - Node type discriminator ('agent', 'knowledge', 'context', 'generic')
- `EdgeType` - Edge type for relationships

### Node Types

- `GraphNode` - Base node interface with `kind` field
- `AgentNode` - Node representing an agent (`kind: 'agent'`)
- `KnowledgeNode` - Node representing knowledge/information (`kind: 'knowledge'`)

### Edge System

- `BaseGraphEdge<TType>` - Abstract base class for edges
- `AccessEdge`, `ModifyEdge`, `TraverseEdge` - Built-in edge classes
- `DependencyEdge`, `NotificationEdge`, `CustomEdge` - Additional edge classes
- `EdgeRegistry` - Registry for custom edge types
- `EdgeDefinition` - Type for edge registration
- `serializeEdge()` / `deserializeEdge()` - Edge serialization

### Graph Container

- `Graph` - Immutable graph container
- `createGraph(id)` - Create new graph
- `graph.addNode(node)` - Add node (returns new graph)
- `graph.removeNode(nodeId)` - Remove node (returns new graph)
- `graph.addEdge(edge)` - Add edge (returns new graph)
- `graph.removeEdge(edgeId)` - Remove edge (returns new graph)
- `graph.getNode(nodeId)` - Get node by ID
- `graph.getEdge(edgeId)` - Get edge by ID
- `graph.getNodeEdges(nodeId)` - Get all edges connected to a node
- `graph.hasPath(from, to, maxDepth?)` - Check if path exists between nodes

### Discovery Types

- `DiscoveryQuery` - Query parameters for discovery
- `DiscoveryResult<T>` - Discovery results with nodes and paths
- `DiscoveryFilters` - Filters for agents and knowledge
- `DiscoveredNode<T>` - Discovered node with path and distance
- `DiscoveryError` - Error class for discovery failures

### Result Type

```typescript
type Result<T, E = Error> =
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error: E };

const result = validateWithSchema(NodeIdSchema, input);
if (result.success) {
    // use result.data
}
```

### System Constants

```typescript
SystemRoles.ADMIN      // 'role:admin'
SystemRoles.AGENT      // 'role:agent'
SystemRoles.USER       // 'role:user'
SystemRoles.OBSERVER   // 'role:observer'

SystemCapabilities.READ_CONTEXT      // 'cap:read-context'
SystemCapabilities.WRITE_CONTEXT     // 'cap:write-context'
SystemCapabilities.TRAVERSE_GRAPH    // 'cap:traverse-graph'
SystemCapabilities.DISCOVER_AGENTS   // 'cap:discover-agents'
SystemCapabilities.DISCOVER_KNOWLEDGE // 'cap:discover-knowledge'
// ... etc
```

## Testing

81 tests cover all domains:

```bash
# Run all tests
pnpm nx test core

# Watch mode
pnpm nx test core --watch

# Coverage
pnpm nx test core --coverage
```

## Installation

```bash
pnpm add @graph-context-protocol/core
```

## Usage

```typescript
import {
    createNode,
    createAgentNode,
    createKnowledgeNode,
    createEdge,
    createGraph,
    createRole,
    createCapability,
    createContext,
    propagateContext,
    discoverAgents,
    discoverKnowledge,
    SystemRoles,
    SystemCapabilities
} from '@graph-context-protocol/core';

// Create a role with capabilities
const role = createRole(
    'role:agent',
    'AI Agent',
    'Autonomous agent role',
    [
        createCapability(
            SystemCapabilities.READ_CONTEXT,
            'Read',
            'Can read context'
        )
    ],
    [
        { path: 'public.*', access: 'read' },
        { path: 'private.*', access: 'none' }
    ]
);

// Create a node with this role
const node = createNode('agent-1', role, { version: '1.0' });

// Create context at this node
const context = createContext(
    'ctx:1',
    'graph:main',
    node.id,
    role,
    { 'public.data': 'value', 'private.secret': 'hidden' }
);

// Create a graph with typed nodes
const graph = createGraph('graph:main')
    .addNode(createAgentNode('agent:1', role))
    .addNode(createKnowledgeNode('knowledge:1', role, {
        tags: ['documentation'],
        contentType: 'text/markdown'
    }))
    .addEdge(createEdge('edge:1', 'agent:1', 'knowledge:1', 'can-access'));

// Discover agents and knowledge
const agents = discoverAgents(graph, 'agent:1');
const docs = discoverKnowledge(graph, 'agent:1', {
    tags: ['documentation']
});
```

## Dependencies

- **zod** - Runtime validation
- No runtime dependencies on other packages

## See Also

- [Main README](../../README.md) - Project overview
- [Architecture](../../context/01-architecture.md) - Detailed architecture
- [Protocol Specific](../../context/06-protocol-specific.md) - GCP guidelines

---

*Part of the Graph Context Protocol suite*
