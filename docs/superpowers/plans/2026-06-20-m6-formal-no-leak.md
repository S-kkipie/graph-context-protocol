# M6 — Formal Model + Executable No-Leak Property Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove, over the *real* shipped authorization path, that a principal never reads context beyond policy — turning the paper's leakage claim from measured (canary lower-bound) to proven (randomized policies + principals).

**Architecture:** Three `fast-check` property tests exercise shipped code (no re-implementation of the gate): P1 drives the real `createContextQueryHandler` against a stub adapter that *always* returns a secret (so the gate is the sole protection and the property can't pass vacuously); P2 pins `authorizeKnowledgeNodeAccess` against an independent reference predicate; P3 pins role-inheritance. A single HTTP smoke (in `packages/eval`, where the wiring already exists) covers the transport path once. A model doc + a paper subsection record the result.

**Tech Stack:** TypeScript 5.9 (strict, ESM), Vitest 4, fast-check (new), pnpm 9 workspace, Nx 22, zod 4. LaTeX (article-class IEEE/SAI emulation) for the paper.

## Global Constraints

- **No change to the auth gate's behavior** unless a property surfaces a real counterexample; if so, fixing the gate is in-scope and must be documented in `formal-model.md`.
- **The reference predicate must match `authorizeKnowledgeNodeAccess` exactly:** role check skipped when `readableByRoles` is empty; capability check against `principal.capabilities ∪ role.getEffectiveCapabilities()`; the static/allow-all provider always allows, so the provider term drops out.
- **P1 must assert both directions:** unauthorized ⇒ `SECRET ∉ JSON.stringify(response)` AND status `denied`; authorized ⇒ `SECRET ∈ JSON.stringify(response)` (liveness — proves the harness can leak).
- **Determinism/repro:** every property reads `FC_NUM_RUNS` (default `1000`) and optional `FC_SEED`; pass both to `fc.assert`.
- **`fast-check` is a workspace-root devDependency** (same pattern as `vitest`/`typescript`, which are root-only and hoisted). Do not add it to individual package.json files.
- **4-space indentation, Biome 2 formatting.** Run `pnpm biome check --write <files>` before each commit if formatting drifts.
- **Security:** no API keys, no `.env*`, no build artifacts (`dist/`, `*.tsbuildinfo`, `next-env.d.ts`), no `.claude/` committed. The `SECRET` sentinel is a test fixture, not a real secret.
- **Nx landmine:** `nx <target> projA projB` is broken (TS5083). Run a single project's tests with `pnpm --filter <pkg> exec vitest run <path>`; run everything with `pnpm nx run-many -t test`.

---

### Task 1: fast-check dependency + arbitraries + reference predicate

**Files:**
- Modify: `package.json` (root — add `fast-check` to `devDependencies`)
- Create: `packages/server/src/lib/formal/arbitraries.ts`
- Test: `packages/server/src/lib/formal/arbitraries.spec.ts`

**Interfaces:**
- Consumes (from `@graph-context-protocol/core`): `createRole`, `createCapability`, `createAccessPolicyDescriptor`, types `AccessPolicyDescriptor`, `RoleDefinition`, `DenialMode`, `RoleId`, `CapabilityId`. From `../auth/types`: type `Principal`.
- Produces (used by Tasks 2 and 4): `ROLE_IDS: readonly string[]`, `CAP_IDS: readonly string[]`, `roleA/roleB/roleC/roleChild: RoleDefinition`, `accessPolicyArb: fc.Arbitrary<AccessPolicyDescriptor>`, `principalArb: fc.Arbitrary<Principal>`, `authorized(policy, principal): boolean`, `RUN_OPTS: { numRuns: number; seed?: number }`.

- [ ] **Step 1: Add the dependency**

Run: `pnpm add -Dw fast-check`
Expected: `package.json` gains `"fast-check"` under `devDependencies`; lockfile updates; install succeeds.

- [ ] **Step 2: Write the arbitraries + reference predicate module**

Create `packages/server/src/lib/formal/arbitraries.ts`:

```typescript
/**
 * fast-check generators + the reference admission predicate for the no-leak
 * properties. Small finite pools keep both authorized and unauthorized draws
 * frequent. The predicate mirrors `authorizeKnowledgeNodeAccess` exactly under
 * an allow-all auth provider (so the provider term drops out).
 *
 * @module formal/arbitraries
 */

import {
    type AccessPolicyDescriptor,
    type CapabilityId,
    createAccessPolicyDescriptor,
    createCapability,
    createRole,
    type DenialMode,
    type RoleDefinition,
    type RoleId,
} from "@graph-context-protocol/core";
import fc from "fast-check";
import type { Principal } from "../auth/types";

/** Fixed capability pool. */
export const CAP_IDS: readonly CapabilityId[] = [
    "cap:1",
    "cap:2",
    "cap:3",
    "cap:4",
    "cap:5",
];

const cap = (id: CapabilityId, name: string) => createCapability(id, name, "");

/** Fixed role pool. role:child inherits from role:a (effective {cap:1, cap:3}). */
export const roleA: RoleDefinition = createRole("role:a", "A", "", [
    cap("cap:1", "a-cap1"),
]);
export const roleB: RoleDefinition = createRole("role:b", "B", "", [
    cap("cap:2", "b-cap2"),
]);
export const roleC: RoleDefinition = createRole("role:c", "C", "", []);
export const roleChild: RoleDefinition = createRole(
    "role:child",
    "Child",
    "",
    [cap("cap:3", "child-cap3")],
    [],
    roleA,
);

/** Role-id pool used in access policies. */
export const ROLE_IDS: readonly RoleId[] = [
    "role:a",
    "role:b",
    "role:c",
    "role:child",
];

/** Random access policy over the fixed pools. */
export const accessPolicyArb: fc.Arbitrary<AccessPolicyDescriptor> = fc
    .record({
        readableByRoles: fc.subarray([...ROLE_IDS]),
        requiredCapabilities: fc.subarray([...CAP_IDS]),
        fallbackAllowed: fc.boolean(),
        denialMode: fc.constantFrom<DenialMode>(
            "error",
            "empty-result",
            "fallback-if-allowed",
        ),
    })
    .map((r) =>
        createAccessPolicyDescriptor(
            r.readableByRoles,
            r.requiredCapabilities,
            r.fallbackAllowed,
            r.denialMode,
        ),
    );

/** Random principal: a role from the pool (or none) + random direct caps. */
export const principalArb: fc.Arbitrary<Principal> = fc
    .record({
        role: fc.option(fc.constantFrom(roleA, roleB, roleC, roleChild), {
            nil: undefined,
        }),
        capabilities: fc.subarray([...CAP_IDS]),
    })
    .map(
        ({ role, capabilities }) =>
            ({
                id: "principal:test",
                role,
                capabilities,
                metadata: {},
            }) as Principal,
    );

/**
 * Independent admission oracle. Mirrors authorizeKnowledgeNodeAccess under an
 * allow-all provider: role ok when readableByRoles is empty or contains the
 * principal's role; all requiredCapabilities present directly or via the role
 * chain.
 */
export function authorized(
    policy: AccessPolicyDescriptor,
    principal: Principal,
): boolean {
    const roleOk =
        policy.readableByRoles.length === 0 ||
        (principal.role !== undefined &&
            policy.readableByRoles.includes(principal.role.id));
    if (!roleOk) return false;
    if (policy.requiredCapabilities.length === 0) return true;
    const effective = new Set<string>([
        ...principal.capabilities,
        ...(principal.role
            ? principal.role.getEffectiveCapabilities().map((c) => c.id)
            : []),
    ]);
    return policy.requiredCapabilities.every((c) => effective.has(c));
}

/** fast-check run options: bounded in CI, heavier via FC_NUM_RUNS; FC_SEED to repro. */
export const RUN_OPTS: { numRuns: number; seed?: number } = {
    numRuns: Number(process.env.FC_NUM_RUNS ?? "1000"),
    ...(process.env.FC_SEED ? { seed: Number(process.env.FC_SEED) } : {}),
};
```

- [ ] **Step 3: Write the coverage test (non-vacuity)**

Create `packages/server/src/lib/formal/arbitraries.spec.ts`:

```typescript
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    accessPolicyArb,
    authorized,
    principalArb,
    roleChild,
} from "./arbitraries";

describe("formal arbitraries", () => {
    it("produces both authorized and unauthorized draws", () => {
        const samples = fc.sample(
            fc.record({ policy: accessPolicyArb, principal: principalArb }),
            300,
        );
        const verdicts = samples.map((s) => authorized(s.policy, s.principal));
        expect(verdicts.some((v) => v === true)).toBe(true);
        expect(verdicts.some((v) => v === false)).toBe(true);
    });

    it("reference predicate honors inherited capabilities", () => {
        // role:child inherits cap:1 from role:a and owns cap:3.
        const principal = {
            id: "principal:test",
            role: roleChild,
            capabilities: [] as string[],
            metadata: {},
        };
        const eff = new Set(
            roleChild.getEffectiveCapabilities().map((c) => c.id),
        );
        expect(eff.has("cap:1")).toBe(true);
        expect(eff.has("cap:3")).toBe(true);
        expect(authorized({ ...stubPolicy(["cap:1"]) }, principal)).toBe(true);
        expect(authorized({ ...stubPolicy(["cap:2"]) }, principal)).toBe(false);
    });
});

function stubPolicy(requiredCapabilities: string[]) {
    return {
        readableByRoles: [] as string[],
        requiredCapabilities,
        fallbackAllowed: false,
        denialMode: "error" as const,
        metadata: {},
    };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @graph-context-protocol/server exec vitest run src/lib/formal/arbitraries.spec.ts`
Expected: PASS (2 tests). If `fast-check` fails to resolve, run `pnpm install` and retry.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml packages/server/src/lib/formal/arbitraries.ts packages/server/src/lib/formal/arbitraries.spec.ts
git commit -m "test(m6): fast-check arbitraries + reference admission predicate"
```

---

### Task 2: P2 — authorize-soundness property

**Files:**
- Create: `packages/server/src/lib/formal/authorize-soundness.property.spec.ts`

**Interfaces:**
- Consumes: `accessPolicyArb`, `principalArb`, `authorized`, `RUN_OPTS` (Task 1); `authorizeKnowledgeNodeAccess` from `../auth/node-authorization`; `createKnowledgeNode`, `createMetadataWithAccessPolicy`, `createRole` from core; an allow-all `AuthProvider`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the failing property**

Create `packages/server/src/lib/formal/authorize-soundness.property.spec.ts`:

```typescript
/**
 * P2 — authorize soundness. authorizeKnowledgeNodeAccess grants access iff the
 * independent reference predicate says the principal satisfies the policy, over
 * a randomized policy/principal space, against the REAL gate.
 */

import {
    type AccessPolicyDescriptor,
    createKnowledgeNode,
    createMetadataWithAccessPolicy,
    createRole,
    type GraphNode,
} from "@graph-context-protocol/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { authorizeKnowledgeNodeAccess } from "../auth/node-authorization";
import type { AuthProvider } from "../auth/types";
import { accessPolicyArb, authorized, principalArb, RUN_OPTS } from "./arbitraries";

const ownerRole = createRole("role:owner", "Owner", "Owner");

function nodeWithPolicy(policy: AccessPolicyDescriptor): GraphNode {
    return createKnowledgeNode(
        "knowledge:p2",
        ownerRole,
        createMetadataWithAccessPolicy(policy, {
            tags: ["secret"],
            contentType: "text/plain",
        }),
    );
}

const allowAll: AuthProvider = {
    async authenticate() {
        throw new Error("unused");
    },
    authorize() {
        return { success: true, data: { allowed: true } };
    },
};

describe("P2 — authorize soundness", () => {
    it("grants iff the reference predicate admits the principal", () => {
        fc.assert(
            fc.property(accessPolicyArb, principalArb, (policy, principal) => {
                const node = nodeWithPolicy(policy);
                const result = authorizeKnowledgeNodeAccess(
                    principal,
                    node,
                    allowAll,
                );
                expect(result.success).toBe(authorized(policy, principal));
            }),
            RUN_OPTS,
        );
    });
});
```

- [ ] **Step 2: Run to verify it passes (the gate already matches the predicate)**

Run: `pnpm --filter @graph-context-protocol/server exec vitest run src/lib/formal/authorize-soundness.property.spec.ts`
Expected: PASS. If it FAILS, fast-check prints a minimal counterexample + seed — this is a real discrepancy between the gate and the predicate. Investigate: if the gate is wrong, fix `node-authorization.ts` and document in `formal-model.md` (Task 5); if the predicate is wrong, fix `authorized` in `arbitraries.ts`. Re-run with `FC_SEED=<printed>` to reproduce.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/lib/formal/authorize-soundness.property.spec.ts
git commit -m "test(m6): P2 authorize-soundness property over the real gate"
```

---

### Task 3: P3 — role-inheritance soundness property

**Files:**
- Create: `packages/core/src/lib/role/inheritance.property.spec.ts`

**Interfaces:**
- Consumes: `createRole`, `createCapability` from `@graph-context-protocol/core` (import via relative `../../index` or the factory modules); `fast-check`.
- Produces: nothing consumed downstream. Self-contained chain generator (P3 lives in core, which cannot import the server `arbitraries.ts`).

- [ ] **Step 1: Write the failing property**

Create `packages/core/src/lib/role/inheritance.property.spec.ts`:

```typescript
/**
 * P3 — role-inheritance soundness. A role's effective capabilities equal the
 * union of own + inherited own-capabilities along the parent chain (no phantom
 * capability, none lost); own-first precedence on duplicate ids.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createCapability } from "./role-factories";
import { createRole } from "./role-factories";
import type { RoleDefinition } from "./role-types";

const RUN_OPTS: { numRuns: number; seed?: number } = {
    numRuns: Number(process.env.FC_NUM_RUNS ?? "1000"),
    ...(process.env.FC_SEED ? { seed: Number(process.env.FC_SEED) } : {}),
};

const CAP_POOL = ["cap:1", "cap:2", "cap:3", "cap:4", "cap:5"];

/** Generates a chain (root → ... → leaf) of own-capability id sets, depth 1..4. */
const chainArb: fc.Arbitrary<string[][]> = fc.array(
    fc.subarray(CAP_POOL),
    { minLength: 1, maxLength: 4 },
);

/** Builds a role chain from root to leaf; returns the leaf role + the union of ids. */
function buildChain(levels: string[][]): {
    leaf: RoleDefinition;
    unionIds: Set<string>;
} {
    let parent: RoleDefinition | undefined;
    const unionIds = new Set<string>();
    levels.forEach((ownIds, depth) => {
        for (const id of ownIds) unionIds.add(id);
        const caps = ownIds.map((id) =>
            createCapability(id, `d${depth}-${id}`, ""),
        );
        parent = createRole(
            `role:d${depth}`,
            `D${depth}`,
            "",
            caps,
            [],
            parent,
        );
    });
    // parent is defined because levels has at least one entry.
    return { leaf: parent as RoleDefinition, unionIds };
}

describe("P3 — role-inheritance soundness", () => {
    it("effective caps equal the union of own caps along the chain", () => {
        fc.assert(
            fc.property(chainArb, (levels) => {
                const { leaf, unionIds } = buildChain(levels);
                const effIds = new Set(
                    leaf.getEffectiveCapabilities().map((c) => c.id),
                );
                expect(effIds).toEqual(unionIds);
            }),
            RUN_OPTS,
        );
    });

    it("own-first precedence: most-derived role wins on duplicate ids", () => {
        // Parent and child both own cap:1 with different names; child wins.
        const parent = createRole("role:parent", "P", "", [
            createCapability("cap:1", "parent-cap1", ""),
        ]);
        const child = createRole(
            "role:child",
            "C",
            "",
            [createCapability("cap:1", "child-cap1", "")],
            [],
            parent,
        );
        const eff = child.getEffectiveCapabilities();
        const cap1 = eff.find((c) => c.id === "cap:1");
        expect(cap1?.name).toBe("child-cap1");
    });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `pnpm --filter @graph-context-protocol/core exec vitest run src/lib/role/inheritance.property.spec.ts`
Expected: PASS. (If `createCapability` is not exported from `./role-factories`, find its module with `grep -rn "export function createCapability" packages/core/src` and fix the import path.) On failure, fast-check prints counterexample + seed; reproduce with `FC_SEED=<printed>`.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/lib/role/inheritance.property.spec.ts
git commit -m "test(m6): P3 role-inheritance soundness property"
```

---

### Task 4: P1 — end-to-end no-content-leak property + HTTP smoke

**Files:**
- Create: `packages/server/src/lib/formal/no-leak.property.spec.ts`
- Create: `packages/eval/src/lib/formal/no-leak-http.smoke.spec.ts`

**Interfaces:**
- Consumes (server spec): `accessPolicyArb`, `principalArb`, `authorized`, `RUN_OPTS` (Task 1); `createContextQueryHandler` from `../handlers/context-query-handler`; `HandlerContext` from `../handlers/types`; `createKnowledgeSourceRegistry` from `../knowledge/implementation`; core factories `createKnowledgeNode`, `createMetadataWithAccessPolicy`, `createRole`, `createGraph`, `createContextQuery`, `createRequesterDescriptor`, `createMessageHeader`, `createProtocolMessage`, `succeed`; types `Credentials`, `Principal` from `../auth/types`.
- Consumes (eval smoke): `createGcpNode` from `@graph-context-protocol/scenario`; `createFetchHandler`, `createStaticTokenAuthProvider`, `createInMemoryAuditSink`, `queryRemoteContext`, type `Principal` from `@graph-context-protocol/server`; `createContextQuery`, `createRequesterDescriptor`, `createRole` from core.

- [ ] **Step 1: Write the P1 property (both directions)**

Create `packages/server/src/lib/formal/no-leak.property.spec.ts`:

```typescript
/**
 * P1 — end-to-end no-content-leak (headline). For any random policy + principal,
 * drive the REAL context-query handler against a stub adapter that ALWAYS
 * returns SECRET. Unauthorized ⇒ SECRET never appears and status is denied;
 * authorized ⇒ SECRET appears (liveness — proves the harness can leak, so the
 * no-leak half is not vacuous).
 */

import {
    type AccessPolicyDescriptor,
    type ContextQuery,
    createContextQuery,
    createGraph,
    createKnowledgeNode,
    createMessageHeader,
    createMetadataWithAccessPolicy,
    createProtocolMessage,
    createRequesterDescriptor,
    createRole,
    type ProtocolMessage,
    succeed,
} from "@graph-context-protocol/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AuthProvider, Credentials, Principal } from "../auth/types";
import { createContextQueryHandler } from "../handlers/context-query-handler";
import type { HandlerContext } from "../handlers/types";
import { createKnowledgeSourceRegistry } from "../knowledge/implementation";
import { accessPolicyArb, authorized, principalArb, RUN_OPTS } from "./arbitraries";

const SECRET = "SECRET-CANARY-7f3a9c2e-DO-NOT-LEAK";
const NODE_ID = "knowledge:p1";
const ownerRole = createRole("role:owner", "Owner", "Owner");
const creds: Credentials = { type: "token", value: "t", metadata: {} };
const handler = createContextQueryHandler();

function nodeWithPolicy(policy: AccessPolicyDescriptor) {
    return createKnowledgeNode(
        NODE_ID,
        ownerRole,
        createMetadataWithAccessPolicy(policy, {
            tags: ["secret"],
            contentType: "text/plain",
        }),
    );
}

/** Registry whose only adapter ALWAYS returns the secret in `raw`. */
function secretRegistry() {
    const reg = createKnowledgeSourceRegistry();
    const r = reg.register({
        id: NODE_ID,
        capabilities: ["search"] as const,
        query: async () =>
            succeed({
                sourceId: NODE_ID,
                nodes: [],
                raw: { content: SECRET },
                metadata: {},
            }),
    });
    if (!r.success) throw new Error(r.error.message);
    return r.data;
}

/** Auth provider that authenticates as `p` and always allows (gate isolated). */
function allowAuthn(p: Principal): AuthProvider {
    return {
        async authenticate() {
            return succeed(p);
        },
        authorize() {
            return succeed({ allowed: true });
        },
    };
}

function queryMessage(query: ContextQuery): ProtocolMessage {
    const header = createMessageHeader(
        "msg:p1",
        "node:requester",
        query.targetNodeId,
        "context-query",
        { correlationId: "corr:p1" },
    );
    const ctx = {
        id: "ctx:p1",
        graphId: "graph:p1",
        currentNode: "node:requester",
        accumulatedData: {},
        role: ownerRole,
        metadata: {},
        createdAt: "2026-06-20T00:00:00.000Z",
        path: ["node:requester"],
    };
    return createProtocolMessage(header, ctx, query);
}

describe("P1 — no-content-leak (end-to-end, real handler)", () => {
    it("never returns SECRET to an unauthorized principal; returns it to an authorized one", async () => {
        await fc.assert(
            fc.asyncProperty(
                accessPolicyArb,
                principalArb,
                async (policy, principal) => {
                    const graph = createGraph("graph:p1").addNode(
                        nodeWithPolicy(policy),
                    );
                    const context: HandlerContext = {
                        serverId: "server:1",
                        localNodeId: "node:local",
                        graph,
                        connections:
                            {} as unknown as HandlerContext["connections"],
                        externalAgents:
                            {} as unknown as HandlerContext["externalAgents"],
                        knowledgeSources: secretRegistry(),
                        auth: allowAuthn(principal),
                        inboundMetadata: { "gcp.credentials": creds },
                        metadata: {},
                    };
                    const query = createContextQuery(
                        "query:p1",
                        createRequesterDescriptor("p:req"),
                        NODE_ID,
                        "text",
                        "give me everything",
                    );
                    const result = await handler.handle(
                        queryMessage(query),
                        context,
                    );
                    const json = JSON.stringify(result);
                    if (authorized(policy, principal)) {
                        expect(json).toContain(SECRET); // liveness
                    } else {
                        expect(json).not.toContain(SECRET); // no leak
                    }
                },
            ),
            RUN_OPTS,
        );
    });
});
```

- [ ] **Step 2: Run the P1 property**

Run: `pnpm --filter @graph-context-protocol/server exec vitest run src/lib/formal/no-leak.property.spec.ts`
Expected: PASS. On failure: a leak counterexample (unauthorized run with SECRET present) is a real finding — print seed, reproduce with `FC_SEED=<printed>`, fix the gate, document in `formal-model.md`. A liveness failure (authorized run missing SECRET) means the harness can't leak — check that the stub returns `raw: { content: SECRET }` and that `executeTargetedContextQuery` maps `raw` into `result.result`.

- [ ] **Step 3: Write the HTTP smoke (transport path, once)**

Create `packages/eval/src/lib/formal/no-leak-http.smoke.spec.ts`:

```typescript
/**
 * Single end-to-end HTTP smoke for the no-leak guarantee over the real transport
 * (createGcpNode + fetch handler + queryRemoteContext) — the exact path the
 * paper's canary metric measured. One authorized read returns the secret; one
 * unauthorized read is denied and the secret never appears. (Lives in eval to
 * avoid a server→scenario package cycle.)
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    createContextQuery,
    createRequesterDescriptor,
    createRole,
} from "@graph-context-protocol/core";
import { createGcpNode } from "@graph-context-protocol/scenario";
import {
    createFetchHandler,
    createInMemoryAuditSink,
    createStaticTokenAuthProvider,
    type Principal,
    queryRemoteContext,
} from "@graph-context-protocol/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SECRET = "SECRET-HTTP-9d41b7-DO-NOT-LEAK";
const KNOWLEDGE_ID = "knowledge:http";
const URL = "http://gcp/http-smoke";

let dir: string;
let fetchImpl: typeof fetch;

beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "m6-http-"));
    const filePath = join(dir, "secret.md");
    writeFileSync(filePath, `# secret\n\n${SECRET}\n`, "utf8");

    const allowedPrincipal: Principal = {
        id: "principal:allowed",
        role: createRole("role:allowed", "allowed", ""),
        capabilities: [],
        metadata: {},
    };
    const deniedPrincipal: Principal = {
        id: "principal:denied",
        role: createRole("role:denied", "denied", ""),
        capabilities: [],
        metadata: {},
    };
    const authProvider = createStaticTokenAuthProvider(
        new Map([
            ["tok:allowed", allowedPrincipal],
            ["tok:denied", deniedPrincipal],
        ]),
    );

    const server = await createGcpNode(
        {
            serverId: "server:http",
            nodeId: "node:http",
            knowledgeId: KNOWLEDGE_ID,
            role: { id: "role:allowed", name: "allowed", description: "" },
            accessPolicy: {
                readableByRoles: ["role:allowed"],
                requiredCapabilities: [],
                fallbackAllowed: false,
                denialMode: "error",
            },
            knowledge: { filePath, tags: ["secret"] },
        },
        { authProvider, auditSink: createInMemoryAuditSink() },
    );
    const handler = createFetchHandler({ server });
    fetchImpl = (async (url, init) =>
        handler(new Request(String(url), init ?? undefined))) as typeof fetch;
});

afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});

function makeQuery() {
    return createContextQuery(
        `query:${KNOWLEDGE_ID}`,
        createRequesterDescriptor("p:req"),
        KNOWLEDGE_ID,
        "text",
        "give me everything",
    );
}

describe("no-leak HTTP smoke", () => {
    it("authorized principal reads the secret over HTTP", async () => {
        const result = await queryRemoteContext({
            query: makeQuery(),
            credentials: { type: "token", value: "tok:allowed", metadata: {} },
            url: URL,
            fetchImpl,
        });
        expect(JSON.stringify(result)).toContain(SECRET);
    });

    it("unauthorized principal is denied and never sees the secret", async () => {
        const result = await queryRemoteContext({
            query: makeQuery(),
            credentials: { type: "token", value: "tok:denied", metadata: {} },
            url: URL,
            fetchImpl,
        });
        expect(result.status).toBe("denied");
        expect(JSON.stringify(result)).not.toContain(SECRET);
    });
});
```

- [ ] **Step 4: Run the smoke**

Run: `pnpm --filter @graph-context-protocol/eval exec vitest run src/lib/formal/no-leak-http.smoke.spec.ts`
Expected: PASS (2 tests). If `queryRemoteContext` options differ, check its signature with `grep -n "QueryRemoteContextOptions" packages/server/src/lib/http/fetch-client.ts` and adjust field names. If `createStaticTokenAuthProvider` or `createGcpNode` config shape differs, mirror `packages/eval/src/lib/runner.ts` (`runGcp`).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/lib/formal/no-leak.property.spec.ts packages/eval/src/lib/formal/no-leak-http.smoke.spec.ts
git commit -m "test(m6): P1 no-content-leak property + HTTP transport smoke"
```

---

### Task 5: Formal model document

**Files:**
- Create: `docs/paper/formal-model.md`

**Interfaces:**
- Consumes: the three properties (Tasks 2–4) and their code symbols. No code dependency.

- [ ] **Step 1: Write the model doc**

Create `docs/paper/formal-model.md` covering, with exact prose (no placeholders):

1. **State.** A federation is a set of nodes; a knowledge node `N` carries an
   `AccessPolicyDescriptor` `P = (readableByRoles, requiredCapabilities,
   fallbackAllowed, denialMode)`. A principal `K = (id, role?, capabilities)`.
   A role has own capabilities and an optional `parentRole`; its *effective*
   capabilities are the union of own + inherited (own-first), via
   `getEffectiveCapabilities()`.
2. **Authorization predicate.** State `authorized(P, K)` exactly as in
   `arbitraries.ts` and note it mirrors `authorizeKnowledgeNodeAccess` under an
   allow-all provider; call out the default-deny subtlety: a *missing* policy
   denies (parse failure), an *empty* policy (`readableByRoles=[]` and
   `requiredCapabilities=[]`) admits when the provider is permissive.
3. **Query operation.** `context-query` → authenticate → resolve node →
   `authorizeKnowledgeNodeAccess`; on deny return `denied` (adapter never
   called); on allow run `executeTargetedContextQuery` and return content in
   `result.result`.
4. **No-leak theorem (informal).** For all `P, K`: if `¬authorized(P, K)` then no
   `context-query` for `N` returns `N`'s content. Empirically falsifiable and
   here proven over the randomized space by P1.
5. **The three properties** (P1/P2/P3): one paragraph each — what is generated,
   what is asserted, both directions for P1.
6. **Model ↔ code symbol table:** map each formal element to its file+symbol
   (`AccessPolicyDescriptor` → `context-contract-types.ts`;
   `authorizeKnowledgeNodeAccess` → `node-authorization.ts`;
   `getEffectiveCapabilities` → `role-factories.ts`; handler →
   `context-query-handler.ts`; properties → the three spec files; smoke → the
   eval spec).
7. **Results.** The run configuration (`FC_NUM_RUNS` CI default 1000; a heavier
   manual run, e.g. `FC_NUM_RUNS=50000`), pass/fail, and the reproduction knob
   (`FC_SEED`). State the relationship to the empirical canary metric: the
   property *proves* the bound the canary scan *measured*.
8. **Limitations.** Finite pools (4 roles incl. one parented, 5 caps); allow-all
   provider isolates the node-policy gate (provider-side denial is out of scope);
   not a mechanized proof (future work).

- [ ] **Step 2: Verify it references real symbols**

Run: `grep -n "node-authorization\|getEffectiveCapabilities\|context-query-handler\|authorizeKnowledgeNodeAccess" docs/paper/formal-model.md`
Expected: matches present (the symbol table is filled in, not placeheld).

- [ ] **Step 3: Commit**

```bash
git add docs/paper/formal-model.md
git commit -m "docs(m6): formal model + no-leak theorem + model-to-code map"
```

---

### Task 6: Paper subsection (EN + ES) + rebuild PDFs

**Files:**
- Modify: `docs/paper/paper.tex` (add a subsection in the methods/results area + one sentence in the leakage discussion)
- Modify: `docs/paper/paper-es.tex` (mirror, in Spanish, decimal commas)

**Interfaces:**
- Consumes: results from Task 5. No code dependency.

- [ ] **Step 1: Locate the leakage section in each paper**

Run: `grep -n "leak\|canary\|Leak\|fuga\|Fuga" docs/paper/paper.tex docs/paper/paper-es.tex`
Expected: line numbers of the leakage discussion to anchor the new subsection.

- [ ] **Step 2: Add the EN subsection**

Add to `docs/paper/paper.tex`, near the leakage results, a subsection titled
"Formal model and executable no-leak property" that states: (a) the access model
and `authorized(P,K)` predicate; (b) the no-leak theorem; (c) the three
fast-check properties exercising the *real* shipped path (P1 end-to-end, P2
gate-soundness, P3 inheritance), including P1's liveness half; (d) the run
configuration and that all properties pass; (e) the reframing — the canary metric
*measures* leakage, the property *proves* its absence for the GCP gate over the
randomized policy/principal space. Add one sentence in the existing leakage
discussion pointing to the new subsection ("measured … and proven (§X)").

- [ ] **Step 3: Mirror the ES subsection**

Add the equivalent subsection to `docs/paper/paper-es.tex` in Spanish (decimal
commas; `\renewcommand`s already in that file), titled "Modelo formal y propiedad
ejecutable de no fuga".

- [ ] **Step 4: Rebuild both PDFs**

Run:
```bash
cd docs/paper && pdflatex -interaction=nonstopmode paper.tex && bibtex paper && pdflatex -interaction=nonstopmode paper.tex && pdflatex -interaction=nonstopmode paper.tex
pdflatex -interaction=nonstopmode paper-es.tex && bibtex paper-es && pdflatex -interaction=nonstopmode paper-es.tex && pdflatex -interaction=nonstopmode paper-es.tex
```
Expected: `paper.pdf` and `paper-es.pdf` rebuild with no fatal errors (warnings about overfull boxes are acceptable). If `pdflatex` is unavailable, skip the rebuild and note it in the commit; commit only the `.tex` edits (LaTeX aux files are gitignored under `docs/paper/.gitignore`).

- [ ] **Step 5: Commit**

```bash
git add docs/paper/paper.tex docs/paper/paper-es.tex docs/paper/paper.pdf docs/paper/paper-es.pdf
git commit -m "docs(paper): formal no-leak subsection (EN+ES) — leakage measured + proven"
```

---

## Final Verification

- [ ] Run the full suite: `pnpm nx run-many -t test`
  Expected: all projects green; the new property specs pass at the CI run count; gated real-LLM specs still skip.
- [ ] Heavy property run (manual, optional): `FC_NUM_RUNS=50000 pnpm --filter @graph-context-protocol/server exec vitest run src/lib/formal/` — record outcome in `formal-model.md` if run.
- [ ] Confirm no secrets / build artifacts staged: `git status` clean except intended files.

## Self-Review (plan author)

- **Spec coverage:** P1 (Task 4) ✓, P2 (Task 2) ✓, P3 (Task 3) ✓, reference predicate + generators + non-vacuity (Task 1) ✓, default-deny subtlety encoded in predicate (Task 1) + documented (Task 5) ✓, model doc (Task 5) ✓, paper EN+ES (Task 6) ✓, `fast-check` devDep (Task 1) ✓, FC_NUM_RUNS/FC_SEED (Task 1, every property) ✓, CI-vs-nightly (Final Verification + Task 5) ✓.
- **Deviation from spec (flag at handoff):** the single HTTP smoke moved from `packages/server` to `packages/eval` to avoid a server→scenario package cycle; behavior identical, transport path still covered once.
- **Type consistency:** `authorized(policy, principal)`, `accessPolicyArb`, `principalArb`, `RUN_OPTS`, `roleChild` names are defined in Task 1 and used verbatim in Tasks 2 and 4. `SECRET`/`NODE_ID` are file-local per spec.
- **Placeholder scan:** none — all steps carry runnable code or exact prose requirements.
