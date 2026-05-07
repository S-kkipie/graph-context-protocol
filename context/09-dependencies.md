# Dependencies

> Guidelines for adding and managing dependencies.

## Adding New Dependencies

### Decision Process

1. **Prefer built-in** or existing dependencies first
2. **Check bundle size** impact for browser-facing code
3. **Verify license** compatibility (MIT/Apache-2.0 preferred)
4. **Install at appropriate level**

### Installation Levels

#### Root Level

For dev dependencies, build tools, and workspace-wide tools:

```bash
# Add dev dependency to root
pnpm add -D <package>

# Examples
pnpm add -D @types/node
pnpm add -D vitest
pnpm add -D @biomejs/biome
```

#### Package Level

For runtime dependencies specific to a package:

```bash
# Add to specific package
pnpm add <package> --filter @graph-context-protocol/core

# Examples
pnpm add zod --filter @graph-context-protocol/core
pnpm add uuid --filter @graph-context-protocol/api
```

### Installation Commands

```bash
# Add runtime dependency to a package
pnpm add <package> --filter <project-name>

# Add dev dependency to root
pnpm add -D <package>

# Add dev dependency to a package
pnpm add -D <package> --filter <project-name>

# Install all dependencies
pnpm install
```

## Forbidden Dependencies

### Never Add

- **lodash** - Use native ES2022+ instead
- **moment.js** - Use native Date or temporal polyfill

### Avoid If Possible

- Large utility libraries for simple functions
- Duplicated functionality already in the codebase
- Dependencies with incompatible licenses (GPL, etc.)

## Allowed Dependencies

### Core Dependencies

These are already in use and approved:

- **zod** - Runtime validation
- **vitest** - Testing framework
- **@biomejs/biome** - Linting and formatting
- **nx** - Monorepo tooling

### Choosing Dependencies

When selecting a new dependency, consider:

1. **Maintenance** - Is it actively maintained?
2. **Size** - How large is the bundle impact?
3. **License** - Is it compatible (MIT/Apache-2.0/BSD)?
4. **Alternatives** - Are there lighter alternatives?
5. **Native** - Can native APIs do this?

## License Compatibility

### Preferred Licenses

- MIT
- Apache-2.0
- BSD-3-Clause
- ISC

### Avoid

- GPL (viral license)
- Proprietary licenses
- Custom/complex licenses

Always check the license before adding a dependency:

```bash
# Check license
npm view <package> license
```

## Dependency Updates

### Check for Updates

```bash
# Check outdated packages
pnpm outdated

# Check outdated in specific package
pnpm outdated --filter @graph-context-protocol/core
```

### Update Dependencies

```bash
# Update all packages
pnpm update

# Update specific package
pnpm update <package>

# Update to latest major version
pnpm update <package>@latest
```

## Security

### Audit Dependencies

```bash
# Audit all dependencies
pnpm audit

# Fix vulnerabilities
pnpm audit --fix
```

### Regular Maintenance

- Run `pnpm audit` regularly
- Update dependencies monthly
- Review and remove unused dependencies

## Peer Dependencies

When creating packages that will be consumed by others:

```json
{
  "peerDependencies": {
    "zod": "^3.0.0"
  }
}
```

## Workspace Dependencies

### Internal Packages

When one package depends on another in the monorepo:

```bash
# Add internal dependency
pnpm add @graph-context-protocol/core --filter @graph-context-protocol/api
```

The workspace protocol will be used automatically.

### Version Management

Internal packages should use:

```json
{
  "dependencies": {
    "@graph-context-protocol/core": "workspace:*"
  }
}
```

## See Also

- [Nx Workflow](./05-nx-workflow.md) - Nx package management
- [CI/CD](./08-ci-cd.md) - CI pipeline and security scans
