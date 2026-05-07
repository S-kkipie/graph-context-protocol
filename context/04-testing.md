# Testing Standards

> Testing guidelines using Vitest with co-located test files.

## Test File Organization

Tests are **co-located** with source files:

- `graph-node.ts` → `graph-node.spec.ts`
- Same directory as the file being tested

## Test Structure

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphNode } from './graph-node';

describe('GraphNode', () => {
    let node: GraphNode;

    beforeEach(() => {
        node = new GraphNode('test-id', { name: 'test-role' });
    });

    describe('context propagation', () => {
        it('should propagate context to connected nodes with compatible roles', () => {
            // Arrange
            const context = createTestContext();

            // Act
            const result = node.propagateContext(context);

            // Assert
            expect(result.propagatedNodes).toHaveLength(2);
        });

        it('should filter context data based on role permissions', () => {
            // Test implementation
        });
    });

    describe('role management', () => {
        it('should update role and recalculate permissions', () => {
            // Test implementation
        });
    });
});
```

## Testing Guidelines

### 1. Descriptive Test Names

Explain what is being tested and the expected outcome:

```typescript
// ✅ Good
it('should return false for non-existing capability', () => {
    // ...
});

// ❌ Bad
it('test capability', () => {
    // ...
});
```

### 2. Arrange-Act-Assert Pattern

Structure tests clearly:

```typescript
it('should create a node with valid inputs', () => {
    // Arrange
    const role = createMockRole([]);

    // Act
    const node = createNode('node-1', role, { key: 'value' });

    // Assert
    expect(node.id).toBe('node-1');
    expect(node.role).toBe(role);
    expect(node.metadata).toEqual({ key: 'value' });
});
```

### 3. One Assertion Per Test (Generally)

Keep tests focused on a single behavior:

```typescript
// ✅ Good: Tests one behavior
it('should reject empty id', () => {
    expect(() => createNode('', mockRole)).toThrow();
});

// ❌ Bad: Tests multiple behaviors
it('should validate inputs', () => {
    expect(() => createNode('', mockRole)).toThrow();
    expect(() => createNode('id', mockRole, {})).toBeDefined();
    expect(createNode('id', mockRole).metadata).toEqual({});
});
```

### 4. Test Edge Cases

Always test edge cases:

```typescript
describe('EdgeTypeSchema', () => {
    it('should validate known edge types', () => {
        expect(EdgeTypeSchema.parse('can-access')).toBe('can-access');
        // ... more types
    });

    it('should reject unknown edge types', () => {
        expect(() => EdgeTypeSchema.parse('unknown')).toThrow();
    });
});

describe('createNode', () => {
    it('should default metadata to empty object', () => {
        const node = createNode('node-2', mockRole);
        expect(node.metadata).toEqual({});
    });

    it('should create immutable nodes', () => {
        const node = createNode('node-3', mockRole);
        const newNode = node.withMetadata({ new: 'data' });

        expect(node.metadata).toEqual({}); // Original unchanged
        expect(newNode.metadata).toEqual({ new: 'data' });
    });
});
```

### 5. Mock External Dependencies

Use Vitest mocks for external dependencies:

```typescript
import { vi } from 'vitest';

const mockRole: RoleDefinition = {
    id: 'role:test',
    name: 'Test Role',
    description: 'A test role',
    capabilities: [],
    contextRules: [],
    metadata: {},
    hasCapability: vi.fn(() => false),
    getEffectiveContextRules: vi.fn(() => []),
};
```

### 6. Mock Helpers

Create helper functions for complex mocks:

```typescript
// Mock role with specific context rules
const createMockRole = (
    contextRules: RoleDefinition['contextRules'],
): RoleDefinition => ({
    id: 'role:test',
    name: 'Test Role',
    description: 'A test role',
    capabilities: [],
    contextRules,
    metadata: {},
    hasCapability: () => false,
    getEffectiveContextRules: () => contextRules,
});

// Mock node with specific role
const createMockNode = (role: RoleDefinition, id = 'node:target'): GraphNode => ({
    id,
    role,
    metadata: {},
    createdAt: new Date().toISOString(),
    withRole: () => createMockNode(role, id),
    withMetadata: () => createMockNode(role, id),
});
```

## Coverage Requirements

Aim for >80% coverage on public APIs:

- All exported functions should have tests
- All public types should be validated
- Edge cases should be covered
- Error paths should be tested

## Running Tests

```bash
# Test specific package
pnpm nx test core

# Test all packages
pnpm nx run-many -t test

# Test with coverage
pnpm nx test core --coverage

# Test in watch mode
pnpm nx test core --watch
```

## Test Organization by Module

### Graph Module Tests

```typescript
describe('graph module', () => {
    describe('EdgeTypeSchema', () => {
        // Schema validation tests
    });

    describe('createNode', () => {
        // Node creation tests
    });

    describe('createNode.withRole', () => {
        // Role update tests
    });

    describe('createNode.withMetadata', () => {
        // Metadata merge tests
    });

    describe('createEdge', () => {
        // Edge creation tests
    });
});
```

### Role Module Tests

```typescript
describe('role module', () => {
    describe('createCapability', () => {
        // Capability creation tests
    });

    describe('createContextRule', () => {
        // Context rule tests
    });

    describe('createRole', () => {
        // Role creation tests
    });

    describe('RoleDefinition.hasCapability', () => {
        // Capability checking tests
    });

    describe('SystemRoles', () => {
        // System constants tests
    });
});
```

## Common Test Patterns

### Testing Schema Validation

```typescript
describe('NodeIdSchema', () => {
    it('should validate valid node IDs', () => {
        const result = NodeIdSchema.safeParse('node-1');
        expect(result.success).toBe(true);
    });

    it('should reject empty strings', () => {
        const result = NodeIdSchema.safeParse('');
        expect(result.success).toBe(false);
    });
});
```

### Testing Result Types

```typescript
describe('succeed', () => {
    it('should create a successful result', () => {
        const data = { id: 'test' };
        const result = succeed(data);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toBe(data);
        }
    });
});
```

## See Also

- [Architecture](./01-architecture.md) - Overall architecture
- [Patterns](./03-patterns.md) - Implementation patterns
- [AI Agent Rules](./07-ai-agent-rules.md) - DO and DON'T
