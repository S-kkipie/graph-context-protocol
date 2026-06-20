# M6 — Formal Model + Executable No-Leak Property — Implementation Design

> Realize milestone M6: a precise formal model of role-gated, read-first context
> federation plus an **executable** no-leak property over the *real* shipped
> authorization path. Turns the paper's leakage argument from **measured**
> (canary lower-bound) to **proven** (a principal never reads beyond policy under
> randomized policies and principals).

- **Date:** 2026-06-20
- **Status:** Approved (brainstorming) — ready for implementation plan
- **Supersedes:** `2026-06-04-m6-formal-model-no-leak-design.md` (stale draft, predates the eval harness + paper)
- **Thesis-supporting:** strengthens rigor of the leakage claim; not on the falsifiability critical path but directly upgrades the central guarantee.
- **Depends on:** M1 access model (stable: `authorizeKnowledgeNodeAccess`, `AccessPolicyDescriptor`, role inheritance).

## 1. Goal

A documented formal model (nodes, roles with inheritance, capabilities, access
policy, query, federation) and three executable property tests that exercise the
**real** core+server code (no re-implementation of the gate):

1. **P1 — no-content-leak (headline).** Under any policy and any principal, an
   unauthorized query never returns the node's protected content. This is exactly
   the event the paper's canary metric measures; the property proves it cannot
   occur on the shipped path.
2. **P2 — authorize soundness.** `authorizeKnowledgeNodeAccess` grants access iff
   an independent reference predicate says the principal satisfies the policy.
3. **P3 — role-inheritance soundness.** A role's effective capabilities equal the
   union of own + inherited own-capabilities along the parent chain — no phantom
   capability (escalation) and none lost; own-first precedence.

## 2. Current State (relevant slice)

- Auth gate shipped + stable in `packages/server/src/lib/auth/node-authorization.ts`
  (`authorizeKnowledgeNodeAccess`): knowledge-kind check → parse `gcp.accessPolicy`
  → role check (skipped when `readableByRoles` empty) → capability check against
  `principal.capabilities ∪ role.getEffectiveCapabilities()` → delegate to
  `authProvider.authorize`.
- **Default-deny subtlety (must be encoded precisely):** default-deny fires on a
  *missing/invalid* policy (parse fail). An *empty* policy (`readableByRoles=[]`
  **and** `requiredCapabilities=[]`) skips both checks and falls through to the
  provider — so it is *open* when the provider is permissive. The reference
  predicate models this exactly.
- `AccessPolicyDescriptor` (`packages/core/.../discovery/context-contract-types.ts`):
  `readableByRoles[]`, `requiredCapabilities[]`, `fallbackAllowed`, `denialMode
  ∈ {error, empty-result, fallback-if-allowed}`, `metadata`.
- Role inheritance (`packages/core/.../role/role-factories.ts`):
  `getEffectiveCapabilities()` = `mergeCapabilitiesById(own, parent.effective)`,
  own-first, deduped by id; self-parent guarded, deeper cycles structurally
  impossible.
- Real query handler `createContextQueryHandler` (`packages/server/.../handlers/
  context-query-handler.ts`): authenticate → resolve node → `authorizeAccess` →
  on deny return `denied` response (no adapter call); on allow run
  `executeTargetedContextQuery` and return content.
- `createStaticTokenAuthProvider.authorize()` returns `{ allowed: true }` always —
  so wiring the property with it isolates the **node-policy gate** as the sole
  denier (precisely what we prove). The provider term drops from the predicate.
- No `fast-check` in the workspace; no property tests; no formal-model doc.

## 3. Scope

**In:**
- `fast-check` as a workspace devDependency.
- Generators (`arbitraries`): finite role pool (incl. a parented role), finite
  capability pool, random `AccessPolicyDescriptor`, random `Principal`, random
  role chains — small pools so both authorized and unauthorized cases occur
  frequently.
- An independent **reference predicate** `authorized(P, K)` (the spec oracle).
- P1, P2, P3 property specs against the real path; P1 includes the **liveness
  half** and one HTTP end-to-end smoke.
- `docs/paper/formal-model.md` — model, theorem, code-symbol map, results.
- New subsection in `paper.tex` + `paper-es.tex` (rebuild PDFs).

**Out:**
- Fully mechanized proof (Lean/TLA+/Alloy) — the user asked for an *executable*
  property; mechanization is future work if a venue demands it.
- Modeling delegation (M2) — separate milestone.
- Any change to the auth gate's behavior (unless a counterexample forces a fix).

## 4. Design

### 4.1 Reference predicate (oracle)

```
authorized(P, K) :=
     (P.readableByRoles.length === 0  ||  K.role?.id ∈ P.readableByRoles)
  && P.requiredCapabilities ⊆ (K.capabilities ∪ effectiveCaps(K.role))
```
With the static provider always allowing, this is the exact admission condition.
`effectiveCaps(K.role)` reuses the real `getEffectiveCapabilities()` (the
predicate must agree with shipped inheritance, and P3 independently pins that
function's correctness).

### 4.2 P1 — no-content-leak (headline)

Harness drives the **real** `createContextQueryHandler().handle(message, context)`
directly (no disk, no HTTP) for speed and hermeticity:
- Build a `Graph` with one knowledge node carrying policy `P` in
  `gcp.accessPolicy` metadata.
- Knowledge source: a **stub adapter that always returns a unique `SECRET`
  sentinel** for the node. This isolates the gate: the only thing that can stop
  the secret reaching the response is the authorization decision — so the
  property cannot pass vacuously (a "deny everything" bug fails the liveness
  half).
- `auth`: `createStaticTokenAuthProvider` mapping one token → the generated
  principal `K` (authentication always succeeds; the test targets
  *authorization*).
- Run the handler; assert both directions:
  - `¬authorized(P,K)` ⇒ response status `denied` **and**
    `SECRET ∉ JSON.stringify(response)`.
  - `authorized(P,K)` ⇒ `SECRET ∈ JSON.stringify(response)` (liveness).
- Plus **one** non-property smoke through `createGcpNode` + `createFetchHandler`
  + `queryRemoteContext` (the eval-runner path) for a known authorized and a
  known denied principal, so the HTTP/serialization path is covered once.

### 4.3 P2 — authorize soundness

Pure, no handler: `authorizeKnowledgeNodeAccess(K, node(P), staticProvider)
.success === authorized(P, K)`, over a large input space.

### 4.4 P3 — role-inheritance soundness

Generate a random role chain (depth ≤ k; each level own caps drawn from the
pool). Assert:
- `set(effectiveCaps(role).map(id)) === ⋃ level.ownCaps` (no phantom, none lost).
- own-first precedence: when a cap id appears at multiple levels, the instance
  retained is the most-derived role's.

### 4.5 Generators

- Roles: `r:a`, `r:b`, `r:c`, and `r:child` (`parentRole = r:a`) — fixed pool.
- Capabilities: `cap:1..cap:5` — fixed pool.
- Policy: `readableByRoles` = random subset of the role pool; `requiredCapabilities`
  = random subset of the cap pool; `fallbackAllowed` random; `denialMode` random.
- Principal: role = random pool member or `undefined`; `capabilities` = random
  subset of the cap pool.
- Small pools guarantee frequent authorized/unauthorized coverage; document the
  pool so reviewers can judge input-space coverage.

### 4.6 Determinism & reproduction

- `FC_NUM_RUNS` env: CI default `1000`; nightly/manual heavy e.g. `50000`.
- `FC_SEED` env to reproduce a reported counterexample.
- On failure fast-check shrinks + prints the minimal counterexample and seed.

## 5. Layout

- `packages/server/src/lib/formal/arbitraries.ts` — generators + pools + the
  `authorized` reference predicate.
- `packages/server/src/lib/formal/no-leak.property.spec.ts` — P1 (both
  directions).
- `packages/server/src/lib/formal/authorize-soundness.property.spec.ts` — P2.
- `packages/eval/src/lib/formal/no-leak-http.smoke.spec.ts` — the single HTTP
  transport smoke (in `eval` to avoid a `server`→`scenario` package cycle).
- `packages/core/src/lib/role/inheritance.property.spec.ts` — P3.
- `docs/paper/formal-model.md` — model + theorem + symbol map + results table.
- `paper.tex`, `paper-es.tex` — new subsection; rebuilt PDFs.
- `fast-check` devDep (workspace ROOT only; hoisted to consuming packages).

> Note: as implemented, P2 and the HTTP smoke are separate files (not folded
> into `no-leak.property.spec.ts`) — a cleaner split that the §6 work breakdown
> already reflects.

## 6. Work Breakdown (→ TDD tasks)

1. Add `fast-check` devDep; write `arbitraries.ts` (pools, generators, reference
   predicate) with a small unit test that the pools produce both authorized and
   unauthorized draws.
2. P2 authorize-soundness property spec.
3. P3 inheritance-soundness property spec.
4. P1 no-leak handler property spec (both directions) + the single HTTP smoke.
5. `docs/paper/formal-model.md`.
6. `paper.tex` + `paper-es.tex` subsection; rebuild both PDFs.

## 7. Acceptance Criteria

- P1, P2, P3 pass at the CI run count; P1's liveness half passes (proves the
  harness can leak, so no-leak is non-vacuous).
- A discovered counterexample is either fixed in the gate or documented as a
  known limitation in `formal-model.md`.
- `formal-model.md` cross-references real code symbols (model ↔ implementation).
- `paper.tex` and `paper-es.tex` build; the new subsection states the leakage
  claim as proven (over the randomized space), with the canary metric reframed as
  the empirical complement.
- `pnpm nx run-many -t test` green across all projects; no secret/key committed;
  no build artifacts committed.

## 8. Test Plan

- Property tests run in CI at bounded `FC_NUM_RUNS`; a heavier manual/nightly run
  documented in `formal-model.md`. Seeded reproduction path for any failure.
- `arbitraries` unit test asserts coverage (both authorized and unauthorized
  draws appear) so the properties aren't trivially satisfied.

## 9. Risks

- A counterexample forces a fix in the M1 auth path — good for the paper, but
  budget iteration.
- Generators too narrow → false confidence; review pool coverage explicitly.
- Per-run handler cost — mitigated by the direct-handler harness (no disk/HTTP)
  for the property; HTTP path covered by a single smoke, not in the loop.

## 10. Links

- Supersedes: `2026-06-04-m6-formal-model-no-leak-design.md`
- Paper: `docs/paper/paper.tex`, `docs/paper/paper-es.tex`
- Technical guide: `docs/paper/TECHNICAL.md`
- Sibling unbuilt milestones (future cycles): M2 task delegation
  (`2026-06-04-m2-task-delegation-design.md`), M4a MCP bridge
  (`2026-06-04-m4-mcp-a2a-bridges-baseline-design.md`).
