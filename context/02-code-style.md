# Code Style Guide

> Strict code style rules using Biome. All formatting is mandatory and enforced.

## Tooling

**ALWAYS use Biome** - Never use ESLint, Prettier, or other formatters directly.

```bash
# Correct
pnpm format
pnpm lint

# Incorrect - Never do this
npx prettier --write
npx eslint --fix
```

## Biome Configuration

- **Indentation**: 4 spaces (not 2, not tabs)
- **Line endings**: LF
- **Semicolons**: Required
- **Quotes**: Double quotes for strings
- **Trailing commas**: ES5 compatible
- **Organize imports**: Enabled (automatic on format)

## TypeScript Conventions

### Module Resolution

Use standard ES modules. Import WITHOUT `.js` extension:

```typescript
// ✅ Correct
import { core } from './core';
import { GraphNode } from '../graph/node';

// ❌ Incorrect
import { core } from './core.js';
import { core } from './core.ts';
```

### File Extensions

- Source files: `.ts`
- Test files: `.spec.ts` (co-located with source)
- Config files: `.mts` for ESM configs

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `graph-node.ts`, `role-manager.ts` |
| Types/Interfaces | PascalCase | `GraphNode`, `RoleDefinition` |
| Functions | camelCase | `createNode`, `propagateContext` |
| Constants | UPPER_SNAKE_CASE | `MAX_DEPTH`, `DEFAULT_TTL` |
| Classes | PascalCase | Prefer composition over inheritance |

## Validation with Zod

All public functions use **Zod** for runtime validation:

```typescript
import { z } from 'zod';

// Define schemas alongside types
export const NodeIdSchema = z.string().min(1);
export type NodeId = z.infer<typeof NodeIdSchema>;

// Validate inputs in functions
export function createNode(id: NodeId, role: RoleDefinition): GraphNode {
    const input = CreateNodeInputSchema.parse({ id, role });
    // ... function logic
}
```

### Zod Guidelines

- Export schemas with `Schema` suffix (e.g., `NodeIdSchema`)
- Use `z.infer<typeof Schema>` to derive types
- Call `.parse()` to validate inputs and throw on invalid data
- Use `.safeParse()` when you need to handle errors gracefully

## Code Organization

### Import Order

1. External dependencies (zod, etc.)
2. Type imports (`import type { ... }`)
3. Value imports from parent directories (`../`)
4. Value imports from same directory (`./`)

### Code Example

```typescript
// ✅ Good: Ordered imports, descriptive names
import { z } from 'zod';
import type { NodeId } from '../types';
import { validateNode } from '../validation';
import { GraphNode } from './graph-node';

/**
 * Creates a context-aware graph node with role bindings.
 * @param id - Unique identifier for the node
 * @param role - Initial role assignment
 * @returns Configured graph node instance
 */
export function createContextNode(
    id: NodeId,
    role: RoleDefinition
): GraphNode {
    validateNode(id, role);
    return new GraphNode(id, role);
}

// ❌ Bad: Missing JSDoc, inconsistent formatting
export function create_node(id:string,role:any){
  return new GraphNode(id,role)
}
```

## JSDoc Standards

Every exported function, class, and interface MUST have JSDoc:

```typescript
/**
 * Creates a bidirectional edge between two graph nodes.
 *
 * @param source - The source node ID (must exist in graph)
 * @param target - The target node ID (must exist in graph)
 * @param type - The type of relationship this edge represents
 * @param metadata - Optional metadata attached to the edge
 * @returns The created edge instance
 * @throws {NodeNotFoundError} If source or target node doesn't exist
 * @throws {DuplicateEdgeError} If edge already exists between nodes
 *
 * @example
 * ```typescript
 * const edge = createEdge('agent-1', 'context-2', 'can-access', {
 *   priority: 1,
 *   permissions: ['read', 'write']
 * });
 * ```
 */
export function createEdge(
    source: NodeId,
    target: NodeId,
    type: EdgeType,
    metadata?: EdgeMetadata
): GraphEdge {
    // Implementation
}
```

### Required JSDoc Tags

- `@param` - All parameters with types and descriptions
- `@returns` - Return value description
- `@throws` - Document all possible exceptions
- `@example` - At least one usage example for public APIs

## Pre-Commit Formatting

**Always format before committing:**

```bash
pnpm format
```

This runs Biome format on all files. CI will fail if code is not properly formatted.

## See Also

- [Architecture](./01-architecture.md) - Overall architecture
- [Patterns](./03-patterns.md) - Common implementation patterns
- [AI Agent Rules](./07-ai-agent-rules.md) - DO and DON'T for AI agents
