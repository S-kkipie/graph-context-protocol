# AI Agent Rules

> Essential DO and DON'T guidelines for AI agents working on this codebase.

## DO

### ✅ Always Format Code Before Committing

```bash
pnpm format
```

### ✅ Use Explicit Types

Avoid `any`, prefer `unknown` when type is uncertain:

```typescript
// ✅ Good
function processNode(node: GraphNode): Result {
    // Implementation
}

// ❌ Bad
function processNode(node: any): any {
    // Implementation
}
```

### ✅ Export from index.ts

Make APIs discoverable through explicit barrel exports:

```typescript
// ✅ Good - In packages/core/src/lib/graph/index.ts
export { Graph } from './graph';
export type { GraphConfig } from './types';

// Then in packages/core/src/index.ts
export * from './lib/graph';
```

### ✅ Handle Errors Explicitly

Use Result types or throw descriptive errors:

```typescript
// ✅ Good
export type Result<T, E = Error> =
    | { success: true; data: T }
    | { success: false; error: E };

// Or
export class GraphTraversalError extends Error {
    constructor(message: string, public readonly path: NodeId[]) {
        super(message);
        this.name = 'GraphTraversalError';
    }
}
```

### ✅ Use Readonly Where Appropriate

```typescript
interface GraphConfig {
    readonly maxDepth: number;
    readonly allowCycles: boolean;
    readonly defaultRole: RoleDefinition;
}
```

### ✅ Prefer Pure Functions

Minimize side effects, make data flow explicit:

```typescript
// ✅ Good: Returns new object
function withNode(graph: Graph, node: GraphNode): Graph {
    return {
        ...graph,
        nodes: [...graph.nodes, node]
    };
}
```

### ✅ Add Tests for New Functionality

Co-located `.spec.ts` files:

```typescript
// graph.spec.ts next to graph.ts
describe('createNode', () => {
    it('should create a node with valid inputs', () => {
        // Test implementation
    });
});
```

### ✅ Check Nx Graph

Before changes that might affect dependencies:

```bash
pnpm nx graph
```

### ✅ Import Without Extensions

```typescript
// ✅ Good
import { core } from './core';

// ❌ Bad
import { core } from './core.js';
```

### ✅ Use Named Exports

```typescript
// ✅ Good
export class Graph { }
import { Graph } from '@graph-context-protocol/core';

// ❌ Bad
export default class Graph { }
```

### ✅ Validate with Zod

All public functions should validate inputs:

```typescript
export function createNode(id: NodeId, role: RoleDefinition): GraphNode {
    const input = CreateNodeInputSchema.parse({ id, role });
    // ... function logic
}
```

## DON'T

### ❌ Never Use @ts-ignore or @ts-expect-error

Without detailed explanation in a comment.

### ❌ Never Suppress Biome Errors

Fix the underlying issue instead.

### ❌ Never Use console.log in Library Code

Use proper logging or return values:

```typescript
// ❌ Bad
console.log('Processing node:', nodeId);

// ✅ Good - Return information or use structured logging
const result = processNode(nodeId);
logger.debug('Node processed', { nodeId, result });
```

### ❌ Never Expose Internal Types

Keep implementation details private:

```typescript
// ❌ Bad - In index.ts
export { InternalHelper } from './lib/internal-helper';

// ✅ Good
// Don't export from index.ts, only use internally
```

### ❌ Never Mutate Input Parameters

Create new objects instead:

```typescript
// ❌ Bad
function addNode(graph: Graph, node: GraphNode): void {
    graph.nodes.push(node); // Mutates input
}

// ✅ Good
function withNode(graph: Graph, node: GraphNode): Graph {
    return {
        ...graph,
        nodes: [...graph.nodes, node]
    };
}
```

### ❌ Never Ignore Test Failures

Tests must pass before committing.

### ❌ Never Commit Without Formatting

Run `pnpm format` first.

### ❌ Never Use Default Exports

For library APIs:

```typescript
// ❌ Bad
export default class Graph { }

// ✅ Good
export class Graph { }
```

### ❌ Never Use .js Extensions in Imports

```typescript
// ❌ Bad
import { core } from './core.js';

// ✅ Good
import { core } from './core';
```

### ❌ Never Suppress Type Errors Without Explanation

```typescript
// ❌ Bad
// @ts-ignore
const result = someFunction();

// ✅ Good
// @ts-expect-error - Known issue with library types, waiting for upstream fix
const result = someFunction();
```

## Quick Checklist

Before finishing work:

- [ ] `pnpm format` has been run
- [ ] All tests pass (`pnpm nx run-many -t test`)
- [ ] TypeScript typecheck passes (`pnpm nx run-many -t typecheck`)
- [ ] No `any` types without justification
- [ ] No `console.log` statements
- [ ] All exports are named (no default exports)
- [ ] JSDoc comments on public APIs
- [ ] Tests for new functionality

## See Also

- [Code Style](./02-code-style.md) - Detailed code style guide
- [Testing](./04-testing.md) - Testing guidelines
- [Architecture](./01-architecture.md) - Overall architecture
