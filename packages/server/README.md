# @graph-context-protocol/server

> Framework-agnostic server runtime for the Graph Context Protocol - TypeScript library for hosting external agents and external knowledge sources.

## Overview

This package provides a **framework-agnostic** server runtime that extends `@graph-context-protocol/core` with:

- **Transport abstraction** - Pluggable transport layer (HTTP, WebSocket, etc. via adapters)
- **External agent management** - Register and communicate with agents outside the local graph
- **External knowledge sources** - Integrate with external knowledge APIs and databases
- **Connection state tracking** - Manage connections, sessions, and authentication
- **Protocol message routing** - Route messages to local handlers, external agents, or knowledge sources
- **Lifecycle management** - Start, stop, and graceful shutdown with hooks
- **Caching & sync** - In-memory cache and knowledge synchronization

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                @graph-context-protocol/server                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐     ┌────────────────┐     ┌───────────────┐ │
│  │ Server       │────▶│ Lifecycle      │────▶│ Transport(s)  │ │
│  │ Runtime      │     │ Manager        │     │ abstraction   │ │
│  └──────┬───────┘     └────────────────┘     └───────┬───────┘ │
│         │                                             │         │
│         ▼                                             ▼         │
│  ┌──────────────┐     ┌────────────────┐     ┌───────────────┐ │
│  │ Protocol     │◀───▶│ Router /       │◀───▶│ Handler       │ │
│  │ Messages     │     │ Dispatcher     │     │ Registry      │ │
│  └──────┬───────┘     └────────────────┘     └───────────────┘ │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐     ┌────────────────┐     ┌───────────────┐ │
│  │ External     │────▶│ Connection /   │────▶│ Auth /        │ │
│  │ Agents       │     │ Session State  │     │ Authorization │ │
│  └──────────────┘     └────────────────┘     └───────────────┘ │
│                                                                 │
│  ┌──────────────┐     ┌────────────────┐     ┌───────────────┐ │
│  │ External     │────▶│ Knowledge      │────▶│ Cache / Sync  │ │
│  │ Knowledge    │     │ Adapter Registry│    │ Policies      │ │
│  └──────────────┘     └────────────────┘     └───────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                 @graph-context-protocol/core                   │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
pnpm add @graph-context-protocol/server
```

## Quick Start

```typescript
import {
    createGraphContextServer,
    createMemoryTransport,
    createStaticTokenAuthProvider,
} from "@graph-context-protocol/server";

// Create a server
const server = createGraphContextServer({
    id: "server:1",
    localNodeId: "node:local",
    shutdownTimeoutMs: 30000,
});

// Start the server
await server.start();

// The server is now ready to accept connections
console.log("Server status:", server.status); // "ready"

// Graceful shutdown
await server.stop();
```

## Modules

### Server Runtime

Main server composition that wires all modules together:

```typescript
import { createGraphContextServer } from "@graph-context-protocol/server";

const server = createGraphContextServer(config, {
    // Optional custom dependencies
    auth: customAuthProvider,
    transports: customTransportRegistry,
    // ... etc
});

await server.start();
await server.stop();
```

### Lifecycle Management

Manage server start/stop with hooks:

```typescript
import { createLifecycleManager } from "@graph-context-protocol/server";

const lifecycle = createLifecycleManager()
    .register({
        name: "init-db",
        phase: "before-start",
        run: async (ctx) => { /* init database */ }
    })
    .register({
        name: "cleanup",
        phase: "after-stop",
        run: async (ctx) => { /* cleanup */ }
    });

await lifecycle.start(context);
await lifecycle.stop(context, { timeoutMs: 5000 });
```

### Transport Abstraction

Pluggable transport layer with in-memory implementation for testing:

```typescript
import {
    createTransportRegistry,
    createMemoryTransport,
} from "@graph-context-protocol/server";

const registry = createTransportRegistry([
    createMemoryTransport("transport:memory"),
]);

await registry.startAll();
```

### Connection Management

Track connections and sessions:

```typescript
import { createConnectionManager } from "@graph-context-protocol/server";

const connections = createConnectionManager();

const conn = connections.open({
    transportId: "transport:ws",
    externalAgentId: "agent:external",
});

// Authenticate
connections.authenticate(conn.id, principal);

// Heartbeat
connections.heartbeat(conn.id);

// Close
connections.close(conn.id);
```

### Authentication

Extensible auth providers:

```typescript
import {
    createAllowAllAuthProvider,
    createStaticTokenAuthProvider,
} from "@graph-context-protocol/server";

// For testing - allows everything
const allowAll = createAllowAllAuthProvider();

// Static token validation
const staticAuth = createStaticTokenAuthProvider(new Map([
    ["token123", { id: "user:1", capabilities: ["read"] }],
]));
```

### External Agent Registry

Manage agents outside the local graph:

```typescript
import { createExternalAgentRegistry } from "@graph-context-protocol/server";

const agents = createExternalAgentRegistry();

agents.register({
    id: "agent:external",
    nodeId: "node:external",
    capabilities: ["cap:read-context"],
    transportId: "transport:ws",
    endpoint: "ws://example.com/agent",
    status: "registered",
    metadata: {},
});

const agent = agents.getByNodeId("node:external");
```

### Knowledge Source Registry

Integrate external knowledge sources:

```typescript
import { createKnowledgeSourceRegistry } from "@graph-context-protocol/server";

const knowledge = createKnowledgeSourceRegistry();

knowledge.register({
    id: "knowledge:docs",
    capabilities: ["lookup", "search"],
    async query(request) {
        // Query external knowledge source
        return {
            sourceId: "knowledge:docs",
            nodes: [],
            metadata: {},
        };
    },
});
```

### Message Routing

Route protocol messages to appropriate targets:

```typescript
import { createMessageRouter } from "@graph-context-protocol/server";

const router = createMessageRouter();

const route = router.route(message, {
    localNodeId: "node:local",
    connections,
    externalAgents,
    knowledgeSources,
});

// Route.kind will be:
// - "local-handler" for local processing
// - "external-agent" for external agent delivery
// - "undeliverable" if target not found
```

### Protocol Handlers

Register handlers for different message types:

```typescript
import { createHandlerRegistry } from "@graph-context-protocol/server";

const handlers = createHandlerRegistry();

handlers.register({
    name: "context-handler",
    messageTypes: ["context-request"],
    async handle(message, context) {
        // Process context request
        return {
            handled: true,
            response: /* response message */,
            metadata: {},
        };
    },
});
```

### Cache

In-memory cache with TTL and tag invalidation:

```typescript
import { createMemoryCacheStore } from "@graph-context-protocol/server";

const cache = createMemoryCacheStore();

await cache.set("key", value, {
    ttlMs: 60000,
    tags: ["knowledge"],
});

const value = await cache.get("key");
await cache.invalidateTag("knowledge");
```

### Sync Scheduler

Coordinate knowledge synchronization:

```typescript
import { createSyncScheduler } from "@graph-context-protocol/server";

const sync = createSyncScheduler();

const result = await sync.run({
    sourceId: "knowledge:docs",
    mode: "full",
});

console.log(`Added: ${result.nodesAdded}, Updated: ${result.nodesUpdated}`);
```

## Integration with Core Package

The server package builds on top of `@graph-context-protocol/core`:

```typescript
import {
    createAgentNode,
    createKnowledgeNode,
    createRole,
    createCapability,
    SystemCapabilities,
} from "@graph-context-protocol/core";

// Create nodes that can be used with the server
const agent = createAgentNode("agent:1", role);
const knowledge = createKnowledgeNode("knowledge:1", role, {
    tags: ["docs"],
    contentType: "text/markdown",
});
```

## Framework Adapters

The server package is framework-agnostic. To integrate with Express, Fastify, or other frameworks, create a transport adapter:

```typescript
import type { Transport, TransportEnvelope } from "@graph-context-protocol/server";

function createExpressTransport(app: Express.Application): Transport {
    return {
        id: "transport:express",
        status: "idle",
        async start() { /* ... */ },
        async stop() { /* ... */ },
        async send(envelope) { /* ... */ },
        onMessage(listener) { /* ... */ },
        snapshot() { /* ... */ },
    };
}
```

## Testing

The package includes in-memory implementations for testing:

```typescript
import {
    createGraphContextServer,
    createMemoryTransport,
    createAllowAllAuthProvider,
    createMemoryCacheStore,
} from "@graph-context-protocol/server";

const server = createGraphContextServer(
    { id: "test", localNodeId: "node:test", shutdownTimeoutMs: 1000 },
    {
        auth: createAllowAllAuthProvider(),
        cache: createMemoryCacheStore(),
    }
);

await server.start();
// Run tests
await server.stop();
```

## Design Principles

1. **Framework-agnostic** - No dependencies on Express, Fastify, or HTTP libraries
2. **Pluggable transports** - Support HTTP, WebSocket, or custom protocols
3. **Immutable state** - All operations return new state objects
4. **Result types** - Use `Result<T, E>` for error handling instead of exceptions
5. **Type-safe** - Full TypeScript support with strict mode

## API Reference

See `src/index.ts` for all exported types and functions.

## License

MIT
