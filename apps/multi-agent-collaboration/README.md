# Multi-Agent Collaboration Demo

A demonstration of the Graph Context Protocol showing how AI agents collaborate through structured context propagation.

## Purpose

This application demonstrates a multi-agent workflow where:
- **Planner** defines tasks and constraints
- **Researcher** gathers information
- **Writer** creates content
- **Reviewer** provides feedback

The demo showcases:
- Role-based access control with capabilities
- Context propagation through graph relationships
- Protocol messages with provenance tracking
- Filtering of sensitive/private data

## Agent Graph

```
┌─────────┐     ┌───────────┐     ┌────────┐     ┌─────────┐
│ Planner │────▶│ Researcher │────▶│ Writer │────▶│ Reviewer│
└─────────┘     └───────────┘     └────────┘     └─────────┘
      ▲                                              │
      └──────────────────────────────────────────────┘
```

### Agents and Roles

| Agent | Role | Capabilities | Context Access |
|-------|------|--------------|----------------|
| Planner | Plans tasks | read, write, send | task.brief, task.constraints, planner.notes |
| Researcher | Gathers info | read, write, traverse, receive, send | task.brief, research.findings |
| Writer | Creates content | read, write, traverse, receive, send | task.brief, research.findings, draft.content |
| Reviewer | Reviews work | read, write, receive | task.brief, draft.content, review.notes |

## Context Flow

1. **Planner → Researcher**
   - Propagates: `task.brief`, `task.constraints`
   - Filters out: `planner.notes` (private)

2. **Researcher → Writer**
   - Propagates: `task.brief`, `task.constraints`, `research.findings`

3. **Writer → Reviewer**
   - Propagates: `task.brief`, `research.findings`, `draft.content`

## Provenance Tracking

Each message includes a provenance trail:
```
msg:step-0: Planner → Researcher [provenance: agent:planner]
msg:step-1: Researcher → Writer [provenance: agent:planner → agent:researcher]
msg:step-2: Writer → Reviewer [provenance: agent:planner → agent:researcher → agent:writer]
```

## Running the Demo

```bash
# Run the demo
pnpm nx serve multi-agent-collaboration

# Or build and run directly
pnpm nx build multi-agent-collaboration
node apps/multi-agent-collaboration/dist/main.js
```

## Testing

```bash
# Run tests
pnpm nx test multi-agent-collaboration

# Run with coverage
pnpm nx test multi-agent-collaboration --coverage
```

## Project Structure

```
apps/multi-agent-collaboration/
├── src/
│   ├── main.ts              # Entry point
│   ├── app.ts               # App orchestration
│   ├── app.spec.ts          # App tests
│   └── collaboration/
│       ├── index.ts         # Public exports
│       ├── types.ts         # Type definitions
│       ├── agents.ts        # Agent/role/node factory
│       ├── agents.spec.ts   # Agent tests
│       ├── scenario.ts      # Scenario runner
│       ├── scenario.spec.ts # Scenario tests
│       ├── report.ts        # Report renderer
│       └── report.spec.ts   # Report tests
├── vitest.config.mts        # Vitest configuration
└── README.md                # This file
```

## Design Notes

### Exact Context Rules

The current implementation uses exact context key paths (e.g., `task.brief`) rather than wildcards. This demonstrates the protocol's capability for fine-grained access control.

### Immutable Data

All structures are immutable:
- Nodes, edges, and contexts are never mutated
- Each propagation creates new context objects
- Messages maintain immutable provenance chains

### Pure Functions

The implementation uses pure functions throughout:
- `createCollaborationGraph()` returns fresh instances
- `runCollaborationScenario()` has no side effects
- `renderScenarioReport()` is deterministic

## See Also

- [Core Package](../../packages/core/README.md) - Protocol documentation
- [Architecture](../../context/01-architecture.md) - System architecture
- [Protocol Guide](../../context/06-protocol-specific.md) - GCP guidelines