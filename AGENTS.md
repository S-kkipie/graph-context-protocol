<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

---

# Graph Context Protocol (GCP) - Agent Guidelines

> **Purpose**: A graph-based, role-based context protocol for context sharing between AI Native Apps and Autonomous Agents. Context access is read-first and primary; **task delegation** is a stricter-capability layer on the same path. GCP is not built on A2A-style point-to-point messaging — but it interoperates with MCP and A2A (bridge adapters) and uses A2A message-passing as its evaluation baseline.

---

## Project Context

**Graph Context Protocol (GCP)** is a TypeScript library for building graph-based, role-based context sharing systems between AI Native Apps and Autonomous Agents. Where A2A (Agent-to-Agent) centers on point-to-point task messaging, GCP centers on **read-first, role-gated context access across independently owned graphs**, with task delegation as a gated capability on top. GCP bridges to MCP and A2A rather than replacing them.

### What We're Building

- **Core Library**: A TypeScript package (`@graph-context-protocol/core`) providing:
  - Graph data structures (nodes, edges) with extensible edge system
  - Role-based access control with capabilities
  - Context propagation with filtering
  - Protocol message handling
  - Discovery and query system for agents and knowledge
  - Runtime validation with Zod

- **Architecture**: Domain-driven design with separated types and implementations:
  - `graph/` - Graph operations, immutable nodes, and extensible edge system
  - `role/` - Role definitions, capabilities, and context rules
  - `context/` - Context propagation and validation
  - `protocol/` - Message handling and provenance tracking
  - `discovery/` - Query and discovery system for agent/knowledge discovery

### Technology Stack

| Technology | Purpose |
|------------|---------|
| **TypeScript** | Primary language (strict mode) |
| **Nx** | Monorepo management and task orchestration |
| **Vitest** | Testing framework with co-located tests |
| **Biome** | Linting and formatting (strict rules) |
| **Zod** | Runtime validation and schema definition |
| **pnpm** | Package manager with workspace support |

### Key Principles

- **Immutable Data**: All structures are immutable (readonly properties)
- **Pure Functions**: Minimize side effects, return new objects
- **Validation-First**: All public APIs validate inputs with Zod
- **Explicit Exports**: No wildcard exports in public API
- **Co-located Tests**: Test files next to source files (*.spec.ts)
- **Extensible Edges**: Edge system uses classes that can be extended (not enums)
- **Node Taxonomy**: Nodes have a `kind` field for type discrimination (agent, knowledge, etc.)

---

## Quick Start

**New to this project?** Start here:
1. Read the [Quick Reference](./context/10-quick-reference.md) for essential commands
2. Review [AI Agent Rules](./context/07-ai-agent-rules.md) for DO and DON'T
3. Check [Architecture](./context/01-architecture.md) to understand the system

**Essential Commands:**
```bash
pnpm install      # Install dependencies
pnpm format       # Format code (REQUIRED before commits)
pnpm nx test core # Run tests
pnpm nx graph     # Visualize project graph
```

---

## Context Documentation

Detailed guidelines are organized into focused documents:

### Core Concepts
- **[01 - Architecture](context/01-architecture.md)** - Core architectural concepts, module structure, and design principles
- **[02 - Code Style](context/02-code-style.md)** - Biome formatting rules, TypeScript conventions, and JSDoc standards
- **[03 - Patterns](context/03-patterns.md)** - Common implementation patterns (Result types, Builder, Type Guards, etc.)

### Development Workflow
- **[04 - Testing](context/04-testing.md)** - Testing standards using Vitest with co-located test files
- **[05 - Nx Workflow](context/05-nx-workflow.md)** - Nx monorepo commands, generators, and best practices
- **[06 - Protocol Specific](context/06-protocol-specific.md)** - GCP-specific guidelines for nodes, roles, context propagation

### Operations
- **[07 - AI Agent Rules](context/07-ai-agent-rules.md)** - Essential DO and DON'T for AI agents
- **[08 - CI/CD](context/08-ci-cd.md)** - Continuous integration requirements and pre-commit checklist
- **[09 - Dependencies](context/09-dependencies.md)** - Dependency management and allowed/forbidden packages

### Reference
- **[10 - Quick Reference](context/10-quick-reference.md)** - Command cheat sheet and quick patterns
- **[11 - Direction](context/11-direction.md)** - Strategic direction for read-first federated context query

---

## Project Structure

```
packages/
├── core/                    # Core protocol types and graph structures
│   ├── src/
│   │   ├── index.ts         # Public API exports (explicit)
│   │   └── lib/
│   │       ├── types.ts     # Base identifiers (NodeId, EdgeId, Metadata)
│   │       ├── result.ts    # Result<T,E> type and helpers
│   │       ├── graph/       # Graph domain (nodes, edges, graph container)
│   │       ├── role/        # Role domain (roles, capabilities)
│   │       ├── context/     # Context domain (propagation)
│   │       ├── protocol/    # Protocol domain (messages)
│   │       ├── discovery/   # Discovery domain (query system)
│   │       └── agent/       # Agent domain (agent/knowledge nodes)
│   ├── package.json
│   └── vitest.config.mts
└── [future-packages]/       # Additional protocol layers
```

Each domain module uses **semantic file names** that describe their contents, not generic names like `types.ts` or `implementation.ts`:
```
lib/<domain>/
├── <domain>-types.ts      # Domain-specific types and interfaces
├── <domain>-factories.ts   # Factory functions and business logic
├── <domain>-type-guards.ts # Type guards (only where needed, e.g. graph)
├── index.ts                # Public API barrel exports
└── *.spec.ts               # Co-located tests
```

Concrete file names per domain:
```
lib/graph/
├── graph-types.ts          # GraphNode, GraphEdge, EdgeType, NodeKind
├── graph-factories.ts      # createNode(), createEdge(), createGraph()
├── graph-type-guards.ts    # isAgentNode(), isKnowledgeNode()
├── index.ts
└── *.spec.ts

lib/role/
├── role-types.ts            # RoleDefinition, Capability, ContextRule
├── role-factories.ts        # createRole(), createCapability()
├── index.ts
└── *.spec.ts

lib/context/
├── context-types.ts         # GraphContext, ContextFilter, PropagationResult
├── context-factories.ts     # createContext(), propagateContext()
├── context-query-types.ts   # ContextQuery, ContextQueryResult, RequesterDescriptor
├── context-query-factories.ts # createContextQuery(), createContextQueryResult()
├── index.ts
└── *.spec.ts

lib/protocol/
├── protocol-types.ts        # ProtocolMessage, MessageHeader, MessageProvenance
├── protocol-factories.ts    # createMessageHeader(), createProtocolMessage()
├── index.ts
└── *.spec.ts

lib/discovery/
├── discovery-types.ts       # DiscoveryQuery, DiscoveryResult, DiscoveryFilters
├── discovery-functions.ts   # discoverNodes(), discoverAgents(), discoverKnowledge()
├── context-contract-types.ts      # ContextPeerDescriptor, AccessPolicyDescriptor
├── context-contract-factories.ts  # createContextPeerDescriptor(), createAccessPolicyDescriptor()
├── peer-discovery.ts        # Peer filtering and discovery helpers
├── index.ts
└── *.spec.ts

lib/agent/
├── agent-types.ts           # Agent, AgentTool, AgentContext interfaces
├── agent-factories.ts       # createAgent(), agent tool factories
├── index.ts
└── *.spec.ts
```

> **Note**: `lib/types.ts` remains the shared base identifier/metadata contract (NodeId, EdgeId, etc.) and `lib/result.ts` remains a shared utility. A `types.ts` file is only appropriate for shared public contracts, multi-file local contracts, or cycle avoidance.

---

## Summary for AI Agents

When working on Graph Context Protocol:

1. **Always run `pnpm format`** before committing
2. **Use Biome** for all linting/formatting
3. **Import without `.js` extension** (`from './core'`)
4. **Export from `index.ts`** for public APIs (explicit exports)
5. **Add JSDoc** to all exports with examples
6. **Use Zod** for runtime validation of all public functions
7. **Write tests** as `.spec.ts` co-located with source
8. **Prefer pure functions** and immutable data
9. **Never use `@ts-ignore`** without explanation
10. **Follow graph/role/context patterns** for protocol features
11. **Follow context-query patterns** for remote context query features
12. **Check `pnpm nx run-many -t lint test build typecheck`** before finishing

### Extensible Edge System

Edges are implemented as classes that can be extended:

```typescript
// Built-in edge classes extend BaseGraphEdge
const edge = new TraverseEdge('edge:1', 'node:a', 'node:b', metadata, timestamp);

// Custom edges can extend BaseGraphEdge
class MyCustomEdge extends BaseGraphEdge<'custom-type'> {
    isValidBetween(source: GraphNode, target: GraphNode): boolean {
        // Custom validation logic
        return true;
    }
}

// Register custom edge types
const registry = defaultEdgeRegistry.register({
    type: 'custom-type',
    create: (id, source, target, metadata) => new MyCustomEdge(id, source, target, metadata)
});
```

### Node Taxonomy

Nodes have a `kind` field for type discrimination:

```typescript
// Agent nodes can discover and communicate
const agent = createAgentNode('agent:1', role);

// Knowledge nodes contain information
const doc = createKnowledgeNode('knowledge:1', role, {
    tags: ['documentation'],
    contentType: 'text/markdown'
});

// Type guards
if (isAgentNode(node)) {
    // node is AgentNode
}
if (isKnowledgeNode(node)) {
    // node is KnowledgeNode
}
```

### Remote Context Query

Peers expose queryable knowledge surfaces and authorize each query locally:

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

Server handlers authenticate credentials separately. `requester` is audit metadata, not authorization proof. Denied queries do not call adapters.

### Discovery System

Agents can discover other agents and knowledge:

```typescript
// Create a graph with discovery-capable agents
const researcherRole = createRole('role:researcher', 'Researcher', '', [
    createCapability(SystemCapabilities.DISCOVER_AGENTS, '', ''),
    createCapability(SystemCapabilities.DISCOVER_KNOWLEDGE, '', '')
], [
    { path: 'graph.nodes.agent', access: 'read' },
    { path: 'graph.nodes.knowledge', access: 'read' }
]);

const graph = createGraph('graph:main')
    .addNode(createAgentNode('agent:researcher', researcherRole))
    .addNode(createAgentNode('agent:planner', plannerRole))
    .addNode(createKnowledgeNode('knowledge:specs', publicRole, { tags: ['api'] }));

// Discover agents
const agents = discoverAgents(graph, 'agent:researcher');

// Discover knowledge
const docs = discoverKnowledge(graph, 'agent:researcher', {
    tags: ['api'],
    tagMode: 'any'
});
```

---

## Resources

- **Nx Docs**: https://nx.dev
- **Vitest Docs**: https://vitest.dev
- **Biome Docs**: https://biomejs.dev
- **TypeScript Handbook**: https://www.typescriptlang.org/docs

---

*Last updated: Generated for Graph Context Protocol - AI Native Apps and Autonomous Agents*
