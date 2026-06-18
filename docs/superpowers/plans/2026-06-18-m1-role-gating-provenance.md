# M1 — Role-Gated Context + Structured Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make least-privilege context access real and auditable — an under-privileged principal is denied by owner policy, every read decision (allow + deny) emits a structured provenance record, and role hierarchies resolve — with the 2-node demo still working under explicit (non-allow-all) policy + authenticated principals.

**Architecture:** Add a typed `ReadProvenance` record + factory to `core` and type `ContextQueryResponse.provenance` *additively* (no contract bump). Resolve `parentRole` inheritance on `RoleDefinition`. Add an `AuditSink` (in-memory default) to `server`, injected via `ServerDependencies` and threaded into `HandlerContext`; the context-query handler records one event per decision and populates structured response provenance. `authorizeKnowledgeNodeAccess` returns the matched roles/capabilities so the handler can record them. Scenarios swap allow-all/anonymous for role-gated policies + `staticToken`-authenticated principals; the context-query tool forwards credentials so the demo keeps working.

**Tech Stack:** TypeScript 5.9 (strict, project references, `@ai-do/source` customCondition), Zod 4, Vitest 4, Biome 2, Nx 22, pnpm 9 / Node 20, LangChain/LangGraph.

## Global Constraints

- **Node `>=20`, pnpm `>=9`** (root `engines` + `.nvmrc`); use `pnpm` for all commands.
- **TypeScript strict** with project references; source resolves via the `@ai-do/source` customCondition. Library packages have only `typecheck` + `test` nx targets (no `build`); only apps build.
- **Contract stability:** `ContextQueryResponse` is the versioned public contract `gcp-context-contract/v1`. All provenance changes MUST be **additive** — keep `ContextQueryResponseSchema.provenance` permissive (`z.record(z.string(), z.unknown()).optional()`), do **not** bump `contractVersion`.
- **Zod 4:** use `.prefault({})` (not `.default({})`) for nested objects that must apply inner field defaults.
- **Result type:** functions return `Result<T, E>` = `{ success: true, data } | { success: false, error }`; build with `succeed(data)` / `fail(error)` from `@graph-context-protocol/core`.
- **Biome formatting:** 4-space indent. Run `pnpm biome check --write <files>` on every file you create/modify before committing. Repo-wide lint is `pnpm lint` (not an nx target).
- **TDD + frequent commits:** failing test first; one commit per task. Conventional Commits. End every commit message body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Secrets:** the OpenRouter API key lives ONLY in git-ignored `.env.local`; never commit it. `CONTEXT-1.md` files are read-only seed fixtures. Demo tokens (e.g. `tok:researcher`) are NOT secrets and may be committed.
- **Test commands** (nx project name ≠ vitest project name):
  - core → `pnpm nx test @graph-context-protocol/core`
  - server → `pnpm nx test server`
  - langgraph → `pnpm nx test @graph-context-protocol/langgraph`
  - scenario → `pnpm nx test @graph-context-protocol/scenario`
  - typecheck → `pnpm nx typecheck <project>`; apps build → `pnpm nx build researcher executor`.

---

## File Structure

**core (new module `provenance/`):**
- Create `packages/core/src/lib/provenance/provenance-types.ts` — `AccessDecision`, `ReadProvenance`, `AuditRecord` alias + Zod schemas.
- Create `packages/core/src/lib/provenance/provenance-factories.ts` — `createReadProvenance`.
- Create `packages/core/src/lib/provenance/index.ts` — re-exports.
- Create `packages/core/src/lib/provenance/provenance.spec.ts` — tests.
- Modify `packages/core/src/lib/context/context-query-types.ts` — add `ContextReadProvenance`, type the `provenance` field.
- Modify `packages/core/src/lib/context/context-query-factories.ts` — type `createContextQueryResult`'s `provenance` param.
- Modify `packages/core/src/index.ts` — export new symbols.

**core (role inheritance):**
- Modify `packages/core/src/lib/role/role-types.ts` — add `getEffectiveCapabilities()` to `RoleDefinition`.
- Modify `packages/core/src/lib/role/role-factories.ts` — accept a parent `RoleDefinition`, walk the chain.
- Modify `packages/core/src/lib/role/role.spec.ts` — append inheritance tests (existing tests must stay green).

**server (audit sink):**
- Create `packages/server/src/lib/audit/types.ts` — `AuditSink`.
- Create `packages/server/src/lib/audit/implementation.ts` — `createInMemoryAuditSink`.
- Create `packages/server/src/lib/audit/index.ts` — re-exports.
- Create `packages/server/src/lib/audit/audit.spec.ts` — tests.
- Modify `packages/server/src/lib/server/types.ts` — `ServerDependencies.audit?`.
- Modify `packages/server/src/lib/handlers/types.ts` — `HandlerContext.audit?`.
- Modify `packages/server/src/lib/server/implementation.ts` — default sink + thread into `HandlerContext`.
- Modify `packages/server/src/index.ts` — export `AuditSink` + `createInMemoryAuditSink`.

**server (authorization + handler):**
- Modify `packages/server/src/lib/auth/node-authorization.ts` — return `NodeAuthorizationGrant`; use effective caps.
- Modify `packages/server/src/lib/handlers/context-query-handler.ts` — record decisions + populate response provenance.
- Modify `packages/server/src/lib/handlers/context-query-handler.spec.ts` — append audit/provenance tests.
- Modify `packages/server/src/index.ts` — export `NodeAuthorizationGrant`.

**scenario:**
- Modify `packages/scenario/src/lib/gcp-node.ts` — accept `{ authProvider?, auditSink? }`.
- Modify `packages/scenario/src/lib/config.ts` — `NodeAgentConfig` peer credentials.
- Modify `packages/scenario/src/lib/node-agent.ts` — forward peer credentials.
- Create `packages/scenario/src/lib/role-gating.spec.ts` — end-to-end gated allow/deny + audit test.

**langgraph:**
- Modify `packages/langgraph/src/lib/context-query-tool.ts` — forward credentials.
- Modify `packages/langgraph/src/lib/context-query-tool.spec.ts` — append credential-forwarding test.

**apps:**
- Modify `apps/researcher/src/lib/gcp.ts`, `apps/researcher/src/lib/graph.ts`.
- Modify `apps/executor/src/lib/gcp.ts`, `apps/executor/src/lib/graph.ts`.

---

## Task 1: core — read-provenance types + factory + typed response provenance

**Files:**
- Create: `packages/core/src/lib/provenance/provenance-types.ts`
- Create: `packages/core/src/lib/provenance/provenance-factories.ts`
- Create: `packages/core/src/lib/provenance/index.ts`
- Test: `packages/core/src/lib/provenance/provenance.spec.ts`
- Modify: `packages/core/src/lib/context/context-query-types.ts`
- Modify: `packages/core/src/lib/context/context-query-factories.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  - `type AccessDecision = "allow" | "deny"`
  - `interface ReadProvenance { principalId: string; targetNodeId: NodeId; queryId: string; timestamp: Timestamp; decision: AccessDecision; matchedRoles?: readonly RoleId[]; matchedCapabilities?: readonly CapabilityId[]; reason?: string }`
  - `type AuditRecord = ReadProvenance`
  - `createReadProvenance(principalId, targetNodeId, queryId, timestamp, decision, options?): ReadProvenance`
  - `interface ReadProvenanceOptions { matchedRoles?; matchedCapabilities?; reason? }`
  - `interface ContextReadProvenance` (typed, open) — new type for `ContextQueryResponse.provenance`.
  - `ReadProvenanceSchema`, `AccessDecisionSchema`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/lib/provenance/provenance.spec.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
    createContextQueryResult,
    createReadProvenance,
    type ReadProvenance,
} from "../../index";

const TS = "2026-06-18T10:00:00.000Z";

describe("createReadProvenance", () => {
    it("builds an allow record with matched roles and capabilities", () => {
        const record: ReadProvenance = createReadProvenance(
            "principal:reader",
            "knowledge:ctx",
            "query:1",
            TS,
            "allow",
            {
                matchedRoles: ["role:reader"],
                matchedCapabilities: ["cap:read-context"],
            },
        );

        expect(record.principalId).toBe("principal:reader");
        expect(record.targetNodeId).toBe("knowledge:ctx");
        expect(record.queryId).toBe("query:1");
        expect(record.timestamp).toBe(TS);
        expect(record.decision).toBe("allow");
        expect(record.matchedRoles).toEqual(["role:reader"]);
        expect(record.matchedCapabilities).toEqual(["cap:read-context"]);
        expect(record.reason).toBeUndefined();
    });

    it("builds a deny record carrying a reason", () => {
        const record = createReadProvenance(
            "principal:intruder",
            "knowledge:ctx",
            "query:2",
            TS,
            "deny",
            { reason: "role not permitted" },
        );

        expect(record.decision).toBe("deny");
        expect(record.reason).toBe("role not permitted");
        expect(record.matchedRoles).toBeUndefined();
    });

    it("rejects a non-ISO timestamp", () => {
        expect(() =>
            createReadProvenance("p", "knowledge:ctx", "q", "not-a-date", "allow"),
        ).toThrow();
    });

    it("rejects an empty principal id", () => {
        expect(() =>
            createReadProvenance("", "knowledge:ctx", "q", TS, "deny"),
        ).toThrow();
    });
});

describe("ContextQueryResponse.provenance typing", () => {
    it("accepts and round-trips a typed read-provenance object", () => {
        const response = createContextQueryResult(
            "query:1",
            "ok",
            "knowledge:ctx",
            {},
            { answer: "hi" },
            undefined,
            {
                principalId: "principal:reader",
                targetNodeId: "knowledge:ctx",
                queryId: "query:1",
                timestamp: TS,
                decision: "allow",
            },
        );

        expect(response.provenance?.decision).toBe("allow");
        expect(response.provenance?.principalId).toBe("principal:reader");
    });

    it("stays back-compatible with the legacy source-of-truth shape", () => {
        const response = createContextQueryResult(
            "query:1",
            "ok",
            "knowledge:ctx",
            {},
            undefined,
            undefined,
            { sourceId: "knowledge:ctx", sourceOfTruth: { ownerId: "node:x" } },
        );

        expect(response.provenance?.sourceId).toBe("knowledge:ctx");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/core`
Expected: FAIL — `createReadProvenance` is not exported / undefined.

- [ ] **Step 3: Create the provenance types**

Create `packages/core/src/lib/provenance/provenance-types.ts`:

```typescript
import { z } from "zod";
import type { CapabilityId, NodeId, RoleId, Timestamp } from "../types";
import {
    CapabilityIdSchema,
    NodeIdSchema,
    RoleIdSchema,
    TimestampSchema,
} from "../types";

/**
 * Read-provenance and audit types.
 *
 * @module provenance/provenance-types
 */

/** Outcome of an access-control decision for a context read. */
export type AccessDecision = "allow" | "deny";

/** Zod schema for AccessDecision. */
export const AccessDecisionSchema = z.enum(["allow", "deny"]);

/**
 * Structured, audit-grade record of a single context-read authorization
 * decision: who asked, what they targeted, when, and the outcome. This is the
 * substrate for the leakage (Claim 2) and cross-owner (Claim 4) metrics.
 */
export interface ReadProvenance {
    readonly principalId: string;
    readonly targetNodeId: NodeId;
    readonly queryId: string;
    readonly timestamp: Timestamp;
    readonly decision: AccessDecision;
    readonly matchedRoles?: readonly RoleId[];
    readonly matchedCapabilities?: readonly CapabilityId[];
    readonly reason?: string;
}

/** Zod schema for ReadProvenance. */
export const ReadProvenanceSchema = z.object({
    principalId: z.string().min(1),
    targetNodeId: NodeIdSchema,
    queryId: z.string().min(1),
    timestamp: TimestampSchema,
    decision: AccessDecisionSchema,
    matchedRoles: z.array(RoleIdSchema).optional(),
    matchedCapabilities: z.array(CapabilityIdSchema).optional(),
    reason: z.string().optional(),
});

/** A ReadProvenance entry as consumed by an audit sink. */
export type AuditRecord = ReadProvenance;
```

- [ ] **Step 4: Create the provenance factory**

Create `packages/core/src/lib/provenance/provenance-factories.ts`:

```typescript
import type { CapabilityId, NodeId, RoleId, Timestamp } from "../types";
import {
    type AccessDecision,
    type ReadProvenance,
    ReadProvenanceSchema,
} from "./provenance-types";

/**
 * Read-provenance factory.
 *
 * @module provenance/provenance-factories
 */

/** Optional matched-policy fields for {@link createReadProvenance}. */
export interface ReadProvenanceOptions {
    readonly matchedRoles?: readonly RoleId[];
    readonly matchedCapabilities?: readonly CapabilityId[];
    readonly reason?: string;
}

/**
 * Creates a validated ReadProvenance record.
 *
 * @param principalId - Authenticated (or audit-claimed) principal id
 * @param targetNodeId - Knowledge node the read targeted
 * @param queryId - Correlating query id
 * @param timestamp - ISO 8601 decision time
 * @param decision - "allow" or "deny"
 * @param options - Matched roles/capabilities and/or a denial reason
 * @returns A new ReadProvenance instance
 * @throws {z.ZodError} If inputs are invalid (e.g. a non-ISO timestamp)
 */
export function createReadProvenance(
    principalId: string,
    targetNodeId: NodeId,
    queryId: string,
    timestamp: Timestamp,
    decision: AccessDecision,
    options: ReadProvenanceOptions = {},
): ReadProvenance {
    const parsed = ReadProvenanceSchema.parse({
        principalId,
        targetNodeId,
        queryId,
        timestamp,
        decision,
        matchedRoles: options.matchedRoles,
        matchedCapabilities: options.matchedCapabilities,
        reason: options.reason,
    });

    return {
        principalId: parsed.principalId,
        targetNodeId: parsed.targetNodeId,
        queryId: parsed.queryId,
        timestamp: parsed.timestamp,
        decision: parsed.decision,
        matchedRoles: parsed.matchedRoles,
        matchedCapabilities: parsed.matchedCapabilities,
        reason: parsed.reason,
    };
}
```

- [ ] **Step 5: Create the module barrel**

Create `packages/core/src/lib/provenance/index.ts`:

```typescript
export {
    createReadProvenance,
    type ReadProvenanceOptions,
} from "./provenance-factories";
export {
    AccessDecisionSchema,
    ReadProvenanceSchema,
} from "./provenance-types";
export type {
    AccessDecision,
    AuditRecord,
    ReadProvenance,
} from "./provenance-types";
```

- [ ] **Step 6: Type `ContextQueryResponse.provenance` additively**

In `packages/core/src/lib/context/context-query-types.ts`, add an import at the top (after the existing import line):

```typescript
import type { CapabilityId, Metadata, NodeId } from "../types";
import type { AccessDecision } from "../provenance/provenance-types";
```

Then, immediately above `export interface ContextQueryResponse {`, add:

```typescript
/**
 * Structured provenance attached to a context-query response.
 *
 * Every field is optional and the type is open (string index signature) to
 * preserve back-compat with the v1 contract, which carried an untyped
 * `Record<string, unknown>` here. Adding named optional fields is additive —
 * it does NOT change the wire schema or the contract version.
 */
export interface ContextReadProvenance {
    readonly principalId?: string;
    readonly targetNodeId?: NodeId;
    readonly queryId?: string;
    readonly timestamp?: string;
    readonly decision?: AccessDecision;
    readonly matchedRoles?: readonly string[];
    readonly matchedCapabilities?: readonly CapabilityId[];
    readonly sourceId?: string;
    readonly sourceOfTruth?: unknown;
    readonly reason?: string;
    readonly [key: string]: unknown;
}
```

Then change the `provenance` field of `ContextQueryResponse` from:

```typescript
    readonly provenance?: Record<string, unknown>;
```

to:

```typescript
    readonly provenance?: ContextReadProvenance;
```

- [ ] **Step 7: Type the factory param (keep schema permissive)**

In `packages/core/src/lib/context/context-query-factories.ts`:

Add `ContextReadProvenance` to the type import from `./context-query-types`:

```typescript
import type {
    ContextQueryContractVersion,
    ContextQueryRequest,
    ContextQueryResponse,
    ContextQueryStatus,
    ContextReadProvenance,
    QueryMode,
    RequesterDescriptor,
} from "./context-query-types";
```

Change the `createContextQueryResult` signature param from:

```typescript
    provenance?: Record<string, unknown>,
```

to:

```typescript
    provenance?: ContextReadProvenance,
```

Then change the returned object's provenance line from `provenance: input.provenance,` to use the typed argument directly (the schema still validates the shape; we return the typed value to avoid widening it back to `Record<string, unknown>`):

```typescript
        provenance: provenance,
```

Leave `ContextQueryResponseSchema.provenance` as `z.record(z.string(), z.unknown()).optional()` — do NOT change it.

- [ ] **Step 8: Export from core barrel**

In `packages/core/src/index.ts`, add the `ContextReadProvenance` type to the existing context-query type export block (the one exporting `ContextQuery`, `ContextQueryResponse`, …):

```typescript
export type {
    ContextQuery,
    ContextQueryContractVersion,
    ContextQueryRequest,
    ContextQueryResponse,
    ContextQueryResult,
    ContextQueryStatus,
    ContextReadProvenance,
    QueryMode,
    RequesterDescriptor,
} from "./lib/context/context-query-types";
```

And add a new provenance export block (place it just before the `// Result type helpers` block):

```typescript
// Provenance / audit
export {
    AccessDecisionSchema,
    createReadProvenance,
    ReadProvenanceSchema,
} from "./lib/provenance";
export type {
    AccessDecision,
    AuditRecord,
    ReadProvenance,
    ReadProvenanceOptions,
} from "./lib/provenance";
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm nx test @graph-context-protocol/core`
Expected: PASS — all provenance tests pass; existing core tests still pass.

- [ ] **Step 10: Typecheck core**

Run: `pnpm nx typecheck @graph-context-protocol/core`
Expected: PASS (exit 0).

- [ ] **Step 11: Format + commit**

```bash
pnpm biome check --write packages/core/src/lib/provenance packages/core/src/lib/context/context-query-types.ts packages/core/src/lib/context/context-query-factories.ts packages/core/src/index.ts
git add packages/core/src/lib/provenance packages/core/src/lib/context/context-query-types.ts packages/core/src/lib/context/context-query-factories.ts packages/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(core): add ReadProvenance type/factory and type ContextQueryResponse.provenance

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: core — resolve `parentRole` capability + context-rule inheritance

**Files:**
- Modify: `packages/core/src/lib/role/role-types.ts`
- Modify: `packages/core/src/lib/role/role-factories.ts`
- Test: `packages/core/src/lib/role/role.spec.ts` (append)

**Interfaces:**
- Consumes: `Capability`, `ContextRule`, `RoleDefinition` (Task target — `createRole`).
- Produces:
  - `RoleDefinition.getEffectiveCapabilities(): readonly Capability[]` (new method).
  - `createRole(id, name, description, capabilities?, contextRules?, parentRole?, metadata?)` where `parentRole` now accepts `RoleId | RoleDefinition`. When a `RoleDefinition` is passed, the parent chain is walked; when a `RoleId` string is passed, behavior is unchanged (no ancestors resolvable).
  - `hasCapability` and `getEffectiveContextRules` become inheritance-aware (own overrides ancestors).

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/lib/role/role.spec.ts` (inside the top-level `describe("role module", () => { ... })`, after the existing `getEffectiveContextRules` block):

```typescript
    describe("parentRole inheritance", () => {
        it("getEffectiveCapabilities unions own + inherited (own first)", () => {
            const base = createRole("role:base", "Base", "", [
                createCapability("cap:read", "Read", ""),
            ]);
            const child = createRole(
                "role:child",
                "Child",
                "",
                [createCapability("cap:write", "Write", "")],
                [],
                base,
            );

            expect(child.getEffectiveCapabilities().map((c) => c.id)).toEqual([
                "cap:write",
                "cap:read",
            ]);
        });

        it("hasCapability sees inherited capabilities", () => {
            const base = createRole("role:base", "Base", "", [
                createCapability("cap:read", "Read", ""),
            ]);
            const child = createRole("role:child", "Child", "", [], [], base);

            expect(child.hasCapability("cap:read")).toBe(true);
            expect(child.hasCapability("cap:missing")).toBe(false);
        });

        it("own capability overrides an inherited one with the same id", () => {
            const base = createRole("role:base", "Base", "", [
                createCapability("cap:x", "Base X", "from base"),
            ]);
            const child = createRole(
                "role:child",
                "Child",
                "",
                [createCapability("cap:x", "Child X", "from child")],
                [],
                base,
            );

            const effective = child.getEffectiveCapabilities();
            expect(effective).toHaveLength(1);
            expect(effective[0]?.description).toBe("from child");
        });

        it("resolves capabilities across multiple levels", () => {
            const grandparent = createRole("role:gp", "GP", "", [
                createCapability("cap:a", "A", ""),
            ]);
            const parent = createRole(
                "role:p",
                "P",
                "",
                [createCapability("cap:b", "B", "")],
                [],
                grandparent,
            );
            const child = createRole(
                "role:c",
                "C",
                "",
                [createCapability("cap:c", "C", "")],
                [],
                parent,
            );

            expect(child.getEffectiveCapabilities().map((c) => c.id)).toEqual([
                "cap:c",
                "cap:b",
                "cap:a",
            ]);
        });

        it("merges context rules with own rules overriding by path", () => {
            const base = createRole(
                "role:base",
                "Base",
                "",
                [],
                [createContextRule("a", "read"), createContextRule("b", "read")],
            );
            const child = createRole(
                "role:child",
                "Child",
                "",
                [],
                [createContextRule("b", "none")],
                base,
            );

            const rules = child.getEffectiveContextRules();
            const byPath = Object.fromEntries(rules.map((r) => [r.path, r.access]));
            expect(byPath.a).toBe("read");
            expect(byPath.b).toBe("none");
        });

        it("stores parentRole id when a RoleDefinition parent is passed", () => {
            const base = createRole("role:base", "Base", "");
            const child = createRole("role:child", "Child", "", [], [], base);
            expect(child.parentRole).toBe("role:base");
        });

        it("does not infinitely recurse on a self-referential parent", () => {
            const role = createRole("role:self", "Self", "", [
                createCapability("cap:own", "Own", ""),
            ]);
            // Force a degenerate self-parent through the union helper path.
            const selfParented = createRole(
                "role:self",
                "Self",
                "",
                [createCapability("cap:own", "Own", "")],
                [],
                role,
            );
            expect(selfParented.getEffectiveCapabilities().map((c) => c.id)).toEqual(
                ["cap:own"],
            );
        });
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/core`
Expected: FAIL — `getEffectiveCapabilities` is not a function.

- [ ] **Step 3: Add `getEffectiveCapabilities` to the interface**

In `packages/core/src/lib/role/role-types.ts`, inside `interface RoleDefinition`, add (after the `hasCapability` doc/method, before `getEffectiveContextRules`):

```typescript
    /**
     * Gets the effective capabilities including those inherited from ancestor
     * roles via `parentRole`. Own capabilities take precedence over inherited
     * ones with the same id.
     *
     * @returns Own + inherited capabilities, own-first, deduped by id
     */
    getEffectiveCapabilities(): readonly Capability[];
```

- [ ] **Step 4: Implement inheritance in `createRole`**

In `packages/core/src/lib/role/role-factories.ts`, replace the entire `createRole` function (lines defining `export function createRole(...) { ... }`) with:

```typescript
export function createRole(
    id: RoleId,
    name: string,
    description: string,
    capabilities: readonly Capability[] = [],
    contextRules: readonly ContextRule[] = [],
    parentRole?: RoleId | RoleDefinition,
    metadata: Metadata = {},
): RoleDefinition {
    const parentDefinition: RoleDefinition | undefined =
        typeof parentRole === "object" ? parentRole : undefined;
    const parentRoleId: RoleId | undefined =
        typeof parentRole === "object" ? parentRole.id : parentRole;

    const input = RoleDefinitionSchema.parse({
        id,
        name,
        description,
        capabilities,
        contextRules,
        parentRole: parentRoleId,
        metadata,
    });

    // Guard against a degenerate self-parent (id === own id); deeper cycles are
    // structurally impossible because a parent must be constructed first.
    const safeParent =
        parentDefinition && parentDefinition.id !== input.id
            ? parentDefinition
            : undefined;

    return {
        id: input.id,
        name: input.name,
        description: input.description,
        parentRole: input.parentRole,
        capabilities: input.capabilities,
        contextRules: input.contextRules,
        metadata: input.metadata,
        hasCapability(capabilityId: CapabilityId): boolean {
            return this.getEffectiveCapabilities().some(
                (cap) => cap.id === capabilityId,
            );
        },
        getEffectiveCapabilities(): readonly Capability[] {
            return mergeCapabilitiesById(
                input.capabilities,
                safeParent ? safeParent.getEffectiveCapabilities() : [],
            );
        },
        getEffectiveContextRules(): readonly ContextRule[] {
            return mergeContextRulesByPath(
                input.contextRules,
                safeParent ? safeParent.getEffectiveContextRules() : [],
            );
        },
    };
}

/** Unions own + inherited capabilities, own-first, deduped by id. */
function mergeCapabilitiesById(
    own: readonly Capability[],
    inherited: readonly Capability[],
): readonly Capability[] {
    const result: Capability[] = [];
    const seen = new Set<CapabilityId>();
    for (const cap of [...own, ...inherited]) {
        if (!seen.has(cap.id)) {
            seen.add(cap.id);
            result.push(cap);
        }
    }
    return result;
}

/** Unions own + inherited context rules, own-first, deduped by path. */
function mergeContextRulesByPath(
    own: readonly ContextRule[],
    inherited: readonly ContextRule[],
): readonly ContextRule[] {
    const result: ContextRule[] = [];
    const seen = new Set<string>();
    for (const rule of [...own, ...inherited]) {
        if (!seen.has(rule.path)) {
            seen.add(rule.path);
            result.push(rule);
        }
    }
    return result;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test @graph-context-protocol/core`
Expected: PASS — new inheritance tests pass; all existing role tests still pass.

- [ ] **Step 6: Typecheck core**

Run: `pnpm nx typecheck @graph-context-protocol/core`
Expected: PASS (exit 0).

- [ ] **Step 7: Format + commit**

```bash
pnpm biome check --write packages/core/src/lib/role
git add packages/core/src/lib/role
git commit -m "$(cat <<'EOF'
feat(core): resolve parentRole capability and context-rule inheritance

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: server — `AuditSink` interface + in-memory impl + wiring

**Files:**
- Create: `packages/server/src/lib/audit/types.ts`
- Create: `packages/server/src/lib/audit/implementation.ts`
- Create: `packages/server/src/lib/audit/index.ts`
- Test: `packages/server/src/lib/audit/audit.spec.ts`
- Modify: `packages/server/src/lib/server/types.ts`
- Modify: `packages/server/src/lib/handlers/types.ts`
- Modify: `packages/server/src/lib/server/implementation.ts`
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Consumes: `ReadProvenance` from `@graph-context-protocol/core` (Task 1).
- Produces:
  - `interface AuditSink { record(event: ReadProvenance): void | Promise<void>; list(): readonly ReadProvenance[] }`
  - `createInMemoryAuditSink(): AuditSink`
  - `ServerDependencies.audit?: AuditSink`
  - `HandlerContext.audit?: AuditSink`
  - default `ServerDependencies` includes an in-memory audit sink; `receive` threads it into `HandlerContext`.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/lib/audit/audit.spec.ts`:

```typescript
import type { ReadProvenance } from "@graph-context-protocol/core";
import { describe, expect, it } from "vitest";
import { createInMemoryAuditSink } from "./implementation";

function record(decision: "allow" | "deny", id: string): ReadProvenance {
    return {
        principalId: id,
        targetNodeId: "knowledge:ctx",
        queryId: `q:${id}`,
        timestamp: "2026-06-18T10:00:00.000Z",
        decision,
    };
}

describe("createInMemoryAuditSink", () => {
    it("starts empty", () => {
        const sink = createInMemoryAuditSink();
        expect(sink.list()).toEqual([]);
    });

    it("records events in insertion order", () => {
        const sink = createInMemoryAuditSink();
        sink.record(record("allow", "a"));
        sink.record(record("deny", "b"));

        const all = sink.list();
        expect(all).toHaveLength(2);
        expect(all[0]?.principalId).toBe("a");
        expect(all[1]?.decision).toBe("deny");
    });

    it("returns a defensive copy from list()", () => {
        const sink = createInMemoryAuditSink();
        sink.record(record("allow", "a"));
        const snapshot = sink.list();
        (snapshot as ReadProvenance[]).push(record("deny", "x"));
        expect(sink.list()).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test server`
Expected: FAIL — cannot find `./implementation` in `audit`.

- [ ] **Step 3: Create the audit sink type**

Create `packages/server/src/lib/audit/types.ts`:

```typescript
/**
 * Audit sink for context-read provenance.
 *
 * @module audit/types
 */

import type { ReadProvenance } from "@graph-context-protocol/core";

/** A sink that records context-read authorization decisions. */
export interface AuditSink {
    /** Records a single read-provenance/audit event. */
    record(event: ReadProvenance): void | Promise<void>;
    /** Returns all recorded events in insertion order (oldest first). */
    list(): readonly ReadProvenance[];
}
```

- [ ] **Step 4: Create the in-memory implementation**

Create `packages/server/src/lib/audit/implementation.ts`:

```typescript
/**
 * In-memory audit sink implementation.
 *
 * @module audit/implementation
 */

import type { ReadProvenance } from "@graph-context-protocol/core";
import type { AuditSink } from "./types";

/**
 * Creates an in-memory audit sink. Records are held in insertion order and
 * returned as a defensive copy. Sufficient for tests and the M5 harness's
 * provenance-completeness metric; swap for a persistent sink when reproducible
 * logs are required.
 *
 * @returns A new in-memory AuditSink
 */
export function createInMemoryAuditSink(): AuditSink {
    const records: ReadProvenance[] = [];
    return {
        record(event: ReadProvenance): void {
            records.push(event);
        },
        list(): readonly ReadProvenance[] {
            return [...records];
        },
    };
}
```

- [ ] **Step 5: Create the module barrel**

Create `packages/server/src/lib/audit/index.ts`:

```typescript
export { createInMemoryAuditSink } from "./implementation";
export type { AuditSink } from "./types";
```

- [ ] **Step 6: Add `audit` to `ServerDependencies`**

In `packages/server/src/lib/server/types.ts`, add the import (with the other `../<module>/types` imports):

```typescript
import type { AuditSink } from "../audit/types";
```

Add the optional field to `interface ServerDependencies` (after `readonly graph?: Graph;`):

```typescript
    readonly audit?: AuditSink;
```

- [ ] **Step 7: Add `audit` to `HandlerContext`**

In `packages/server/src/lib/handlers/types.ts`, add the import (with the other type imports):

```typescript
import type { AuditSink } from "../audit/types";
```

Add the optional field to `interface HandlerContext` (after the `auth?` field):

```typescript
    /** Audit sink for recording context-read decisions. */
    readonly audit?: AuditSink;
```

- [ ] **Step 8: Wire default sink + thread into HandlerContext**

In `packages/server/src/lib/server/implementation.ts`:

Add the import (with the other `../<module>/implementation` imports near the top):

```typescript
import { createInMemoryAuditSink } from "../audit/implementation";
```

In `defaultDependencies` (inside `createGraphContextServer`), add an `audit` entry (after `sync: createSyncScheduler(),`):

```typescript
        audit: createInMemoryAuditSink(),
```

In the `receive` method's `dispatch(...)` HandlerContext object, add (after `auth: this.state.dependencies.auth,`):

```typescript
                audit: this.state.dependencies.audit,
```

- [ ] **Step 9: Export from server barrel**

In `packages/server/src/index.ts`, add a new block (place it just after the External agents block, near the top, keeping alphabetical-ish grouping):

```typescript
// Audit
export { createInMemoryAuditSink } from "./lib/audit/index";
export type { AuditSink } from "./lib/audit/index";
```

- [ ] **Step 10: Run test to verify it passes**

Run: `pnpm nx test server`
Expected: PASS — audit tests pass; existing server tests still pass.

- [ ] **Step 11: Typecheck server**

Run: `pnpm nx typecheck server`
Expected: PASS (exit 0).

- [ ] **Step 12: Format + commit**

```bash
pnpm biome check --write packages/server/src/lib/audit packages/server/src/lib/server/types.ts packages/server/src/lib/server/implementation.ts packages/server/src/lib/handlers/types.ts packages/server/src/index.ts
git add packages/server/src/lib/audit packages/server/src/lib/server/types.ts packages/server/src/lib/server/implementation.ts packages/server/src/lib/handlers/types.ts packages/server/src/index.ts
git commit -m "$(cat <<'EOF'
feat(server): add AuditSink with in-memory default wired through ServerDependencies

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: server — authorization grant + handler records decisions + response provenance

**Files:**
- Modify: `packages/server/src/lib/auth/node-authorization.ts`
- Modify: `packages/server/src/lib/handlers/context-query-handler.ts`
- Test: `packages/server/src/lib/handlers/context-query-handler.spec.ts` (append)
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- Consumes: `AuditSink` (Task 3), `createReadProvenance` + `ReadProvenance` (Task 1), `RoleDefinition.getEffectiveCapabilities` (Task 2).
- Produces:
  - `interface NodeAuthorizationGrant { matchedRoles: readonly RoleId[]; matchedCapabilities: readonly CapabilityId[] }`
  - `authorizeKnowledgeNodeAccess(...) : Result<NodeAuthorizationGrant, ServerError>` (was `Result<void, ServerError>`).
  - Handler records one `ReadProvenance` per decision via `context.audit?.record(...)` and populates `response.payload.provenance`.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/lib/handlers/context-query-handler.spec.ts` a new top-level describe block (after the final closing of `describe("context-query-handler", ...)`). First add `createInMemoryAuditSink` to the server-internal imports at the top of the file by adding this import line (below the existing `import { createKnowledgeSourceRegistry } ...` line):

```typescript
import { createInMemoryAuditSink } from "../audit/implementation";
```

Also add `type ContextQueryResult` is already imported. Add `type AuditSink` import:

```typescript
import type { AuditSink } from "../audit/types";
```

Then append:

```typescript
describe("context-query-handler — M1 audit + provenance", () => {
    const handler = createContextQueryHandler();

    function gatedContext(
        auth: AuthProvider,
        audit: AuditSink,
        readableByRoles: readonly string[],
    ): HandlerContext {
        const policy = createAccessPolicyDescriptor(
            readableByRoles,
            [],
            false,
            "error",
        );
        const metadata = createMetadataWithAccessPolicy(policy);
        const ownerRole = createRole("role:owner", "Owner", "Owner");
        const node = createKnowledgeNode("knowledge:1", ownerRole, {
            tags: ["test"],
            contentType: "text/plain",
            ...metadata,
        });
        const graph = createGraph("graph:1").addNode(node);
        const { registry } = createMockAdapter("knowledge:1");
        return {
            serverId: "server:1",
            localNodeId: "node:local",
            graph,
            connections: {} as unknown as HandlerContext["connections"],
            externalAgents: {} as unknown as HandlerContext["externalAgents"],
            knowledgeSources: registry,
            auth,
            audit,
            inboundMetadata: { "gcp.credentials": creds },
            metadata: {},
        };
    }

    it("records an allow decision and stamps response provenance", async () => {
        const audit = createInMemoryAuditSink();
        const context = gatedContext(
            createAllowAllForPrincipal(viewerPrincipal),
            audit,
            ["role:viewer"],
        );
        const query = createContextQuery(
            "query:allow",
            createRequesterDescriptor("p:req"),
            "knowledge:1",
            "text",
            "hello",
        );
        const message = createContextQueryMessage(query);

        const result = await handler.handle(message, context);

        expect(result.success).toBe(true);
        const records = audit.list();
        expect(records).toHaveLength(1);
        expect(records[0]?.decision).toBe("allow");
        expect(records[0]?.principalId).toBe("principal:viewer");
        expect(records[0]?.matchedRoles).toEqual(["role:viewer"]);
        if (result.success && result.data.response) {
            const payload = result.data.response.payload as ContextQueryResult;
            expect(payload.status).toBe("ok");
            expect(payload.provenance?.decision).toBe("allow");
            expect(payload.provenance?.principalId).toBe("principal:viewer");
        }
    });

    it("records a deny decision when the policy blocks the role", async () => {
        const audit = createInMemoryAuditSink();
        const context = gatedContext(
            createAllowAllForPrincipal(viewerPrincipal),
            audit,
            ["role:ceo"],
        );
        const query = createContextQuery(
            "query:deny",
            createRequesterDescriptor("p:req"),
            "knowledge:1",
            "text",
            "hello",
        );
        const message = createContextQueryMessage(query);

        const result = await handler.handle(message, context);

        const records = audit.list();
        expect(records).toHaveLength(1);
        expect(records[0]?.decision).toBe("deny");
        expect(records[0]?.principalId).toBe("principal:viewer");
        expect(records[0]?.reason).toBeDefined();
        if (result.success && result.data.response) {
            const payload = result.data.response.payload as ContextQueryResult;
            expect(payload.status).toBe("denied");
            expect(payload.provenance?.decision).toBe("deny");
        }
    });

    it("records a deny when authentication fails (anonymous principal)", async () => {
        const audit = createInMemoryAuditSink();
        const context = gatedContext(
            createFailingAuthProvider("bad token"),
            audit,
            ["role:viewer"],
        );
        const query = createContextQuery(
            "query:anon",
            createRequesterDescriptor("principal:anon"),
            "knowledge:1",
            "text",
            "hello",
        );
        const message = createContextQueryMessage(query);

        await handler.handle(message, context);

        const records = audit.list();
        expect(records).toHaveLength(1);
        expect(records[0]?.decision).toBe("deny");
        expect(records[0]?.principalId).toBe("principal:anon");
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test server`
Expected: FAIL — `audit.list()` is empty / `payload.provenance?.decision` undefined (handler does not record yet).

- [ ] **Step 3: Make `authorizeKnowledgeNodeAccess` return a grant + use effective caps**

In `packages/server/src/lib/auth/node-authorization.ts`:

Add `RoleId` / `CapabilityId` to the core type import:

```typescript
import {
    type CapabilityId,
    fail,
    GCP_ACCESS_POLICY_METADATA_KEY,
    type GraphNode,
    parseAccessPolicyFromMetadata,
    type Result,
    type RoleId,
    succeed,
} from "@graph-context-protocol/core";
```

Add the grant interface (after `NodeAuthorizationOptions`):

```typescript
/** Matched policy detail returned on a successful node authorization. */
export interface NodeAuthorizationGrant {
    readonly matchedRoles: readonly RoleId[];
    readonly matchedCapabilities: readonly CapabilityId[];
}
```

Change the function return type from `Result<void, ServerError>` to `Result<NodeAuthorizationGrant, ServerError>`.

In step 4 (capability check), replace the `principalRoleCaps` construction so it uses *effective* (inheritance-aware) capabilities:

```typescript
        const principalRoleCaps = principal.role
            ? new Set(
                  principal.role
                      .getEffectiveCapabilities()
                      .map((c) => c.id),
              )
            : new Set<string>();
```

Replace the final `return succeed(undefined);` with a grant payload built from the satisfied policy fields:

```typescript
    const matchedRoles: readonly RoleId[] =
        policy.readableByRoles.length > 0 && principalRoleId !== undefined
            ? [principalRoleId]
            : [];

    return succeed({
        matchedRoles,
        matchedCapabilities: policy.requiredCapabilities,
    });
```

(Note: when the role check passes, `principalRoleId` is in `readableByRoles`; `policy.requiredCapabilities` is fully satisfied by the point we reach success, so it is the matched set.)

- [ ] **Step 4: Record decisions + populate provenance in the handler**

In `packages/server/src/lib/handlers/context-query-handler.ts`:

Add `createReadProvenance` and `ContextReadProvenance` to the core import block:

```typescript
import {
    type ContextQuery,
    ContextQueryRequestSchema,
    type ContextQueryResult,
    type ContextReadProvenance,
    createContextQueryResult,
    createMessageHeader,
    createProtocolMessage,
    createReadProvenance,
    type Graph,
    type GraphNode,
    type ProtocolMessage,
    type Result,
    succeed,
} from "@graph-context-protocol/core";
```

Change `buildDeniedResponse` to accept and forward provenance:

```typescript
function buildDeniedResponse(
    queryId: string,
    requestMessage: ProtocolMessage,
    localNodeId: string,
    reason: string,
    provenance?: ContextReadProvenance,
): ProtocolMessage {
    const deniedResult = createContextQueryResult(
        queryId,
        "denied",
        localNodeId,
        { reason },
        undefined,
        reason,
        provenance,
    );

    return buildResponseMessage(deniedResult, requestMessage, localNodeId);
}
```

Inside `handle(...)`, immediately after `const query: ContextQuery = validationResult.data;` add a local recorder helper:

```typescript
            const recordDeny = async (
                principalId: string,
                reason: string,
            ): Promise<ContextReadProvenance> => {
                const provenance = createReadProvenance(
                    principalId,
                    query.targetNodeId,
                    query.queryId,
                    new Date().toISOString(),
                    "deny",
                    { reason },
                );
                await context.audit?.record(provenance);
                return provenance;
            };
```

Update the three pre-authorization deny branches to record + attach provenance:

- "No auth provider configured":

```typescript
            if (authProvider === undefined) {
                const provenance = await recordDeny(
                    query.requester.principalId,
                    "No auth provider configured",
                );
                return succeed({
                    handled: true,
                    response: buildDeniedResponse(
                        query.queryId,
                        message,
                        localNodeId,
                        "No auth provider configured",
                        provenance,
                    ),
                    metadata: { denied: true },
                });
            }
```

- "No credentials provided":

```typescript
            if (credentials === undefined) {
                const provenance = await recordDeny(
                    query.requester.principalId,
                    "No credentials provided",
                );
                return succeed({
                    handled: true,
                    response: buildDeniedResponse(
                        query.queryId,
                        message,
                        localNodeId,
                        "No credentials provided",
                        provenance,
                    ),
                    metadata: { denied: true },
                });
            }
```

- Authentication failure:

```typescript
            if (!authResult.success) {
                const reason = `Authentication failed: ${authResult.error.message}`;
                const provenance = await recordDeny(
                    query.requester.principalId,
                    reason,
                );
                return succeed({
                    handled: true,
                    response: buildDeniedResponse(
                        query.queryId,
                        message,
                        localNodeId,
                        reason,
                        provenance,
                    ),
                    metadata: { denied: true },
                });
            }
```

Update the authorization step to capture the grant and record allow/deny. Replace the existing block from `const authzResult = authorizeAccess(...)` through the deny return with:

```typescript
            const authzResult = authorizeAccess(
                principal,
                targetNode,
                authProvider,
                { action: "query-knowledge" },
            );

            if (!authzResult.success) {
                const reason = `Authorization denied: ${authzResult.error.message}`;
                const provenance = createReadProvenance(
                    principal.id,
                    query.targetNodeId,
                    query.queryId,
                    new Date().toISOString(),
                    "deny",
                    { reason: authzResult.error.message },
                );
                await context.audit?.record(provenance);
                return succeed({
                    handled: true,
                    response: buildDeniedResponse(
                        query.queryId,
                        message,
                        localNodeId,
                        reason,
                        provenance,
                    ),
                    metadata: {
                        denied: true,
                        reason: authzResult.error.message,
                    },
                });
            }

            const grant = authzResult.data;
```

Finally, in the execute step, after `const queryResult = await executeQuery(...)`, record the allow decision and enrich the response provenance. Replace:

```typescript
            const responseMessage = buildResponseMessage(
                queryResult,
                message,
                localNodeId,
            );
```

with:

```typescript
            const allowProvenance = createReadProvenance(
                principal.id,
                query.targetNodeId,
                query.queryId,
                new Date().toISOString(),
                "allow",
                {
                    matchedRoles: grant.matchedRoles,
                    matchedCapabilities: grant.matchedCapabilities,
                },
            );
            await context.audit?.record(allowProvenance);

            const enrichedResult: ContextQueryResult = {
                ...queryResult,
                provenance: {
                    ...(queryResult.provenance ?? {}),
                    ...allowProvenance,
                },
            };

            const responseMessage = buildResponseMessage(
                enrichedResult,
                message,
                localNodeId,
            );
```

- [ ] **Step 5: Export `NodeAuthorizationGrant`**

In `packages/server/src/index.ts`, add `NodeAuthorizationGrant` to the auth type export block:

```typescript
export type {
    AuthAction,
    AuthorizationDecision,
    AuthorizationRequest,
    AuthProvider,
    Credentials,
    NodeAuthorizationGrant,
    NodeAuthorizationOptions,
    Principal,
} from "./lib/auth/index";
```

(Confirm `./lib/auth/index` re-exports `NodeAuthorizationGrant` — it re-exports from `node-authorization`; if `auth/index.ts` uses explicit named exports, add `NodeAuthorizationGrant` there too.)

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm nx test server`
Expected: PASS — new M1 audit/provenance tests pass; all existing handler tests still pass.

- [ ] **Step 7: Typecheck server**

Run: `pnpm nx typecheck server`
Expected: PASS (exit 0).

- [ ] **Step 8: Format + commit**

```bash
pnpm biome check --write packages/server/src/lib/auth/node-authorization.ts packages/server/src/lib/handlers/context-query-handler.ts packages/server/src/lib/handlers/context-query-handler.spec.ts packages/server/src/index.ts packages/server/src/lib/auth/index.ts
git add packages/server/src/lib/auth packages/server/src/lib/handlers packages/server/src/index.ts
git commit -m "$(cat <<'EOF'
feat(server): record allow/deny read-provenance and return matched authorization grant

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: scenario — gated `createGcpNode` deps + end-to-end allow/deny/audit test

**Files:**
- Modify: `packages/scenario/src/lib/gcp-node.ts`
- Test: `packages/scenario/src/lib/role-gating.spec.ts`

**Interfaces:**
- Consumes: `AuthProvider`, `AuditSink`, `createInMemoryAuditSink`, `createStaticTokenAuthProvider`, `createFetchHandler`, `queryRemoteContext` (server); `createContextQuery`, `createRequesterDescriptor`, `createRole` (core).
- Produces:
  - `interface GcpNodeDependencies { authProvider?: AuthProvider; auditSink?: AuditSink }`
  - `createGcpNode(config, deps?): Promise<GraphContextServer>` — when `authProvider`/`auditSink` are provided they override the server defaults; omitting them preserves the existing allow-all + default-sink behavior (M0 tests stay green).

- [ ] **Step 1: Write the failing test**

Create `packages/scenario/src/lib/role-gating.spec.ts`:

```typescript
import { fileURLToPath } from "node:url";
import {
    createContextQuery,
    createRequesterDescriptor,
    createRole,
} from "@graph-context-protocol/core";
import {
    type AuditSink,
    type Credentials,
    createFetchHandler,
    createInMemoryAuditSink,
    createStaticTokenAuthProvider,
    type Principal,
    queryRemoteContext,
} from "@graph-context-protocol/server";
import { describe, expect, it } from "vitest";
import { createGcpNode } from "./gcp-node";

const FIXTURE = fileURLToPath(
    new URL("./__fixtures__/context.md", import.meta.url),
);

const PEER_TOKEN = "tok:peer";
const peerPrincipal: Principal = {
    id: "principal:peer",
    role: createRole("role:peer", "Peer", "Authorized peer reader"),
    capabilities: [],
    metadata: {},
};

async function buildGatedNode(audit: AuditSink) {
    const authProvider = createStaticTokenAuthProvider(
        new Map([[PEER_TOKEN, peerPrincipal]]),
    );
    const server = await createGcpNode(
        {
            serverId: "server:gated",
            nodeId: "node:gated",
            knowledgeId: "knowledge:gated-context",
            role: {
                id: "role:gated-context",
                name: "Gated Context",
                description: "Role-gated context node",
            },
            accessPolicy: {
                readableByRoles: ["role:peer"],
                requiredCapabilities: [],
                fallbackAllowed: false,
                denialMode: "error",
            },
            knowledge: { filePath: FIXTURE, tags: ["tasks"] },
        },
        { authProvider, auditSink: audit },
    );
    const handler = createFetchHandler({ server });
    const fetchImpl: typeof fetch = async (_url, init) =>
        handler(new Request("http://node/gated", init ?? undefined));
    return { fetchImpl };
}

function query(principalId: string) {
    return createContextQuery(
        `query:${principalId}`,
        createRequesterDescriptor(principalId),
        "knowledge:gated-context",
        "text",
        "what is the status?",
    );
}

describe("role-gated context node", () => {
    it("allows an authenticated, authorized peer and records an allow", async () => {
        const audit = createInMemoryAuditSink();
        const { fetchImpl } = await buildGatedNode(audit);
        const credentials: Credentials = { type: "token", value: PEER_TOKEN };

        const result = await queryRemoteContext({
            url: "http://node/gated",
            query: query("principal:peer"),
            credentials,
            fetchImpl,
        });

        expect(result.status).toBe("ok");
        const records = audit.list();
        expect(records.some((r) => r.decision === "allow")).toBe(true);
    });

    it("denies an anonymous principal and records a deny", async () => {
        const audit = createInMemoryAuditSink();
        const { fetchImpl } = await buildGatedNode(audit);

        const result = await queryRemoteContext({
            url: "http://node/gated",
            query: query("principal:anon"),
            // No credentials → defaults to anonymous → token auth fails.
            fetchImpl,
        });

        expect(result.status).toBe("denied");
        const records = audit.list();
        expect(records).toHaveLength(1);
        expect(records[0]?.decision).toBe("deny");
    });

    it("denies a wrong-role principal and records a deny", async () => {
        const audit = createInMemoryAuditSink();
        const wrongRoleProvider = createStaticTokenAuthProvider(
            new Map([
                [
                    "tok:wrong",
                    {
                        id: "principal:wrong",
                        role: createRole("role:wrong", "Wrong", ""),
                        capabilities: [],
                        metadata: {},
                    } satisfies Principal,
                ],
            ]),
        );
        const server = await createGcpNode(
            {
                serverId: "server:gated2",
                nodeId: "node:gated2",
                knowledgeId: "knowledge:gated2",
                role: {
                    id: "role:gated2",
                    name: "Gated",
                    description: "d",
                },
                accessPolicy: {
                    readableByRoles: ["role:peer"],
                    requiredCapabilities: [],
                    fallbackAllowed: false,
                    denialMode: "error",
                },
                knowledge: { filePath: FIXTURE, tags: ["tasks"] },
            },
            { authProvider: wrongRoleProvider, auditSink: audit },
        );
        const handler = createFetchHandler({ server });
        const fetchImpl: typeof fetch = async (_url, init) =>
            handler(new Request("http://node/gated2", init ?? undefined));

        const result = await queryRemoteContext({
            url: "http://node/gated2",
            query: createContextQuery(
                "query:wrong",
                createRequesterDescriptor("principal:wrong"),
                "knowledge:gated2",
                "text",
                "status?",
            ),
            credentials: { type: "token", value: "tok:wrong" },
            fetchImpl,
        });

        expect(result.status).toBe("denied");
        expect(audit.list().some((r) => r.decision === "deny")).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: FAIL — `createGcpNode` does not accept a second `deps` argument / gating not applied (allow-all default).

- [ ] **Step 3: Accept dependencies in `createGcpNode`**

In `packages/scenario/src/lib/gcp-node.ts`:

Extend the server import to bring in the dependency + provider types:

```typescript
import {
    type AuditSink,
    type AuthProvider,
    createGraphContextServer,
    createKnowledgeSourceRegistry,
    type GraphContextServer,
    type ServerDependencies,
} from "@graph-context-protocol/server";
```

Add the dependencies interface (after the `resolveGraphId` function, before `createGcpNode`):

```typescript
/** Optional runtime dependencies for a GCP node. */
export interface GcpNodeDependencies {
    /**
     * Auth provider for the node. When omitted, the server's allow-all
     * provider is used (suitable for an ungated demo).
     */
    readonly authProvider?: AuthProvider;
    /**
     * Audit sink for read-provenance. When omitted, the server's default
     * in-memory sink is used.
     */
    readonly auditSink?: AuditSink;
}
```

Change the `createGcpNode` signature:

```typescript
export async function createGcpNode(
    config: GcpNodeConfigInput,
    deps: GcpNodeDependencies = {},
): Promise<GraphContextServer> {
```

Replace the `createGraphContextServer(...)` call so it conditionally injects the provided dependencies (only override when provided, preserving server defaults otherwise):

```typescript
    const dependencies: Partial<ServerDependencies> = {
        graph,
        knowledgeSources: registered.data,
    };
    if (deps.authProvider !== undefined) {
        dependencies.auth = deps.authProvider;
    }
    if (deps.auditSink !== undefined) {
        dependencies.audit = deps.auditSink;
    }

    const server = createGraphContextServer(
        {
            id: cfg.serverId,
            localNodeId: cfg.nodeId,
            shutdownTimeoutMs: cfg.shutdownTimeoutMs,
        },
        dependencies,
    );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: PASS — role-gating tests pass; existing M0 scenario tests still pass (they call `createGcpNode(config)` with no deps).

- [ ] **Step 5: Typecheck scenario**

Run: `pnpm nx typecheck @graph-context-protocol/scenario`
Expected: PASS (exit 0).

- [ ] **Step 6: Format + commit**

```bash
pnpm biome check --write packages/scenario/src/lib/gcp-node.ts packages/scenario/src/lib/role-gating.spec.ts
git add packages/scenario/src/lib/gcp-node.ts packages/scenario/src/lib/role-gating.spec.ts
git commit -m "$(cat <<'EOF'
feat(scenario): inject auth provider + audit sink into createGcpNode; gated e2e test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: langgraph — forward credentials from the context-query tool

**Files:**
- Modify: `packages/langgraph/src/lib/context-query-tool.ts`
- Test: `packages/langgraph/src/lib/context-query-tool.spec.ts` (append)
- Modify: `packages/scenario/src/lib/config.ts`
- Modify: `packages/scenario/src/lib/node-agent.ts`

**Interfaces:**
- Consumes: `Credentials` from `@graph-context-protocol/server`; `queryRemoteContext` options already accept `credentials`.
- Produces:
  - `ContextQueryToolConfig.credentials?: Credentials` — forwarded to `queryFn`.
  - `NodeAgentConfig.peers[].credentials?: Credentials` — forwarded to `createContextQueryTool`.

- [ ] **Step 1: Write the failing test**

Append to `packages/langgraph/src/lib/context-query-tool.spec.ts` a new test. First confirm the existing imports include `queryRemoteContext`'s option type; then append:

```typescript
describe("createContextQueryTool — credential forwarding", () => {
    it("forwards configured credentials to the query function", async () => {
        const calls: Array<{ credentials?: unknown }> = [];
        const queryFn = (async (options: { credentials?: unknown }) => {
            calls.push({ credentials: options.credentials });
            return {
                contractVersion: "gcp-context-contract/v1" as const,
                queryId: "q",
                status: "ok" as const,
                sourceNodeId: "knowledge:peer",
                result: "answer",
                metadata: {},
            };
        }) as unknown as typeof import("@graph-context-protocol/server").queryRemoteContext;

        const tool = createContextQueryTool({
            peerUrl: "http://peer/gcp",
            targetNodeId: "knowledge:peer",
            credentials: { type: "token", value: "tok:abc" },
            queryFn,
        });

        await tool.invoke({ question: "status?" });

        expect(calls).toHaveLength(1);
        expect(calls[0]?.credentials).toEqual({
            type: "token",
            value: "tok:abc",
        });
    });
});
```

(If the existing spec already imports `createContextQueryTool` and `describe/it/expect`, reuse them — do not duplicate imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/langgraph`
Expected: FAIL — `credentials` is not a known `ContextQueryToolConfig` property / not forwarded.

- [ ] **Step 3: Forward credentials in the tool**

In `packages/langgraph/src/lib/context-query-tool.ts`:

Add the `Credentials` type import (extend the existing server import):

```typescript
import {
    type Credentials,
    queryRemoteContext,
} from "@graph-context-protocol/server";
```

Add to `interface ContextQueryToolConfig` (after `requesterId?`):

```typescript
    /** Credentials sent to the peer under `gcp.credentials`. Defaults to anonymous. */
    readonly credentials?: Credentials;
```

Destructure it and pass it to `queryFn`. Change the destructure to include `credentials`:

```typescript
    const {
        peerUrl,
        targetNodeId,
        toolName = "query_peer_context",
        requesterId = "principal:peer-agent",
        credentials,
        queryFn = queryRemoteContext,
    } = config;
```

And change the call:

```typescript
                const result = await queryFn({
                    url: peerUrl,
                    query,
                    credentials,
                });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test @graph-context-protocol/langgraph`
Expected: PASS — credential-forwarding test passes; existing tool tests still pass.

- [ ] **Step 5: Add peer credentials to `NodeAgentConfig`**

In `packages/scenario/src/lib/config.ts`, add a `Credentials` import at the top:

```typescript
import type { Credentials } from "@graph-context-protocol/server";
import { z } from "zod";
```

Add a `credentials` field to each peer entry of `NodeAgentConfig`:

```typescript
    readonly peers: ReadonlyArray<{
        readonly peerUrl: string;
        readonly targetNodeId: string;
        readonly credentials?: Credentials;
    }>;
```

- [ ] **Step 6: Forward peer credentials in `createNodeAgent`**

In `packages/scenario/src/lib/node-agent.ts`, change the tool construction to pass credentials:

```typescript
    const tools = config.peers.map((peer) =>
        createContextQueryTool({
            peerUrl: peer.peerUrl,
            targetNodeId: peer.targetNodeId,
            credentials: peer.credentials,
        }),
    );
```

- [ ] **Step 7: Typecheck both packages**

Run: `pnpm nx typecheck @graph-context-protocol/langgraph @graph-context-protocol/scenario`
Expected: PASS (exit 0).

- [ ] **Step 8: Run scenario tests (node-agent spec still green)**

Run: `pnpm nx test @graph-context-protocol/scenario`
Expected: PASS.

- [ ] **Step 9: Format + commit**

```bash
pnpm biome check --write packages/langgraph/src/lib/context-query-tool.ts packages/langgraph/src/lib/context-query-tool.spec.ts packages/scenario/src/lib/config.ts packages/scenario/src/lib/node-agent.ts
git add packages/langgraph/src/lib/context-query-tool.ts packages/langgraph/src/lib/context-query-tool.spec.ts packages/scenario/src/lib/config.ts packages/scenario/src/lib/node-agent.ts
git commit -m "$(cat <<'EOF'
feat(langgraph): forward credentials from context-query tool; thread peer creds via scenario

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: apps — gated policies + authenticated principals + demo parity

**Files:**
- Modify: `apps/researcher/src/lib/gcp.ts`
- Modify: `apps/researcher/src/lib/graph.ts`
- Modify: `apps/executor/src/lib/gcp.ts`
- Modify: `apps/executor/src/lib/graph.ts`

**Interfaces:**
- Consumes: `createRole` (core); `createStaticTokenAuthProvider`, `Principal` (server); `createGcpNode` (scenario, now with deps).
- Topology / credential routing (both tokens are demo credentials, not secrets):
  - **Researcher node** owns `knowledge:researcher-context`; only `role:executor` may read it. Its auth provider maps `tok:executor` → executor principal (role `role:executor`).
  - **Executor node** owns `knowledge:executor-context`; only `role:researcher` may read it. Its auth provider maps `tok:researcher` → researcher principal (role `role:researcher`).
  - **Researcher agent** queries `knowledge:executor-context` → sends `tok:researcher` (so the executor authenticates it as `role:researcher`).
  - **Executor agent** queries `knowledge:researcher-context` → sends `tok:executor` (so the researcher authenticates it as `role:executor`).

- [ ] **Step 1: Gate the researcher node + authenticate its callers**

Replace the contents of `apps/researcher/src/lib/gcp.ts` with:

```typescript
import path from "node:path";
import { createRole } from "@graph-context-protocol/core";
import { createGcpNode } from "@graph-context-protocol/scenario";
import {
    createStaticTokenAuthProvider,
    type GraphContextServer,
    type Principal,
} from "@graph-context-protocol/server";

/** Demo credential the executor presents when reading researcher context. */
const EXECUTOR_TOKEN = "tok:executor";

/** Principal the researcher node recognizes for inbound executor reads. */
const executorPrincipal: Principal = {
    id: "principal:executor",
    role: createRole(
        "role:executor",
        "Executor",
        "Executor node, allowed to read researcher context",
    ),
    capabilities: [],
    metadata: {},
};

let serverPromise: Promise<GraphContextServer> | undefined;

/** Returns the started researcher GCP server, building it once per process. */
export function getGcpServer(): Promise<GraphContextServer> {
    if (serverPromise === undefined) {
        const authProvider = createStaticTokenAuthProvider(
            new Map([[EXECUTOR_TOKEN, executorPrincipal]]),
        );
        serverPromise = createGcpNode(
            {
                serverId: "server:researcher",
                nodeId: "node:researcher",
                knowledgeId: "knowledge:researcher-context",
                graphId: "graph:researcher",
                role: {
                    id: "role:researcher-context",
                    name: "Researcher Context",
                    description:
                        "Role-gated context for the researcher node",
                },
                accessPolicy: {
                    readableByRoles: ["role:executor"],
                    requiredCapabilities: [],
                    fallbackAllowed: false,
                    denialMode: "error",
                },
                knowledge: {
                    filePath: path.join(process.cwd(), "CONTEXT-1.md"),
                    tags: ["tasks", "notes"],
                    contentType: "text/markdown",
                },
            },
            { authProvider },
        );
    }
    return serverPromise;
}
```

- [ ] **Step 2: Send the researcher agent's credentials when reading the executor**

Replace the `peers` entry in `apps/researcher/src/lib/graph.ts` so the tool authenticates as the researcher:

```typescript
    peers: [
        {
            peerUrl: env.PEER_GCP_URL,
            targetNodeId: "knowledge:executor-context",
            credentials: { type: "token", value: "tok:researcher" },
        },
    ],
```

(Leave the `llm`, `systemPrompt`, and surrounding lines unchanged.)

- [ ] **Step 3: Gate the executor node + authenticate its callers**

Replace the contents of `apps/executor/src/lib/gcp.ts` with:

```typescript
import path from "node:path";
import { createRole } from "@graph-context-protocol/core";
import { createGcpNode } from "@graph-context-protocol/scenario";
import {
    createStaticTokenAuthProvider,
    type GraphContextServer,
    type Principal,
} from "@graph-context-protocol/server";

/** Demo credential the researcher presents when reading executor context. */
const RESEARCHER_TOKEN = "tok:researcher";

/** Principal the executor node recognizes for inbound researcher reads. */
const researcherPrincipal: Principal = {
    id: "principal:researcher",
    role: createRole(
        "role:researcher",
        "Researcher",
        "Researcher node, allowed to read executor context",
    ),
    capabilities: [],
    metadata: {},
};

let serverPromise: Promise<GraphContextServer> | undefined;

/** Returns the started executor GCP server, building it once per process. */
export function getGcpServer(): Promise<GraphContextServer> {
    if (serverPromise === undefined) {
        const authProvider = createStaticTokenAuthProvider(
            new Map([[RESEARCHER_TOKEN, researcherPrincipal]]),
        );
        serverPromise = createGcpNode(
            {
                serverId: "server:executor",
                nodeId: "node:executor",
                knowledgeId: "knowledge:executor-context",
                graphId: "graph:executor",
                role: {
                    id: "role:executor-context",
                    name: "Executor Context",
                    description: "Role-gated context for the executor node",
                },
                accessPolicy: {
                    readableByRoles: ["role:researcher"],
                    requiredCapabilities: [],
                    fallbackAllowed: false,
                    denialMode: "error",
                },
                knowledge: {
                    filePath: path.join(process.cwd(), "CONTEXT-1.md"),
                    tags: ["results", "log"],
                    contentType: "text/markdown",
                },
            },
            { authProvider },
        );
    }
    return serverPromise;
}
```

- [ ] **Step 4: Send the executor agent's credentials when reading the researcher**

Replace the `peers` entry in `apps/executor/src/lib/graph.ts`:

```typescript
    peers: [
        {
            peerUrl: env.PEER_GCP_URL,
            targetNodeId: "knowledge:researcher-context",
            credentials: { type: "token", value: "tok:executor" },
        },
    ],
```

(Leave the `llm`, `systemPrompt`, and surrounding lines unchanged.)

- [ ] **Step 5: Typecheck the apps**

Run: `pnpm nx typecheck researcher executor`
Expected: PASS (exit 0).

- [ ] **Step 6: Build the apps (demo parity)**

Run: `OPENROUTER_API_KEY=build-dummy pnpm nx build researcher executor`
Expected: Both Next builds succeed. (`OPENROUTER_API_KEY=build-dummy` is a build-time env var only — never written to a file or committed.)

- [ ] **Step 7: Format + commit**

```bash
pnpm biome check --write apps/researcher/src/lib/gcp.ts apps/researcher/src/lib/graph.ts apps/executor/src/lib/gcp.ts apps/executor/src/lib/graph.ts
git add apps/researcher/src/lib/gcp.ts apps/researcher/src/lib/graph.ts apps/executor/src/lib/gcp.ts apps/executor/src/lib/graph.ts
git commit -m "$(cat <<'EOF'
feat(apps): gate researcher/executor context with role policies + token-authenticated peers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Full verification gate**

Run each and confirm green:

```bash
pnpm nx run-many -t typecheck
pnpm nx run-many -t test
OPENROUTER_API_KEY=build-dummy pnpm nx build researcher executor
```

Expected:
- typecheck: all projects pass.
- test: all 5 library projects pass (core / server / adapters / langgraph / scenario), including the new M1 specs.
- build: researcher + executor succeed.

- [ ] **Step 9: Confirm no M1 file has Biome violations**

Run: `pnpm biome check packages/core/src/lib/provenance packages/core/src/lib/role packages/server/src/lib/audit packages/server/src/lib/auth/node-authorization.ts packages/server/src/lib/handlers/context-query-handler.ts packages/scenario/src/lib/gcp-node.ts packages/scenario/src/lib/role-gating.spec.ts packages/langgraph/src/lib/context-query-tool.ts apps/researcher/src/lib apps/executor/src/lib`
Expected: No errors on M1-touched files.

---

## Definition of Done (maps to spec §6 Acceptance Criteria)

- [ ] **An under-privileged principal's query returns `denied` AND an audit record with `decision:"deny"` exists.** — Proven by `role-gating.spec.ts` (anonymous + wrong-role) and `context-query-handler.spec.ts` (M1 deny tests).
- [ ] **An allowed query's response `provenance` names principal + target + time + decision.** — Proven by `context-query-handler.spec.ts` allow test (`payload.provenance?.decision/principalId`) and `provenance.spec.ts` round-trip.
- [ ] **A role with `parentRole` inherits the parent's capabilities/rules; tests prove it.** — Proven by `role.spec.ts` inheritance block.
- [ ] **Existing demo still works under explicit (non-allow-all) policy + authenticated principal.** — Proven by app typecheck + `nx build researcher executor`, and the scenario e2e test mirrors the exact allow path (token → role → ok) the apps configure.
- [ ] **Contract stays additive** — `ContextQueryResponseSchema.provenance` unchanged; `contractVersion` not bumped.

## Self-Review (completed during planning)

1. **Spec coverage:** §3 In-scope items all mapped — core ReadProvenance + typed provenance (T1), parentRole inheritance (T2), AuditSink + deps (T3), handler records allow/deny + structured provenance + matched fields (T4), scenarios role-gated + authenticated (T5–T7). §5 Work Breakdown 1–5 ↔ Tasks 1–7. §6 acceptance ↔ Definition of Done. §8 risks addressed (additive contract; staticToken provider used — capability gating remains expressible via `requiredCapabilities`, which T4 now evaluates against effective caps).
2. **Placeholder scan:** none — every code step shows full code; every run step shows command + expected result.
3. **Type consistency:** `ReadProvenance`/`AccessDecision`/`createReadProvenance` (T1) consumed verbatim in T3 (`AuditSink`) and T4 (handler). `NodeAuthorizationGrant.matchedRoles/matchedCapabilities` (T4) consumed by the handler's `createReadProvenance` options. `GcpNodeDependencies.{authProvider,auditSink}` (T5) consumed by T7 apps. `ContextQueryToolConfig.credentials` + `NodeAgentConfig.peers[].credentials` (T6) consumed by T7 `graph.ts`. `getEffectiveCapabilities` (T2) consumed by node-authorization (T4).
4. **Open question (spec §9):** audit persistence — resolved as in-memory only for M1/M5 (`createInMemoryAuditSink`); the `AuditSink` interface is pluggable so a persistent sink can be swapped later without touching the handler.
