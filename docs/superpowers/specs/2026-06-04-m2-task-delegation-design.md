# M2 — Task-Delegation Gated Capability Layer — Design Spec

> Realize the brainstormed decision C: task delegation as a first-class but stricter-capability operation on the same query/response path. Reading is the default; delegating an action requires more than read access. Denial-fallback ("ask the agent when a read is denied") becomes one special case of delegation.

- **Date:** 2026-06-04
- **Status:** Draft for review
- **Parent:** `2026-06-04-gcp-research-migration-design.md` (milestone M2)
- **Thesis-critical:** NO (supporting; see Open Question on paper-scope)
- **Depends on:** M1 (capability model + audit sink)

## 1. Goal

A peer can ask another node's agent to *do* something and return a result, gated by a stricter capability than read. A read-only principal cannot delegate. Every delegation is audited. The legacy "direct fallback" is expressed as a special case, not a separate mechanism.

## 2. Current State (relevant slice)

- The **transport vocabulary already exists**: `MessageType` includes `action-request`/`action-response` (`packages/core/src/lib/protocol/protocol-types.ts`), and the `send_message` agent tool accepts those types. But `action-request` carries an unschematized `payload: unknown`.
- `ContextRule.access` is only `read | write | none` — **no execute/delegate verb**. `SystemCapabilities` has `MODIFY_GRAPH`/`WRITE_CONTEXT` but no delegation capability.
- The server has **one** handler (`context-query`); no action/delegation handler. `ExternalAgentRegistry` is a directory only — nothing invokes a remote agent.
- The langgraph `createContextQueryTool` is strictly **read-only** (verb `context-query`, mode hardcoded `"text"`, description "Read the shared context").

## 3. Scope

**In:**
- **core:** typed `ActionRequest`/`ActionResult` contract over the existing `action-request`/`action-response` message types (replace `payload: unknown` with a schema: `{ actionId, capabilityRequired, input, metadata }` / `{ status, result?, error?, provenance }`). Add a delegation capability (`SystemCapabilities.DELEGATE_TASK` = `cap:delegate-task`) and/or an `"execute"` verb on `ContextRule.access`.
- **server:** an `ActionHandler` (`messageTypes:["action-request"]`) distinct from the context-query handler, gated by the stricter capability, **default-deny**, audited via the M1 `AuditSink`, returning `action-response`.
- **langgraph:** a `createDelegationTool` → `delegate_task_to_peer` tool distinct from `query_peer_context`; sends an `action-request`.

**Out:**
- Arbitrary remote code execution; writing into a peer's graph (delegation returns an *action outcome*, not a graph mutation in the peer).
- A registry of "what actions a node offers" beyond what the descriptor needs (keep minimal).

## 4. Design

- Delegation rides the same auth→principal→authorize→execute pipeline as context-query, but the authorize step requires `cap:delegate-task` (or an `execute` context rule on the target), so a read-capable principal is rejected.
- Result is an **action outcome** (status + result), not stored context.
- **Denial-fallback unification:** when a read is denied and `policy.fallbackAllowed` + `denialMode:"fallback-if-allowed"`, the path escalates to a delegation/ask-agent action gated by the same capability check — i.e. fallback is delegation with a read-denied trigger, not a parallel mechanism.

## 5. Work Breakdown

1. core: `ActionRequest`/`ActionResult` schemas + factories; `DELEGATE_TASK` capability / `execute` verb.
2. server: `ActionHandler` + register in handler registry; gate + audit.
3. langgraph: `delegate_task_to_peer` tool.
4. Reframe denial-fallback as a delegation special case in the handler.

## 6. Acceptance Criteria

- A principal with `cap:delegate-task` can delegate an action and receive an `action-response`.
- A read-only principal's delegation attempt is denied + audited.
- Denial-fallback flows through the delegation path (no separate code path).

## 7. Test Plan

- Delegate allow/deny by capability; action-result shape; fallback-as-delegation; audit on both outcomes; read-only tool vs delegation tool separation.

## 8. Risks

- Capability-model change (`execute` verb) touches core role semantics — keep additive to `read|write|none`.
- Scope temptation: an "action marketplace" is out of scope; one gated action verb is enough.

## 9. Open Questions

- **Is delegation in-scope for the article, or shipped after?** (= parent roadmap §11 Q4.) If after, this milestone runs off the critical path.

## Links
- Parent roadmap: `2026-06-04-gcp-research-migration-design.md`
- Prev: M1 · Next: M3 `2026-06-04-m3-federated-discovery-multinode-design.md`
