# CI/CD Compliance

> Continuous Integration and Deployment requirements.

## Pre-Commit Checklist

Before creating a PR, ensure:

- [ ] `pnpm format` has been run
- [ ] `pnpm nx run-many -t lint` passes
- [ ] `pnpm nx run-many -t test` passes
- [ ] `pnpm nx run-many -t typecheck` passes
- [ ] `pnpm nx run-many -t build` passes
- [ ] All new code has JSDoc comments
- [ ] Tests cover new functionality

## CI Pipeline

The CI runs the following checks in order:

### 1. Format Check

```bash
pnpm nx format:check
```

Verifies all code is properly formatted with Biome.

### 2. Lint

```bash
pnpm nx run-many -t lint
```

Runs Biome linter across all projects.

### 3. Test

```bash
pnpm nx run-many -t test
```

Runs Vitest test suites for all projects.

### 4. Build

```bash
pnpm nx run-many -t build
```

Builds all packages.

### 5. TypeCheck

```bash
pnpm nx run-many -t typecheck
```

TypeScript type checking across all packages.

### 6. Self-Healing Fixes (Optional)

```bash
pnpm nx fix-ci
```

Automatically identifies and suggests fixes for common issues. This runs only if failures occur.

## Never Disable CI Checks

**Never** disable or remove CI checks without explicit approval from maintainers.

## Running CI Checks Locally

Before pushing, run all checks locally:

```bash
# Run all checks
pnpm nx run-many -t lint test build typecheck

# Or run individually
pnpm format                    # Format code
pnpm nx run-many -t lint       # Check linting
pnpm nx run-many -t test       # Run tests
pnpm nx run-many -t typecheck  # Type check
pnpm nx run-many -t build      # Build all
```

## Nx Cloud

Nx Cloud provides:

- **Remote caching** - Share build artifacts across CI runs
- **Distributed task execution** - Parallelize tasks across machines
- **Automated e2e test splitting** - Optimize test execution
- **Task flakiness detection** - Retry flaky tests automatically

### Connecting to Nx Cloud

If you haven't connected yet:

```bash
npx nx connect-to-nx-cloud
```

## Affected Commands in CI

Use affected commands to optimize CI by only checking changed projects:

```bash
# Build only affected projects
pnpm nx affected -t build

# Test only affected projects
pnpm nx affected -t test

# Run all checks on affected projects
pnpm nx affected -t lint test build typecheck
```

## CI Configuration

### GitHub Actions Example

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Check formatting
        run: pnpm nx format:check

      - name: Lint
        run: pnpm nx run-many -t lint

      - name: Test
        run: pnpm nx run-many -t test

      - name: Build
        run: pnpm nx run-many -t build

      - name: Type check
        run: pnpm nx run-many -t typecheck
```

## Troubleshooting CI Failures

### Formatting Failures

```bash
# Fix formatting locally
pnpm format

# Commit changes
git add .
git commit -m "style: fix formatting"
```

### Test Failures

```bash
# Run tests locally to debug
pnpm nx test <project-name>

# Run with watch mode for debugging
pnpm nx test <project-name> --watch
```

### Type Errors

```bash
# Check types for specific project
pnpm nx run <project-name>:typecheck
```

## Release Management

Using Nx Release for versioning and publishing:

```bash
# Dry run to see what would be published
npx nx release --dry-run

# Version and release packages
npx nx release

# Publish only specific packages
npx nx release publish --projects=strings,colors
```

## See Also

- [Nx Workflow](./05-nx-workflow.md) - Nx commands and usage
- [Testing](./04-testing.md) - Testing standards
- [AI Agent Rules](./07-ai-agent-rules.md) - Pre-commit checklist
