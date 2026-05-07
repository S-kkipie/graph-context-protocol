# Quick Reference

> Quick reference card for common tasks and commands.

## Essential Commands

### Installation

```bash
# Install dependencies
pnpm install
```

### Development

```bash
# Format code (REQUIRED before commits)
pnpm format

# Check formatting
pnpm nx format:check

# Run all checks (CI)
pnpm nx run-many -t lint test build typecheck

# Test specific package
pnpm nx test core

# Build all packages
pnpm nx run-many -t build

# Visualize project graph
pnpm nx graph
```

### Nx Commands

```bash
# Show project details
pnpm nx show project core

# List all available targets
pnpm nx show project core --web

# Check affected projects
pnpm nx affected:graph

# Run affected tests
pnpm nx affected -t test

# Debug target configuration
pnpm nx show project core --json
```

## Project Structure

```
packages/
├── core/                    # Core protocol types and graph structures
│   ├── src/
│   │   ├── index.ts         # Public API exports
│   │   └── lib/
│   │       ├── types.ts     # Base identifiers
│   │       ├── result.ts    # Result<T,E> type
│   │       ├── graph/       # Graph domain (nodes, edges, graph container)
│   │       ├── role/        # Role domain (roles, capabilities)
│   │       ├── context/     # Context domain (propagation)
│   │       ├── protocol/    # Protocol domain (messages)
│   │       └── discovery/   # Discovery domain (query system)
│   ├── package.json
│   └── vitest.config.mts
└── [future-packages]/       # Additional protocol layers
```

## Domain Module Structure

Each domain follows this pattern:

```
lib/<domain>/
├── types.ts           # Domain-specific types and interfaces
├── implementation.ts  # Factory functions and logic
├── index.ts          # Public API exports
└── *.spec.ts         # Co-located tests
```

## Quick Patterns

### Result Type

```typescript
import { succeed, fail } from '@graph-context-protocol/core';

function mayFail(): Result<string, Error> {
    if (success) return succeed(data);
    return fail(error);
}
```

### Creating Nodes

```typescript
import { createNode, createAgentNode, createKnowledgeNode } from '@graph-context-protocol/core';

// Generic node
const node = createNode('node-1', role, { key: 'value' });

// Agent node (for discovery/communication)
const agent = createAgentNode('agent:1', role, { capabilities: ['cap:read'] });

// Knowledge node (for information storage)
const doc = createKnowledgeNode('knowledge:1', role, {
    tags: ['documentation'],
    contentType: 'text/markdown'
});
```

### Creating a Role

```typescript
import { createRole, createCapability } from '@graph-context-protocol/core';

const role = createRole(
    'role:admin',
    'Admin',
    'Administrator role',
    [createCapability('cap:read', 'Read', 'Can read')],
    []
);
```

### Propagating Context

```typescript
import { createContext, propagateContext } from '@graph-context-protocol/core';

const context = createContext('ctx:1', 'graph:1', 'node:1', role);
const result = propagateContext(context, targetNode);
```

### Creating a Graph

```typescript
import { createGraph, createAgentNode, createKnowledgeNode, createEdge } from '@graph-context-protocol/core';

const graph = createGraph('graph:main')
    .addNode(createAgentNode('agent:1', role))
    .addNode(createKnowledgeNode('knowledge:1', role))
    .addEdge(createEdge('edge:1', 'agent:1', 'knowledge:1', 'can-access'));
```

### Discovery

```typescript
import { discoverAgents, discoverKnowledge, SystemCapabilities } from '@graph-context-protocol/core';

// Discover agents
const agents = discoverAgents(graph, 'agent:researcher', {
    capabilities: ['cap:read-context'],
    maxDepth: 3
});

// Discover knowledge
const docs = discoverKnowledge(graph, 'agent:researcher', {
    tags: ['documentation'],
    tagMode: 'any'
});

// Role with discovery capabilities
const role = createRole('role:researcher', 'Researcher', '', [
    createCapability(SystemCapabilities.DISCOVER_AGENTS, 'Discover Agents', ''),
    createCapability(SystemCapabilities.DISCOVER_KNOWLEDGE, 'Discover Knowledge', '')
], [
    { path: 'graph.nodes.agent', access: 'read' },
    { path: 'graph.nodes.knowledge', access: 'read' }
]);
```

## File Naming

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `graph-node.ts` |
| Types | PascalCase | `GraphNode` |
| Functions | camelCase | `createNode` |
| Constants | UPPER_SNAKE | `MAX_DEPTH` |

## Code Style (Biome)

- **Indentation**: 4 spaces
- **Line endings**: LF
- **Semicolons**: Required
- **Quotes**: Double quotes
- **Trailing commas**: ES5 compatible

## Zod Validation

```typescript
import { z } from 'zod';

const NodeIdSchema = z.string().min(1);
export type NodeId = z.infer<typeof NodeIdSchema>;

// Validate
const id = NodeIdSchema.parse(input);
```

## Testing

```bash
# Run all tests
pnpm nx run-many -t test

# Run specific test file
pnpm nx test core --testPathPattern=graph.spec

# Watch mode
pnpm nx test core --watch

# Coverage
pnpm nx test core --coverage
```

## Pre-Commit Checklist

- [ ] `pnpm format` run
- [ ] Tests pass
- [ ] TypeScript typecheck passes
- [ ] JSDoc comments added
- [ ] No `console.log` statements
- [ ] No `any` types

## Useful Links

- [Nx Docs](https://nx.dev)
- [Vitest Docs](https://vitest.dev)
- [Biome Docs](https://biomejs.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)

## Context Files

For detailed information, see:

1. [Architecture](./01-architecture.md) - Core architectural concepts
2. [Code Style](./02-code-style.md) - Detailed code style guide
3. [Patterns](./03-patterns.md) - Common implementation patterns
4. [Testing](./04-testing.md) - Testing standards and guidelines
5. [Nx Workflow](./05-nx-workflow.md) - Nx monorepo workflow
6. [Protocol Specific](./06-protocol-specific.md) - GCP-specific guidelines
7. [AI Agent Rules](./07-ai-agent-rules.md) - DO and DON'T for AI agents
8. [CI/CD](./08-ci-cd.md) - Continuous integration requirements
9. [Dependencies](./09-dependencies.md) - Dependency management
