# Graph Context Protocol

> A TypeScript library for building graph-based, role-based context sharing systems between AI Native Apps and Autonomous Agents.

## The Problem

AI Native Apps and autonomous agents need to share context — decisions, logs, issues, knowledge, events — but current approaches force them into one of two broken models:

- **Direct messaging (A2A)** — Agents send messages to each other, creating tight coupling, chatty networks, and no clear ownership of who holds the source of truth. Every agent must know about every other agent.
- **Centralized knowledge stores** — A single global graph or database that everyone reads from, which breaks down at organizational boundaries and forces a single trust/auth model on all participants.

Neither model handles the reality of agentic ecosystems: each entity (an app, an agent, a team system, a company service) owns its own memory, context, and policies. A product manager agent owns user stories and roadmap decisions. A CEO may read everything. A developer reads issues and technical decisions but not confidential strategy. An external agent only sees explicitly exposed summaries. These boundaries are local — the owner decides, not a central authority.

## What is Graph Context Protocol?

**GCP** is a protocol and TypeScript SDK for **role-gated context access across independently owned graphs**. Instead of agents messaging each other, entities expose typed knowledge nodes, enforce their own authentication and authorization locally, and allow external principals to query permitted context — without copying the source of truth.

The primary flow is **read-first**: peers expose queryable knowledge surfaces, authenticate callers locally, authorize access against owner-side policy, and return permitted context results. This approach provides:

- **Local ownership is absolute** — Every entity owns its graph, auth, policy, and source of truth
- **Context access over conversation** — Read authorized context instead of asking agents to explain themselves
- **Role-gated boundaries** — The owner decides who can discover or query each knowledge node
- **Knowledge stays local** — External callers receive query results, not ownership of the remote knowledge base
- **Federation is optional** — Discovery works through nearby peers, registries, or local config — no global graph required
- **Auditability** — Full provenance tracking of context changes

Direct messages can exist as a policy-controlled fallback, but they are not the primary protocol model. Think of each participant as a semi-autonomous entity in an agentic ecosystem — it owns memory, context, tools, and policies, and decides what others can read.

### What Can GCP Model?

Every readable context source becomes a `knowledge` node in a local graph:

| Kind | Example |
|------|---------|
| RAG indexes | Product docs, issue memory, vector-backed retrieval |
| Logs | Operational logs, agent execution history |
| Events | Timeline of actions, deployments, decisions |
| Decisions | Architecture decisions, product approvals |
| Issues | Tickets, user stories, bugs, tasks |
| Documents | Markdown, PDFs, specs, contracts |
| Metrics | Aggregated operational or product metrics |

The protocol cares that it is queryable context with metadata and access policy — the storage engine comes later through adapters.

## Packages

### `@graph-context-protocol/core`

Core library providing the foundational data structures and operations:

- **Graph Domain** - Immutable nodes (agents, knowledge) and extensible typed edges
- **Role Domain** - Role-based access control with capabilities
- **Context Domain** - Context propagation with filtering and remote query
- **Protocol Domain** - Message handling with provenance tracking
- **Discovery Domain** - Query and discovery system with peer descriptors and access contracts

See [packages/core/README.md](./packages/core/README.md) for detailed documentation.

### `@graph-context-protocol/server`

Framework-agnostic server runtime that extends the core with:

- **Transport abstraction** - Pluggable HTTP, WebSocket, or custom transports
- **Protocol handlers** - Default `context-query` handler with auth and authorization
- **Knowledge adapter registry** - Targeted single-adapter query execution
- **External agent management** - Register and communicate with agents outside the local graph
- **Lifecycle management** - Start, stop, and graceful shutdown with hooks

See [packages/server/README.md](./packages/server/README.md) for detailed documentation.

### Demo Applications

The `apps/` directory contains example applications demonstrating GCP in practice, including MVP demos of the read-first context query flow between independently owned nodes.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Graph Context Protocol                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌────────────────┐     ┌───────────────┐ │
│  │   @graph     │────▶│   @graph       │────▶│   demo apps   │ │
│  │   -context   │     │   -server      │     │   in /apps    │ │
│  │   -protocol  │     │   runtime      │     │               │ │
│  │   /core      │     │                │     │               │ │
│  └──────┬───────┘     └───────┬────────┘     └───────────────┘ │
│         │                     │                                 │
│         ▼                     ▼                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │
│  │  Graph   │───▶│  Role    │───▶│ Context  │                  │
│  │  Nodes   │    │  Access  │    │  Query   │                  │
│  └──────────┘    └──────────┘    └──────────┘                  │
│         │                            │                          │
│         └────────────────────────────┘                          │
│                                      │                          │
│                              ┌───────▼──────┐                  │
│                              │   Protocol   │                  │
│                              │   Messages   │                  │
│                              └──────────────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Run tests
pnpm nx test core

# Build the project
pnpm nx run-many -t build

# Visualize project graph
pnpm nx graph
```

## Key Concepts

### Graph-Based Context

Context flows through the graph based on node relationships:

```typescript
const node = createNode('agent-1', role);
const edge = createEdge('edge-1', 'agent-1', 'context-1', 'can-access');
```

### Node Taxonomy

Nodes can be agents or knowledge containers:

```typescript
// Agent node - can discover and query
const agent = createAgentNode('agent:planner', role);

// Knowledge node - contains information
const doc = createKnowledgeNode('knowledge:specs', role, {
    tags: ['api', 'documentation'],
    contentType: 'text/markdown'
});
```

### Discovery System

Agents can discover other agents and knowledge in the graph:

```typescript
// Discover reachable agents
const agents = discoverAgents(graph, 'agent:researcher', {
    capabilities: ['cap:read-context']
});

// Discover knowledge with filters
const knowledge = discoverKnowledge(graph, 'agent:researcher', {
    tags: ['documentation'],
    tagMode: 'any',
    maxDepth: 2
});
```

### Remote Context Query

Peers can advertise queryable knowledge surfaces with safe descriptors and then authorize each query locally:

```typescript
const requester = createRequesterDescriptor(
    'principal:developer',
    ['role:developer'],
    [SystemCapabilities.QUERY_REMOTE_CONTEXT]
);

const query = createContextQuery(
    'query:events-today',
    requester,
    'knowledge:node-b-events',
    'text',
    'what did node B do today?'
);
```

The server-side `context-query` handler treats `requester` as audit metadata only. It authenticates credentials through the configured auth provider, checks the target knowledge node's `gcp.accessPolicy`, and only then executes the targeted knowledge adapter.

### Role-Based Access

Roles define what context data can be accessed:

```typescript
const role = createRole(
    'role:agent',
    'AI Agent',
    'Autonomous agent',
    [createCapability('cap:read', 'Read', 'Can read data')],
    [{ path: 'public.*', access: 'read' }]
);
```

### Context Propagation

Context propagates with filtering based on permissions:

```typescript
const context = createContext('ctx:1', 'graph:1', node.id, role, data);
const result = propagateContext(context, targetNode, filters);
```

## Development

### Prerequisites

- Node.js 20+
- pnpm 8+

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd graph-context-protocol

# Install dependencies
pnpm install
```

### Development Commands

```bash
# Format code (REQUIRED before commits)
pnpm format

# Run all tests (core, server, demos)
pnpm nx run-many -t test

# Run tests for specific project
pnpm nx test core
pnpm nx test server

# Type check all projects
pnpm nx run-many -t typecheck

# Build all projects
pnpm nx run-many -t build

# Build specific project
pnpm nx build <project-name>
```

## Project Structure

```
├── context/                    # Documentation
│   ├── 01-architecture.md      # Architecture guide
│   ├── 02-code-style.md        # Code style rules
│   ├── 03-patterns.md          # Common patterns
│   ├── 04-testing.md           # Testing guidelines
│   ├── 05-nx-workflow.md       # Nx commands
│   ├── 06-protocol-specific.md # GCP guidelines
│   ├── 07-ai-agent-rules.md    # AI agent rules
│   ├── 08-ci-cd.md             # CI/CD guide
│   ├── 09-dependencies.md      # Dependency management
│   ├── 10-quick-reference.md   # Quick reference
│   └── 11-direction.md         # Strategic direction
├── packages/
│   ├── core/                   # Core protocol library
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── types.ts    # Base identifiers (NodeId, EdgeId, Metadata)
│   │   │   │   ├── result.ts   # Result<T,E> type and helpers
│   │   │   │   ├── graph/      # Graph domain
│   │   │   │   ├── role/       # Role domain
│   │   │   │   ├── context/    # Context propagation and remote query
│   │   │   │   ├── protocol/   # Protocol messages
│   │   │   │   ├── discovery/  # Discovery and peer contracts
│   │   │   │   └── agent/      # Agent domain
│   │   │   └── index.ts        # Public API
│   │   └── README.md
│   └── server/                 # Server runtime
│       ├── src/
│       │   ├── lib/
│       │   │   ├── auth/       # Authentication and authorization
│       │   │   ├── handlers/   # Protocol message handlers
│       │   │   ├── knowledge/  # Knowledge adapter registry and query execution
│       │   │   ├── server/     # Server composition and lifecycle
│       │   │   ├── transport/  # Transport abstraction
│       │   │   └── ...         # Connection, routing, cache, agents
│       │   └── index.ts        # Public API
│       └── README.md
├── apps/                      # Demo applications (see individual app READMEs)
├── AGENTS.md                   # AI Agent Guidelines
└── package.json
```

## Design Principles

1. **Immutable Data** - All structures are immutable
2. **Pure Functions** - No side effects, return new objects
3. **Validation First** - Runtime validation with Zod
4. **Explicit Exports** - No wildcard exports
5. **Co-located Tests** - Tests next to source files

## Technology Stack

| Technology | Purpose |
|------------|---------|
| TypeScript | Primary language (strict mode) |
| Nx | Monorepo management |
| Vitest | Testing framework |
| Biome | Linting and formatting |
| Zod | Runtime validation |
| pnpm | Package manager |

## Contributing

Please read [AGENTS.md](./AGENTS.md) for detailed guidelines on working with this codebase.

Key points:
- Always run `pnpm format` before committing
- Write tests for new functionality
- Follow the existing code patterns
- Add JSDoc to public APIs

## Documentation

- [Architecture](context/01-architecture.md) - Core concepts and design
- [Code Style](context/02-code-style.md) - Coding standards
- [Patterns](context/03-patterns.md) - Implementation patterns
- [Testing](context/04-testing.md) - Testing guidelines
- [AI Agent Rules](context/07-ai-agent-rules.md) - DO and DON'T
- [Quick Reference](context/10-quick-reference.md) - Command cheat sheet
- [Direction](context/11-direction.md) - Strategic direction for read-first context query

## Resources

- [Nx Documentation](https://nx.dev)
- [Vitest Documentation](https://vitest.dev)
- [Biome Documentation](https://biomejs.dev)
- [Zod Documentation](https://zod.dev)

## License

MIT

---

*Built with [Nx](https://nx.dev)*
