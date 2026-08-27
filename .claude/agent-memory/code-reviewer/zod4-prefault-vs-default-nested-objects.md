---
name: zod4-prefault-vs-default-nested-objects
description: In zod v4, use .prefault({}) not .default({}) on a nested object whose inner fields have their own defaults
metadata:
  type: project
---

In zod v4 (repo uses `zod@^4.4.3`), `someObject.default({})` short-circuits: when the key is omitted, the literal `{}` is returned WITHOUT running it through the object schema, so inner field-level `.default(...)`s are never applied and those fields come back `undefined`. `someObject.prefault({})` instead parses `{}` THROUGH the schema, so inner defaults apply.

Empirically verified against the installed zod 4.4.3:
- `.prefault({})`, key omitted -> all inner defaults filled.
- `.prefault({})`, PARTIAL object (e.g. `{ denialMode: "error" }`) -> the provided field is kept and the rest are filled from inner defaults (NOT just the all-omitted case).
- `.default({})`, key omitted -> bare `{}` (all inner fields undefined).

**Why:** This matters when a parsed object is then fed to a factory like core's `createAccessPolicyDescriptor(readableByRoles, requiredCapabilities, ...)` that calls `.parse` on its inputs — undefined arrays make it throw. First seen in `packages/scenario/src/lib/config.ts` (`GcpNodeConfigSchema.accessPolicy`), which correctly uses `.prefault({})` for exactly this reason.

**How to apply:** When reviewing a zod-v4 schema where a nested/optional object has inner fields with their own `.default(...)`, and the object itself should default to "all-inner-defaults", confirm it uses `.prefault({})`. Flag `.default({})` in that situation as a latent bug (silently-undefined inner fields). Does not apply to zod v3, where `.default({})` does feed the value through inner defaults. Note: the repo also still has `zod@3.25.76` resolved for some packages — check which version the package under review depends on. See [[nx-typecheck-broken]] for the per-package tsconfig caveat when verifying these.
