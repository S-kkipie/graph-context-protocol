# M1 — Role-Gated Context + Structured Provenance — Design Spec

> Make least-privilege access real and auditable. This is the substrate for the leakage result (Claim 2) and the cross-owner result (Claim 4): without exercised role-gating and who-read-what-when provenance, neither metric can be measured.

- **Date:** 2026-06-04
- **Status:** Draft for review
- **Parent:** `2026-06-04-gcp-research-migration-design.md` (milestone M1)
- **Thesis-critical:** YES (Claims 2 & 4)
- **Depends on:** M0 (factory expresses per-node policies/principals)

## 1. Goal

A query by an under-privileged principal is denied by owner policy and the decision is recorded. Every query (allow or deny) produces a structured provenance/audit record naming the principal, the target node, the time, and the decision. Role hierarchies resolve.

## 2. Current State (relevant slice)

- `AccessPolicyDescriptor` (`readableByRoles`, `requiredCapabilities`, `fallbackAllowed`, `denialMode`) **exists** and is enforced server-side by `authorizeKnowledgeNodeAccess` (`packages/server/src/lib/auth/node-authorization.ts`): target must be `kind:"knowledge"`, parses `gcp.accessPolicy` from node metadata, **default-deny** on missing policy, checks `readableByRoles` (requires `principal.role.id` ∈ list) and `requiredCapabilities` (union of direct caps + role caps).
- The `context-query` handler (`packages/server/src/lib/handlers/context-query-handler.ts`) authenticates via `AuthProvider`, maps roles/capabilities **only** from the returned `Principal` (the inbound `requester` descriptor is audit-only/untrusted), then authorizes, then executes one adapter.
- **But** the demo apps use allow-all policy + anonymous credentials, so none of this is exercised.
- **Provenance:** only `MessageProvenance` (`{nodeId, timestamp, action}`) — message-hop. `ContextQueryResponse.provenance` is untyped `Record<string,unknown>`; the executor stuffs `{sourceId, sourceOfTruth, queryId}` into it — no principal, no read timestamp, no decision. Nothing is persisted.
- **Role hierarchy:** `RoleDefinition.parentRole` is stored but **never resolved** — `hasCapability`/`getEffectiveContextRules` (`packages/core/src/lib/role/role-factories.ts`) consider only the role's own caps/rules.

## 3. Scope

**In:**
- **core:** a typed read-provenance/audit record — `ReadProvenance` (or `AuditRecord`): `{ principalId, targetNodeId, queryId, timestamp, decision: "allow"|"deny", matchedRoles?, matchedCapabilities?, reason? }`, Zod-validated. Give `ContextQueryResponse.provenance` a real type (additive — see Risks). Resolve `parentRole` inheritance: `getEffectiveCapabilities()`/`getEffectiveContextRules()` walk the chain (own overrides parent), dedupe.
- **server:** an `AuditSink` interface (`record(event): void | Promise<void>`) with a default in-memory implementation; injected via `ServerDependencies`; the context-query handler records one event per decision (allow + deny); populate structured provenance in the response from that event.
- **scenarios:** replace allow-all/anonymous with real role-gated policies (`readableByRoles`/`requiredCapabilities`) and authenticated principals via `staticToken` or `capability` auth provider.

**Out:**
- Delegation/action paths (M2). Federated/multi-peer audit aggregation (M3+/M5 harness consumes the sink).

## 4. Design

- `AuditSink` default = in-memory ring/list, queryable for tests and for the M5 harness's "provenance completeness" metric. Pluggable so M5 can swap a collecting sink.
- Handler records: on deny (after `authorizeKnowledgeNodeAccess` fails) and on allow (after adapter execution), with `principal.id`, `query.targetNodeId`, `query.queryId`, timestamp, decision, and matched policy fields.
- `parentRole` resolution: linear chain walk with cycle guard; effective caps = union(own, ancestors) deduped by id; effective context rules = own rules override ancestor rules on path conflict.

## 5. Work Breakdown

1. core: `ReadProvenance`/`AuditRecord` type + schema + factory; type `ContextQueryResponse.provenance`.
2. core: implement `parentRole` inheritance + tests.
3. server: `AuditSink` interface + in-memory impl + wire into deps.
4. server: handler records allow/deny + emits structured provenance.
5. scenarios: role-gated policies + authenticated principals (via M0 factory config).

## 6. Acceptance Criteria

- An under-privileged principal's query returns `denied` **and** an audit record with `decision:"deny"` exists.
- An allowed query's response `provenance` names principal + target + time + decision.
- A role with `parentRole` inherits the parent's capabilities/rules; tests prove it.
- Existing demo still works under explicit (non-allow-all) policy + authenticated principal.

## 7. Test Plan

- Allow path, deny path (wrong role; missing capability; missing policy → default-deny), audit record shape, provenance shape, role inheritance (multi-level, cycle guard), and a regression that an anonymous principal is denied under a gated policy.

## 8. Risks

- **Contract change:** typing `ContextQueryResponse.provenance` touches a public, versioned contract (`gcp-context-contract/v1`). Prefer **additive** (typed optional fields, keep back-compat) over a breaking change; bump `contractVersion` only if unavoidable.
- Auth provider choice in scenarios affects realism — `capability` provider is closer to the paper's model than `staticToken`.

## 9. Open Questions

- Audit persistence: in-memory only for the paper, or a file/db sink? (In-memory is enough for M5; decide if reproducibility needs persisted logs.)

## Links
- Parent roadmap: `2026-06-04-gcp-research-migration-design.md`
- Prev: M0 · Next: M2 `2026-06-04-m2-task-delegation-design.md`
