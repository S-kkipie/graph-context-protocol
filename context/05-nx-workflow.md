# Nx Workflow

> Guidelines for working with Nx monorepo tooling.

## General Guidelines

### Navigation and Exploration

For navigating/exploring the workspace, invoke the `nx-workspace` skill first:

```bash
# Load the skill for workspace queries
```

The skill has patterns for querying projects, targets, and dependencies.

### Running Tasks

Always prefer running tasks through Nx instead of using underlying tooling directly:

```bash
# ✅ Correct
pnpm nx run-many -t test
pnpm nx affected -t build

# ❌ Incorrect (unless specifically needed)
npx vitest
npm run test
```

### Command Prefix

Prefix nx commands with the workspace's package manager:

```bash
# ✅ Correct
pnpm nx build
pnpm nx test core

# Avoids using globally installed CLI
```

### MCP Server

You have access to the Nx MCP server and its tools. Use them to help with Nx-specific tasks.

### Best Practices

For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.

**Never guess CLI flags** - always check nx_docs or `--help` first when unsure:

```bash
pnpm nx g @nx/js:lib --help
```

## Scaffolding and Generators

For scaffolding tasks (creating apps, libs, project structure, setup), **ALWAYS invoke the `nx-generate` skill FIRST** before exploring or calling MCP tools:

```bash
# Use the nx-generate skill for scaffolding
```

Generator trigger words:
- scaffold
- setup
- create a ... app
- create a ... lib
- project structure
- generate
- add a new project

## When to Use nx_docs

**USE for:**
- Advanced config options
- Unfamiliar flags
- Migration guides
- Plugin configuration
- Edge cases

**DON'T USE for:**
- Basic generator syntax (`nx g @nx/react:app`)
- Standard commands
- Things you already know

The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax.

## Essential Commands

```bash
# Install dependencies
pnpm install

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

# Show project details
pnpm nx show project core

# List all available targets
pnpm nx show project core --web

# Check affected projects
pnpm nx affected:graph

# Debug target configuration
pnpm nx show project core --json
```

## Task Execution Patterns

### Running Multiple Tasks

```bash
# Run tasks for all projects
pnpm nx run-many -t build

# Run tasks in parallel
pnpm nx run-many -t lint test build --parallel=3

# Run tasks for affected projects
pnpm nx affected -t build
pnpm nx affected -t test
```

### Affected Commands

Great for CI - only run tasks on changed projects:

```bash
# Build only affected projects
pnpm nx affected -t build

# Test only affected projects
pnpm nx affected -t test
```

### Running Specific Targets

```bash
# Run specific target for one project
pnpm nx run core:test

# Run specific target for multiple projects
pnpm nx run-many -t test --projects=core,api
```

## Project Configuration

### package.json Fields

Required fields for new packages:

```json
{
  "name": "@graph-context-protocol/<package-name>",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  }
}
```

### Project Structure

Standard package structure:

```
packages/<name>/
├── src/
│   ├── index.ts         # Public API exports
│   └── lib/             # Implementation
├── package.json
├── tsconfig.json
├── tsconfig.lib.json
└── vitest.config.mts    # Test configuration
```

## Nx Graph

Visualize project relationships:

```bash
# Open interactive graph
pnpm nx graph

# See affected projects
pnpm nx affected:graph
```

## Troubleshooting

### Cannot Find Configuration

If you see "Cannot find configuration for task":

```bash
# Check available targets
pnpm nx show project <project-name>

# Verify project.json or package.json has the target
```

### Cache Issues

```bash
# Clear Nx cache
pnpm nx reset

# Run without cache
pnpm nx run <project>:<target> --skip-nx-cache
```

### Flaky Tasks

Nx Cloud can detect and retry flaky tasks. Enable remote caching for better CI performance.

## See Also

- [Architecture](./01-architecture.md) - Project architecture
- [Code Style](./02-code-style.md) - Formatting guidelines
- [CI/CD](./08-ci-cd.md) - CI pipeline configuration
