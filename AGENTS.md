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

> **Purpose**: A graph-based, role-based context protocol for communication between AI Native Apps and Autonomous Agents. Not A2A-style direct messaging, but structured context sharing through graph relationships.

---

## Project Context

**Graph Context Protocol (GCP)** is a TypeScript library for building graph-based, role-based context sharing systems between AI Native Apps and Autonomous Agents. Unlike traditional A2A (Agent-to-Agent) direct messaging, GCP enables structured context propagation through graph relationships.

### What We're Building

- **Core Library**: A TypeScript package (`@graph-context-protocol/core`) providing:
  - Graph data structures (nodes, edges)
  - Role-based access control with capabilities
  - Context propagation with filtering
  - Protocol message handling
  - Runtime validation with Zod

- **Architecture**: Domain-driven design with separated types and implementations:
  - `graph/` - Graph operations and immutable nodes
  - `role/` - Role definitions, capabilities, and context rules
  - `context/` - Context propagation and validation
  - `protocol/` - Message handling and provenance tracking

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
│   │       ├── graph/       # Graph domain (types, implementation, tests)
│   │       ├── role/        # Role domain (types, implementation, tests)
│   │       ├── context/     # Context domain (types, implementation, tests)
│   │       └── protocol/    # Protocol domain (types, implementation, tests)
│   ├── package.json
│   └── vitest.config.mts
└── [future-packages]/       # Additional protocol layers
```

Each domain module follows this structure:
```
lib/<domain>/
├── types.ts           # Domain-specific types and interfaces
├── implementation.ts  # Factory functions and business logic
├── index.ts          # Public API barrel exports
└── *.spec.ts         # Co-located tests
```

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
11. **Check `pnpm nx run-many -t lint test build typecheck`** before finishing

---

## Resources

- **Nx Docs**: https://nx.dev
- **Vitest Docs**: https://vitest.dev
- **Biome Docs**: https://biomejs.dev
- **TypeScript Handbook**: https://www.typescriptlang.org/docs

---

*Last updated: Generated for Graph Context Protocol - AI Native Apps and Autonomous Agents*
