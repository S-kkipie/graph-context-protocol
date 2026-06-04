# M4 — MCP & A2A Bridges + A2A Baseline — Design Spec

> Interoperate with the incumbents (MCP, A2A) and build the message-passing **baseline** the experiment compares against. Splits cleanly into M4a (MCP bridge — supporting) and M4b (A2A baseline — thesis-critical).

- **Date:** 2026-06-04
- **Status:** Draft for review
- **Parent:** `2026-06-04-gcp-research-migration-design.md` (milestone M4)
- **Thesis-critical:** M4b (A2A baseline) YES; M4a (MCP bridge) NO (interop story)
- **Depends on:** M3 (transport) for the baseline; optionally M2 for A2A delegation parity

## 1. Goal

- **M4a:** a GCP knowledge node is readable by an MCP client, and a remote MCP resource is queryable as a GCP knowledge node — proving the "bridge, don't replace" positioning.
- **M4b:** an A2A-style message-passing implementation runs the same scenario tasks as GCP, as the experimental control.

## 2. Current State (relevant slice)

- **No MCP or A2A code anywhere** (all four packages grep-clean).
- `KnowledgeSourceAdapter` (`packages/server/src/lib/knowledge/types.ts`) is the extension seam an MCP-consume adapter would implement; only `createMarkdownKnowledgeAdapter` exists.
- `ExternalAgentRegistry` + the router `external-agent` route + `server.send` forwarding is the only agent-to-agent plumbing — a **directory + forward**, with no agent cards, no task lifecycle, no invocation logic. That is a substrate for a baseline, not a baseline.

## 3. Scope

**M4a — MCP bridge (supporting):**
- Consume: an adapter implementing `KnowledgeSourceAdapter` that proxies a remote MCP resource/tool, so a GCP graph can federate over MCP servers.
- Expose: surface a GCP knowledge node as an MCP resource/server so existing MCP clients can read permitted context (subject to the same auth/policy).

**M4b — A2A baseline (thesis-critical):**
- A message-passing implementation of the scenario tasks: agents know peers via cards, delegate/ask via messages, no owner-side policy gate on a shared read surface, no central store.
- **Same agent logic and LLM** as the GCP arm — only the interop layer differs.
- Instrumented for the same metrics seam M3/M5 define (messages, connections, tokens, task-success, and leakage canaries).

**Out:**
- Full MCP/A2A spec coverage — only the surface the scenarios and the interop claim need.
- A2A as a shipped GCP feature beyond the bridge + baseline.

## 4. Design

- **Baseline home:** a dedicated `packages/baseline` (or `apps/baseline-*`) so it is clearly not part of the GCP SDK and cannot accidentally share GCP's policy machinery (which would confound the comparison). (= parent roadmap §11 Q1.)
- **Fairness contract:** the baseline must be a good-faith implementation — same model, same prompts, same task definitions, same retry policy. Document its design alongside the GCP arm so reviewers can audit fairness.
- MCP adapter pins a specific MCP protocol/SDK version; expose path reuses the server's auth + `gcp.accessPolicy` enforcement so MCP access is still role-gated.

## 5. Work Breakdown

1. M4a: MCP-consume adapter (`KnowledgeSourceAdapter`) + tests.
2. M4a: MCP-expose surface over a GCP knowledge node + tests.
3. M4b: scenario-task agent logic shared between arms (extract from M0 factory).
4. M4b: A2A message-passing baseline (cards + message delegation) + metrics instrumentation.

## 6. Acceptance Criteria

- M4a: an MCP client reads a permitted GCP knowledge node; an MCP resource answers a GCP `context-query` via the consume adapter; denied access still blocked by policy.
- M4b: the baseline runs marketplace + software-org + supply-chain tasks to the same success definition as GCP, emitting the same metrics.

## 7. Test Plan

- MCP consume/expose round-trips (mock MCP server); policy still enforced on the expose path.
- Baseline: task-success parity on a fixture scenario; metrics emitted; canary leakage observable in the baseline arm.

## 8. Risks

- **Baseline fairness is the single biggest threat to the paper.** A strawman baseline invalidates the result. Build M4b with the same rigor as the GCP path and document design choices.
- MCP/A2A spec drift — pin versions; isolate behind adapters.
- Scope creep in MCP coverage — keep to expose + consume.

## 9. Open Questions

- Baseline home: `packages/baseline` vs `apps/` (= parent §11 Q1).
- Does M4a (MCP) gate any reviewer angle, or can it land after the empirical results? (Likely after; M4b is the critical one.)

## Links
- Parent roadmap: `2026-06-04-gcp-research-migration-design.md`
- Prev: M3 · Next: M5 `2026-06-04-m5-benchmark-harness-metrics-design.md`
