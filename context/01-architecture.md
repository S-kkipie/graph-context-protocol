# Architecture Principles

> Core architectural concepts and patterns for the Graph Context Protocol.

## Overview

The Graph Context Protocol (GCP) is a **graph-based, role-based context protocol** for communication between AI Native Apps and Autonomous Agents. Unlike A2A-style direct messaging, it uses structured context sharing through graph relationships.

## Core Concepts

### Graph-Based Context

The protocol is built on graph structures where:

1. **Nodes** represent agents, contexts, or capability endpoints
2. **Edges** represent relationships, permissions, or message paths
3. **Context** flows through the graph based on role permissions and edge types

```typescript
interface GraphContext {
    // Unique identifier for this context instance
    id: ContextId;

    // Reference to the graph this context belongs to
    graphId: GraphId;

    // Current node in the graph where context is active
    currentNode: NodeId;

    // Accumulated context data from traversed path
    accumulatedData: ContextData;

    // Role-based permissions for context access
    rolePermissions: RolePermission[];
}
```

### Role-Based Access

Roles define:
- What context data can be accessed
- Which graph edges can be traversed
- What operations can be performed
- Context propagation rules

```typescript
interface RoleDefinition {
    name: string;
    capabilities: Capability[];
    contextAccess: ContextAccessRule[];
    traversalPermissions: EdgeType[];
}
```

### Protocol Messages

Messages in the protocol carry:
- **Header**: Routing, priority, and metadata
- **Context**: Current graph context snapshot
- **Payload**: Operation-specific data
- **Provenance**: Path traversal history

## Module Architecture

Each domain module follows a consistent structure:

```
lib/
├── types.ts           # Domain-specific types and interfaces
├── implementation.ts  # Factory functions and business logic
├── index.ts           # Public API exports (barrel)
└── *.spec.ts          # Co-located tests
```

### Design Principles

1. **Separation of Concerns**: Types are separate from implementation
2. **Immutability**: All data structures are immutable
3. **Validation**: Runtime validation with Zod schemas
4. **Pure Functions**: Minimize side effects
5. **Explicit Exports**: No wildcard exports in public API

## Domain Modules

### Core Types (`lib/types.ts`)
Base identifiers used across all domains:
- `NodeId`, `EdgeId`, `GraphId`
- `ContextId`, `RoleId`, `CapabilityId`, `MessageId`
- `Timestamp`, `Metadata`

### Result Type (`lib/result.ts`)
Functional error handling pattern:
```typescript
type Result<T, E = Error> =
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error: E };
```

### Graph Domain (`lib/graph/`)
Graph data structures and operations:
- `GraphNode` - Immutable nodes with roles
- `GraphEdge` - Directed edges with types
- `Graph` - Graph container with operations
- Factory functions: `createNode()`, `createEdge()`

### Role Domain (`lib/role/`)
Role definitions and capability management:
- `RoleDefinition` - Role with capabilities and context rules
- `Capability` - Specific capability that can be granted
- `ContextRule` - Rules for context data access
- Factory functions: `createRole()`, `createCapability()`

### Context Domain (`lib/context/`)
Context propagation and scoping:
- `GraphContext` - Context snapshot at a node
- `ContextFilter` - Filters for context propagation
- `PropagationResult` - Result of context propagation
- Functions: `createContext()`, `propagateContext()`, `validateContext()`

### Protocol Domain (`lib/protocol/`)
Protocol messages and handlers:
- `ProtocolMessage` - Complete message structure
- `MessageHeader` - Routing and metadata
- `MessageProvenance` - Path tracking
- Functions: `createMessageHeader()`, `createProtocolMessage()`

## Cross-Domain Dependencies

```
base-types (types.ts)
    ↑
result (result.ts)
    ↑
role (lib/role/) ← uses base-types
    ↑
graph (lib/graph/) ← uses role, base-types
    ↑
context (lib/context/) ← uses graph, role, base-types
    ↑
protocol (lib/protocol/) ← uses context, base-types
```

## File Organization

### Naming Conventions

- **Files**: kebab-case (`graph-node.ts`, `role-manager.ts`)
- **Types/Interfaces**: PascalCase (`GraphNode`, `RoleDefinition`)
- **Functions**: camelCase (`createNode`, `propagateContext`)
- **Constants**: UPPER_SNAKE_CASE for true constants
- **Classes**: PascalCase, prefer composition over inheritance

### Directory Structure

```
packages/core/src/
├── index.ts              # Public API with explicit exports
└── lib/
    ├── types.ts          # Base identifiers (NodeId, EdgeId, etc.)
    ├── result.ts         # Result<T,E> type and helpers
    ├── graph/
    │   ├── types.ts      # GraphNode, GraphEdge interfaces
    │   ├── implementation.ts # Factory functions
    │   ├── index.ts      # Barrel exports
    │   └── graph.spec.ts # Tests
    ├── role/
    │   ├── types.ts      # RoleDefinition, Capability
    │   ├── implementation.ts
    │   ├── index.ts
    │   └── role.spec.ts
    ├── context/
    │   ├── types.ts      # GraphContext, ContextFilter
    │   ├── implementation.ts
    │   ├── index.ts
    │   └── context.spec.ts
    └── protocol/
        ├── types.ts      # ProtocolMessage, MessageHeader
        ├── implementation.ts
        ├── index.ts
        └── protocol.spec.ts
```

## See Also

- [Code Style](./02-code-style.md) - Formatting and conventions
- [Patterns](./03-patterns.md) - Common implementation patterns
- [Protocol Specific](./06-protocol-specific.md) - GCP-specific guidelines
