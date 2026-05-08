# Server Runtime Demo

A demonstration of the `@graph-context-protocol/server` runtime using Express HTTP server with both in-memory and HTTP transports.

## Use Case: Multi-Agent Orchestration with External Knowledge

This demo simulates a real-world scenario where an **AI orchestrator server** manages multiple agents and integrates with external knowledge sources through a unified protocol, exposed via HTTP REST API.

### The Problem

In production AI systems, you typically face these challenges:

1. **Heterogeneous agents** - You have internal agents (within your graph) and external agents (third-party services, other teams' agents) that need to communicate
2. **External knowledge** - Your agents need to query external databases, APIs, or documentation systems that aren't part of your core graph
3. **Protocol consistency** - All communication must follow a standardized protocol with proper routing, authentication, and provenance tracking
4. **HTTP accessibility** - The server needs to be accessible via HTTP for integration with web services, microservices, and external systems
5. **Lifecycle management** - The server must start/stop gracefully, managing transports, connections, and resources

### The Solution

This demo shows how the Graph Context Protocol server runtime solves these challenges by:

- **Express HTTP server** - Full REST API with endpoints for protocol operations
- **Dual transports** - Memory transport for internal routing + Express transport for HTTP inbound/outbound
- **Registering external agents** with capabilities and transport endpoints
- **Integrating knowledge sources** as pluggable adapters that respond to protocol queries
- **Routing messages** intelligently between local handlers, external agents, and knowledge sources
- **Tracking provenance** so every message's journey is auditable
- **Managing server lifecycle** with proper start/stop semantics

## Quick Start

```bash
# Install dependencies
pnpm install

# Run the Express server
pnpm nx serve server-demo

# Or build and run directly
pnpm nx build server-demo
node apps/server-demo/dist/main.js
```

Server starts on port 3456 (configurable via `PORT` environment variable).

## HTTP API Endpoints

### GET /status
Returns the current server snapshot.

```bash
curl http://localhost:3456/status
```

**Response:**
```json
{
  "id": "server:demo",
  "status": "idle",
  "localNodeId": "agent:server",
  "activeConnections": 0,
  "activeSessions": 0,
  "transports": ["transport:memory", "transport:express"]
}
```

### POST /start
Starts the Graph Context Protocol server.

```bash
curl -X POST http://localhost:3456/start
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "server:demo",
    "status": "ready",
    "localNodeId": "agent:server",
    "startedAt": "2026-05-08T...",
    "transports": ["transport:memory", "transport:express"]
  }
}
```

### POST /stop
Stops the server gracefully.

```bash
curl -X POST http://localhost:3456/stop
```

### GET /report
Runs the demo scenario and returns the deterministic report.

```bash
curl http://localhost:3456/report
```

**Response:**
```
Server Demo Report
==================
Server ID: server:demo
Local Node: agent:server
Start Status: ready
Stop Status: stopped

Transports:
- transport:memory

Handler Result:
- handled: true

External Agent Delivery:
- delivered: true
- transport: transport:memory

Knowledge Result:
- source: knowledge:demo
```

### POST /messages
Receives a protocol message via the Express transport.

```bash
curl -X POST http://localhost:3456/messages \
  -H "Content-Type: application/json" \
  -d '{
    "header": {
      "messageId": "msg:1",
      "source": "agent:client",
      "target": "agent:server",
      "type": "context-request",
      "priority": "normal",
      "timestamp": "2026-05-08T00:00:00Z",
      "ttl": 60,
      "metadata": {}
    },
    "context": {
      "id": "ctx:1",
      "graphId": "graph:demo",
      "currentNode": "agent:client",
      "accumulatedData": {},
      "role": {"id": "role:client", "name": "Client", "capabilities": [], "rules": []},
      "metadata": {},
      "createdAt": "2026-05-08T00:00:00Z",
      "path": ["agent:client"]
    },
    "payload": {"action": "query"},
    "provenance": []
  }'
```

### POST /send
Sends a protocol message through the server.

```bash
curl -X POST http://localhost:3456/send \
  -H "Content-Type: application/json" \
  -d '{"header": {...}, "context": {...}, "payload": {...}, "provenance": []}'
```

### POST /scenario
Runs the full demo scenario (start → receive → send → stop) and returns all results.

```bash
curl -X POST http://localhost:3456/scenario
```

## Scenario Walkthrough

The demo executes this flow:

```
┌─────────────┐    HTTP      ┌─────────────────┐
│   Client    │◀────────────▶│  Express Server │
│  (curl)     │              │   Port 3456     │
└─────────────┘              └────────┬────────┘
                                      │
                                      ▼
                        ┌─────────────────────────┐
                        │  GraphContextServer     │
                        │  - Router               │
                        │  - Handlers             │
                        │  - External Agents      │
                        │  - Knowledge Sources    │
                        └────────┬────────────────┘
                                 │
           ┌─────────────────────┼─────────────────────┐
           │                     │                     │
           ▼                     ▼                     ▼
    ┌─────────────┐      ┌──────────────┐      ┌──────────────┐
    │   Memory    │      │   Express    │      │  Knowledge   │
    │  Transport  │      │  Transport   │      │   Source     │
    │ (internal)  │      │  (HTTP in)   │      │  (lookup)    │
    └─────────────┘      └──────────────┘      └──────────────┘
```

**Full Flow:**

1. Express server starts on port 3456
2. Server initialized with:
   - Memory transport (for internal routing)
   - Express transport (for HTTP inbound)
   - External agent "agent:external" registered with Express transport
   - Knowledge source "knowledge:demo" registered
3. Client sends HTTP request to `/start` → Server starts
4. Client sends HTTP request to `/messages` with protocol message
   - Message routed to local handler
   - Handler queries knowledge source
   - Returns handled result
5. Client sends HTTP request to `/send` with notification message
   - Message routed to external agent
   - Delivered via Express transport
6. Client sends HTTP request to `/stop` → Server stops gracefully

## Architecture

```
apps/server-demo/
├── src/
│   ├── main.ts              # Entry point - starts Express HTTP server
│   ├── server.ts            # Express app factory with HTTP endpoints
│   ├── server.spec.ts       # Tests for Express endpoints
│   ├── app.ts               # CLI orchestration (kept for compatibility)
│   ├── app.spec.ts          # CLI tests
│   ├── express/
│   │   └── transport.ts     # Express transport adapter implementation
│   └── demo/                # Core demo logic (graph, handlers, scenario)
│       ├── graph.ts
│       ├── handlers.ts
│       ├── scenario.ts
│       ├── scenario.spec.ts
│       ├── report.ts
│       ├── report.spec.ts
│       ├── types.ts
│       └── index.ts
├── package.json
├── vitest.config.mts
└── README.md
```

## Key Components

### `express/transport.ts`

Implements the `Transport` interface for Express HTTP:

- **start()** - Starts Express HTTP server on configured port
- **stop()** - Gracefully stops the HTTP server
- **send(envelope)** - For demo purposes, returns success (in production would HTTP POST to external endpoints)
- **onMessage(listener)** - Registers listener; incoming HTTP POSTs to `/messages` trigger the listener
- **snapshot()** - Returns current transport status

### `server.ts`

Creates the Express application with routes:

- `GET /status` - Server snapshot
- `POST /start` - Start the protocol server
- `POST /stop` - Stop the protocol server
- `POST /messages` - Receive protocol messages (Express transport inbound)
- `POST /send` - Send protocol messages
- `GET /report` - Run CLI scenario and return report
- `POST /scenario` - Run full demo scenario

### `demo/scenario.ts`

The core scenario logic that:
1. Creates the server with both memory and Express transports
2. Registers external agents and knowledge sources
3. Runs the demo flow
4. Returns results for reporting

## Testing

```bash
# Run all tests (includes Express server tests)
pnpm nx test server-demo

# Run with coverage
pnpm nx test server-demo --coverage
```

**Test Coverage:**
- CLI mode: `app.spec.ts`, `scenario.spec.ts`, `report.spec.ts`
- Express server: `server.spec.ts` tests HTTP endpoints

## When to Use This Pattern

This Express server pattern is ideal for:

- **AI agent orchestration platforms** - HTTP API for managing multiple agents
- **Context-aware API gateways** - Routing requests based on graph relationships
- **Microservices integration** - Protocol-compliant HTTP services
- **Knowledge-intensive applications** - REST API with external knowledge integration
- **Multi-tenant systems** - HTTP endpoints with tenant isolation
- **Observability-critical systems** - Full provenance tracking via HTTP API

## CLI Mode (Legacy)

The original CLI mode is still available for backward compatibility:

```bash
# Import and use programmatically
import { run } from "./app";
const report = await run();
```

## Configuration

Environment variables:

- `PORT` - HTTP server port (default: 3456)

## See Also

- [Server Package](../../packages/server/README.md) - Full server runtime documentation
- [Core Package](../../packages/core/README.md) - Graph, role, context, and protocol documentation
- [Multi-Agent Collaboration Demo](../multi-agent-collaboration/README.md) - Agent collaboration patterns
