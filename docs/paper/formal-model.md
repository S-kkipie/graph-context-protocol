# Formal Model: No-Leak Authorization Gate for the Graph Context Protocol

> **Status:** Complete — all three properties pass at CI defaults (1 000 runs each).
> This document is referenced by the GCP paper as the precise formal backing for
> the empirical canary-leak metric.

---

## 1. State

A **federation** is a set of graph nodes. A **knowledge node** `N` carries an
`AccessPolicyDescriptor`:

```
P = ( readableByRoles      : RoleId[]
    , requiredCapabilities : CapabilityId[]
    , fallbackAllowed      : boolean
    , denialMode           : "error" | "empty-result" | "fallback-if-allowed"
    )
```

A **principal** `K` is:

```
K = ( id           : string
    , role?        : RoleDefinition
    , capabilities : CapabilityId[]
    )
```

A **role** `R` has own `capabilities : Capability[]` and an optional `parentRole`.
Its *effective capabilities* are the union of own capabilities and those inherited
recursively along the parent chain, with **own-first precedence**: when two roles
in the chain carry the same capability id, the more-derived role's entry wins.
This is computed by `getEffectiveCapabilities()` on `RoleDefinition`
(source: `packages/core/src/lib/role/role-factories.ts`, `createRole`).

---

## 2. Authorization Predicate

The **admission predicate** `authorized(P, K)` is:

```
authorized(P, K) ≡
    roleOk(P, K)  ∧  capsOk(P, K)

roleOk(P, K) ≡
    P.readableByRoles = []
    ∨  ( K.role ≠ undefined  ∧  K.role.id ∈ P.readableByRoles )

capsOk(P, K) ≡
    P.requiredCapabilities = []
    ∨  P.requiredCapabilities ⊆ effective(K)

effective(K) ≡ K.capabilities ∪ K.role?.getEffectiveCapabilities().map(c → c.id)
```

This predicate is implemented verbatim as the `authorized` reference oracle in
`packages/server/src/lib/formal/arbitraries.ts` and is stated to mirror
`authorizeKnowledgeNodeAccess` under an allow-all auth provider (i.e., the
provider term drops out).

**Default-deny subtleties:**

- A *missing* policy (no `gcp.accessPolicy` key in node metadata) causes
  `parseAccessPolicyFromMetadata` to return a parse failure
  (`packages/core/src/lib/discovery/context-contract-types.ts`,
  `parseAccessPolicyFromMetadata`). `authorizeKnowledgeNodeAccess` interprets
  that failure as a denial — the gate is *closed* when policy is absent.
- An *empty* policy (`readableByRoles = []` and `requiredCapabilities = []`)
  satisfies both `roleOk` and `capsOk`, so the predicate returns `true` and
  the principal is admitted — provided the auth provider is also permissive.
  Empty arrays are permissive, not restrictive. This is an intentional
  design choice: a node that explicitly publishes no role or capability
  requirements is open to any authenticated principal.

---

## 3. Query Operation

A `context-query` request follows this pipeline in
`packages/server/src/lib/handlers/context-query-handler.ts`
(`createContextQueryHandler`):

1. **Validate payload** — parse the message against `ContextQueryRequestSchema`.
2. **Authenticate caller** — call `authProvider.authenticate(credentials)`; on
   failure return `denied` immediately (no adapter is invoked).
3. **Resolve target node** — look up `query.targetNodeId` in `context.graph`.
   Return `not-found` if absent.
4. **Authorize** — call `authorizeKnowledgeNodeAccess(principal, targetNode,
   authProvider, { action: "query-knowledge" })`
   (`packages/server/src/lib/auth/node-authorization.ts`).
   On failure return `denied`; **the knowledge-source adapter is never called**.
5. **Execute query** — call `executeTargetedContextQuery(query, principal,
   context.knowledgeSources, ...)` (`packages/server/src/lib/knowledge/context-query.ts`).
   The adapter result lands in `result.result` (the `raw` field of the adapter
   response maps to `knowledgeResult.raw`, passed as the `result` argument of
   `createContextQueryResult`).
6. **Return response** — wrap the `ContextQueryResult` in a
   `context-query-response` protocol message with status `"ok"`.

The critical invariant is in step 4: the gate is **before** any adapter call.
There is no code path through `createContextQueryHandler` that invokes an
adapter and then checks authorization.

---

## 4. No-Leak Theorem (Informal)

**Theorem (No Content Leak).**
For all `AccessPolicyDescriptor` values `P` and principals `K`:
if `¬authorized(P, K)` then no `context-query` directed at a node carrying
policy `P` ever returns the node's content to `K`.

*Proof sketch.* By inspection of the handler pipeline (§3), authorization is
checked (step 4) before any knowledge-source adapter is called (step 5).
On authorization failure the handler returns a `denied` result built by
`buildDeniedResponse`, which contains only the denial reason string and no
adapter output. The adapter is therefore never invoked, and the node's content
never enters the response serialization path.

*Falsifiability.* The theorem is empirically falsifiable: a test harness that
can inject an always-leaking adapter and observe the response serialization
could detect any code path that bypasses the gate. Property P1 (§5) constructs
exactly such a harness and confirms no leak occurs over 1 000 randomized runs at
CI defaults.

---

## 5. The Three Properties

### P1 — End-to-End No-Content-Leak

**Source:** `packages/server/src/lib/formal/no-leak.property.spec.ts`

For each randomly generated `(policy, principal)` pair, the property constructs
a real `KnowledgeNode` carrying that policy, wires it into a live
`createContextQueryHandler()` instance, and registers a stub knowledge-source
adapter that unconditionally returns the sentinel string `SECRET-CANARY-7f3a9c2e-DO-NOT-LEAK`
in its `raw` field. An allow-all `AuthProvider` is used so the provider term
drops out and the test isolates the node-policy gate. The property then asserts
two directions:

- **No-leak (safety):** when `¬authorized(policy, principal)`, the full JSON
  serialization of the handler response does not contain the sentinel string,
  and `payload.status === "denied"`.
- **Liveness:** when `authorized(policy, principal)`, the full JSON
  serialization *does* contain the sentinel string. This direction proves that
  the harness is capable of leaking — it is not vacuously passing because the
  sentinel is never reachable. Without the liveness check, a handler that
  always returned an empty result would pass the no-leak half trivially.

Both directions must hold simultaneously for the property to pass.

### P2 — Authorize Soundness

**Source:** `packages/server/src/lib/formal/authorize-soundness.property.spec.ts`

For each randomly generated `(policy, principal)` pair, the property calls the
real `authorizeKnowledgeNodeAccess` function against a node carrying that
policy, using an allow-all `AuthProvider`. It then asserts that
`result.success === authorized(policy, principal)` — that is, the gate grants
access **if and only if** the independent reference predicate admits the
principal. This establishes that the reference predicate in `arbitraries.ts` is
an accurate specification of the real gate, which is the key compositional link
that allows P1 to use `authorized()` as its oracle.

### P3 — Role-Inheritance Soundness

**Source:** `packages/core/src/lib/role/inheritance.property.spec.ts`

The property generates random chains of roles (depth 2–4) from a fixed
capability pool of five ids (`cap:1` through `cap:5`). For each chain it builds
a linked `RoleDefinition` tree via `createRole`
(`packages/core/src/lib/role/role-factories.ts`) and asserts two
sub-properties:

1. **Completeness:** the set of capability ids returned by the leaf role's
   `getEffectiveCapabilities()` equals the union of all own-capability id sets
   across every node in the chain — no capability from any ancestor is lost.
2. **Own-first precedence:** when a child role and a parent role both carry a
   capability with the same id, `getEffectiveCapabilities()` returns the
   child's entry (verified by checking the `name` field of the returned
   capability). This matches the `mergeCapabilitiesById` logic in
   `role-factories.ts`.

P3 grounds the role-capability computation used in both the reference predicate
(`authorized`) and the real gate (`authorizeKnowledgeNodeAccess`), ensuring
that the effective-capability union assumed by the theorem is implemented
correctly.

---

## 6. Model-to-Code Symbol Table

| Formal element | Symbol / function | File |
|---|---|---|
| `AccessPolicyDescriptor` (type) | `AccessPolicyDescriptor` | `packages/core/src/lib/discovery/context-contract-types.ts` |
| Policy parse / default-deny | `parseAccessPolicyFromMetadata` | `packages/core/src/lib/discovery/context-contract-types.ts` |
| `authorized(P, K)` oracle | `authorized` | `packages/server/src/lib/formal/arbitraries.ts` |
| Generators (`accessPolicyArb`, `principalArb`) | `accessPolicyArb`, `principalArb`, `RUN_OPTS` | `packages/server/src/lib/formal/arbitraries.ts` |
| Authorization gate | `authorizeKnowledgeNodeAccess` | `packages/server/src/lib/auth/node-authorization.ts` |
| Effective capabilities | `getEffectiveCapabilities` (method on `RoleDefinition`) | `packages/core/src/lib/role/role-factories.ts` (`createRole`) |
| Role factory | `createRole` | `packages/core/src/lib/role/role-factories.ts` |
| Query handler | `createContextQueryHandler` | `packages/server/src/lib/handlers/context-query-handler.ts` |
| Content retrieval (`raw` → `result.result`) | `executeTargetedContextQuery` | `packages/server/src/lib/knowledge/context-query.ts` |
| P1 — end-to-end no-leak | (property spec) | `packages/server/src/lib/formal/no-leak.property.spec.ts` |
| P2 — authorize soundness | (property spec) | `packages/server/src/lib/formal/authorize-soundness.property.spec.ts` |
| P3 — role-inheritance soundness | (property spec) | `packages/core/src/lib/role/inheritance.property.spec.ts` |
| HTTP smoke (real transport) | (smoke spec) | `packages/eval/src/lib/formal/no-leak-http.smoke.spec.ts` |

---

## 7. Results

### Run configuration

All properties share the same knob:

```
FC_NUM_RUNS=<n>   # integer; default 1000 when unset
FC_SEED=<s>       # integer; reproduce a failing shrunk counterexample
```

The defaults are defined in `RUN_OPTS` (`packages/server/src/lib/formal/arbitraries.ts`)
and mirrored locally in the P3 spec (`packages/core/src/lib/role/inheritance.property.spec.ts`).

### CI baseline (established in Tasks 2–4)

All three properties and the HTTP smoke pass at `FC_NUM_RUNS=1000` (CI default).
To reproduce any run: set `FC_SEED` to the seed printed by fast-check in the
failing output.

Example CI invocations:

```bash
# P1 (drives real handler — ~1 000 runs; keep lower than P2/P3 due to handler setup cost)
pnpm --filter @graph-context-protocol/server exec vitest run \
  src/lib/formal/no-leak.property.spec.ts

# P2 (pure gate check)
pnpm --filter @graph-context-protocol/server exec vitest run \
  src/lib/formal/authorize-soundness.property.spec.ts

# P3 (pure role math)
pnpm --filter @graph-context-protocol/core exec vitest run \
  src/lib/role/inheritance.property.spec.ts

# HTTP smoke
pnpm --filter @graph-context-protocol/eval exec vitest run \
  src/lib/formal/no-leak-http.smoke.spec.ts
```

### Heavier manual pass (optional)

For P2 and P3 (stateless, cheap):

```bash
FC_NUM_RUNS=20000 pnpm --filter @graph-context-protocol/core exec vitest run \
  src/lib/role/inheritance.property.spec.ts

FC_NUM_RUNS=20000 pnpm --filter @graph-context-protocol/server exec vitest run \
  src/lib/formal/authorize-soundness.property.spec.ts
```

These are cheap enough to run at 20 000 in a few seconds on any developer
machine. No heavier run was executed during document preparation; the results
section records only the CI-green baseline.

### Relationship to the empirical canary metric

The paper's canary metric measures the information-leakage rate empirically by
injecting a known sentinel into real knowledge nodes and scanning query
responses. That measurement is a *quantitative* signal: it tells you how often
leakage occurs across sampled scenarios.

The property suite here is a *proof-level* complement: it **proves** that the
no-leak bound holds over the entire randomized input space (subject to the
finite pools, §8). The canary metric can detect a regression; the property
suite explains *why* no leak should occur and gives a constructive account of
the invariant. Together they form a two-layer assurance: the property proves
the gate is sound; the canary confirms the gate is actually on the hot path in
production-like scenarios.

---

## 8. Limitations

1. **Finite input pools.** The property generators draw from fixed pools: 4
   roles (`role:a`, `role:b`, `role:c`, `role:child`; one parented) and 5
   capabilities (`cap:1`–`cap:5`). Policies and principals are subsets of these
   pools. Edge cases involving large role hierarchies, duplicate capability ids
   across independent subtrees, or unusual `denialMode` × `fallbackAllowed`
   combinations are not systematically covered.

2. **Allow-all auth provider.** The property harness uses an allow-all
   `AuthProvider` (the `authorize` call always returns `{ allowed: true }`) to
   isolate the node-policy gate. Provider-side denial logic — e.g., ABAC
   policies enforced by the provider — is out of scope and not modeled here.

3. **Not a mechanized proof.** This is a property-based randomized test, not a
   mechanically checked formal proof (Coq, Lean, TLA+, etc.). The theorem in
   §4 is informal and relies on code inspection plus randomized testing. A
   future mechanized proof would eliminate residual uncertainty about
   unexercised code paths.

4. **Single-hop, single-node scope.** The model covers one knowledge node per
   query. Federated multi-hop scenarios — where a context query fans out across
   several nodes in a graph — are not modeled and may introduce additional
   trust-boundary considerations.
