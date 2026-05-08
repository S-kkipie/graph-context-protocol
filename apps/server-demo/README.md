# Server Runtime Demo

A demonstration of the `@graph-context-protocol/server` runtime using the in-memory transport.

## Use Case: Multi-Agent Orchestration with External Knowledge

This demo simulates a real-world scenario where an **AI orchestrator server** manages multiple agents and integrates with external knowledge sources through a unified protocol.

### The Problem

In production AI systems, you typically face these challenges:

1. **Heterogeneous agents** - You have internal agents (within your graph) and external agents (third-party services, other teams' agents) that need to communicate
2. **External knowledge** - Your agents need to query external databases, APIs, or documentation systems that aren't part of your core graph
3. **Protocol consistency** - All communication must follow a standardized protocol with proper routing, authentication, and provenance tracking
4. **Lifecycle management** - The server must start/stop gracefully, managing transports, connections, and resources

### The Solution

This demo shows how the Graph Context Protocol server runtime solves these challenges by:

- **Registering external agents** with capabilities and transport endpoints
- **Integrating knowledge sources** as pluggable adapters that respond to protocol queries
- **Routing messages** intelligently between local handlers, external agents, and knowledge sources
- **Tracking provenance** so every message's journey is auditable
- **Managing server lifecycle** with proper start/stop semantics

### Scenario Walkthrough

The demo executes this flow:

```
1. Server starts with memory transport
2. External agent "agent:external" registers (reachable via transport:memory)
3. Knowledge source "knowledge:demo" registers (can answer lookup queries)
4. Local "context-request" message arrives → handler processes it
   - Handler queries the knowledge source
   - Returns handled result with metadata
5. "notification" message to external agent → routed via memory transport
   - Transport delivers message and captures receipt
6. Server stops gracefully
7. Report renders with all results
```

This represents a typical pattern in AI-native applications where:
- A **planner agent** sends context requests to the orchestrator
- The orchestrator **queries knowledge bases** for relevant data
- Results are **forwarded to external specialist agents** for processing
- All interactions are **tracked and reportable**

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    server:demo                               │
│  ┌──────────────┐    ┌────────────────┐    ┌─────────────┐ │
│  │   Graph      │───▶│   Router       │───▶│  Handlers   │ │
│  │  (agents +  │    │  (local/ext/   │    │ (context-   │ │
│  │  knowledge)  │    │  knowledge)    │    │  request)   │ │
│  └──────────────┘    └────────────────┘    └─────────────┘ │
│         │                                           │       │
│         ▼                                           ▼       │
│  ┌──────────────┐                         ┌─────────────┐  │
│  │ External     │                         │ Knowledge   │  │
│  │ Agent        │                         │ Sources     │  │
│  │ Registry     │                         │ Registry    │  │
│  └──────────────┘                         └─────────────┘  │
│         │                                           │       │
│         └───────────────────────────────────────────┘       │
│                         │                                   │
│                  ┌─────────────┐                            │
│                  │  Memory     │                            │
│                  │  Transport  │                            │
│                  └─────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

## Running the Demo

```bash
# Run via Nx serve (builds and executes)
pnpm nx serve server-demo

# Or build and run directly
pnpm nx build server-demo
node apps/server-demo/dist/main.js
```

**Expected Output:**

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

## Testing

```bash
# Run all tests
pnpm nx test server-demo

# Run with coverage
pnpm nx test server-demo --coverage
```

## Project Structure

```
apps/server-demo/
├── src/
│   ├── main.ts              # Entry point - executes scenario and prints report
│   ├── app.ts               # App orchestration - async run() wrapper
│   ├── app.spec.ts          # App integration test
│   └── demo/
│       ├── index.ts         # Public exports
│       ├── types.ts         # ScenarioResult type definition
│       ├── graph.ts         # Creates demo graph with agent + knowledge nodes
│       ├── handlers.ts      # Protocol handler that queries knowledge sources
│       ├── scenario.ts      # Full server lifecycle scenario runner
│       ├── scenario.spec.ts # Tests for lifecycle, routing, and knowledge queries
│       ├── report.ts        # Deterministic report renderer
│       └── report.spec.ts   # Report output tests
├── vitest.config.mts        # Vitest configuration
└── README.md                # This file
```

## Key Components Explained

### `graph.ts`
Creates a minimal graph with:
- One **agent node** (`agent:server`) - represents the orchestrator
- One **knowledge node** (`knowledge:docs`) - represents internal knowledge
- A **can-access edge** connecting them

### `handlers.ts`
Implements a protocol handler for `context-request` messages that:
- Receives the incoming message
- Queries registered knowledge sources for relevant data
- Returns a handled result with provenance metadata

### `scenario.ts`
The main orchestration that:
1. Creates the server with all registries
2. Registers external agents and knowledge sources
3. Starts the server
4. Simulates inbound local message (context-request)
5. Sends outbound notification to external agent
6. Stops the server
7. Queries knowledge sources directly
8. Returns all results for reporting

### `report.ts`
Renders a deterministic, human-readable report from the scenario results suitable for:
- Console output
- Test assertions
- CI/CD logs

## When to Use This Pattern

This server runtime pattern is ideal for:

- **AI agent orchestration platforms** - Managing multiple internal and external agents
- **Context-aware API gateways** - Routing requests based on graph relationships and capabilities
- **Knowledge-intensive applications** - Integrating external databases, search engines, or LLM providers
- **Multi-tenant systems** - Where different tenants have different agent configurations and knowledge sources
- **Observability-critical systems** - Where full provenance tracking of every decision is required

## See Also

- [Server Package](../../packages/server/README.md) - Full server runtime documentation
- [Core Package](../../packages/core/README.md) - Graph, role, context, and protocol documentation
- [Multi-Agent Collaboration Demo](../multi-agent-collaboration/README.md) - Another demo showing agent collaboration patterns
