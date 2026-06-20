# Paper Design — Read-First, Role-Gated Context Federation vs. Point-to-Point Agent Message-Passing

> Design record (brainstorming output) for the arXiv-ready LaTeX paper that reports the GCP-vs-A2A evidence produced by the M5 benchmark harness.

- **Date:** 2026-06-19
- **Status:** Approved (design + structure), preliminary-eval framing
- **Artifact location:** `docs/paper/` (`paper.tex`, `refs.bib`)
- **Evidence source:** `packages/eval` harness, `runFullEval` on `openai/gpt-oss-120b:free`, K=5 seeds (`packages/eval/results/eval-report-*.md`)

## 1. Thesis (falsifiable)

At **equal task success**, read-first role-gated context federation (GCP) beats point-to-point
agent message-passing (A2A) on **coupling, leakage, and cost**.

## 2. Claims → scenarios → metrics

| Claim | Scenario | Primary metric(s) | Result (real, K=5) |
|---|---|---|---|
| 1 — coupling/scaling | marketplace | pairwise connections, integration effort | gcp `n` vs a2a `n(n-1)`; effort 1 vs 4 (deterministic) |
| 2 — leakage | software-org | canary exact-match, provenance | provenance 1.0 vs 0.0; behavioral leak contingent (see §5) |
| 4 — cross-owner | supply-chain | tokens, leakage, provenance | tokens 707.6±3.5 vs 901.4±229.2; provenance 1.0 vs 0.0 |

(Claim 3, multi-hop incident/RAG, is out of scope — optional in the roadmap.)

## 3. Contributions

1. **GCP architecture** — read-first, role-gated context federation with first-class, per-read
   provenance, contrasted against push-based message-passing.
2. **Fairness-controlled benchmark method** — identical agent brain + model + task; the harness
   swaps *only* the interop layer (in-process GCP fetch-handler vs real localhost A2A servers).
   Removes the confound that invalidates most architecture comparisons.
3. **Empirical head-to-head** over three scenarios, real LLM, K seeds, reporting counts (not just
   wall-clock).
4. **Metric definitions** — structural coupling topology, canary exact-match leakage (lower bound),
   provenance completeness, tokens/latency/round-trips/success.

## 4. Structure

Abstract · 1 Introduction · 2 Background & Related Work · 3 GCP Architecture · 4 Threat & Cost
Model and Metric Definitions · 5 Methodology · 6 Results · 7 Discussion & Threats to Validity ·
8 Limitations & Future Work · 9 Conclusion · References.

## 5. Honesty guards (threats to validity, stated in-paper)

- **Single free model, K=5 seeds → preliminary evaluation.** Multi-model replication is future work.
- **Leakage is a lower bound** (exact-match canary scan over answer + tool transcript).
- **software-org behavioral leak is latent, not observed:** with `gpt-oss-120b`, the agent queried
  only the public node (messages = 1.0), so the leaky path was never exercised; the A2A coarse-card
  exposure is demonstrated by the forced-query hermetic test, while GCP denies the read *by
  construction* (and the denial is audited). Framing: "GCP eliminates the leak by construction; A2A
  exposure is contingent on agent behavior and observed ≥ GCP."
- **supply-chain** logistics role is authorized to read both nodes, so its leakage reflects LLM
  discretion, not gating; it primarily demonstrates cross-owner federation. Observed leak gcp 0.5
  vs a2a 1.0.
- **marketplace task success is low** (0.3 ± 0.5) for both arms with this model — equal across arms
  (fairness holds) but the marketplace's evidentiary value is its deterministic structural curve.
- **Citations verified** (arXiv/exa); any unverifiable preprint is dropped before final.

## 6. Related-work map (clusters → positioning)

- **Message-passing baseline:** A2A, MCP, FIPA-ACL, KQML, AutoGen, MetaGPT, ChatDev, MAS surveys.
- **Coupling theory:** Parnas (information hiding), Stevens–Myers–Constantine, Briand et al.,
  Hohpe & Woolf (hub vs mesh, n(n-1)/2), microservice coupling.
- **Access control:** Saltzer & Schroeder (least privilege), Sandhu RBAC, NIST ABAC, GDPR
  minimization, capability security, Progent, permissioned/role-gated RAG.
- **Leakage & provenance:** Whispers-in-the-Machine, AgentLeak, AirGapAgent, OWASP LLM Top-10,
  LLM audit trails, authenticated delegation.

**Delta:** read-first + role-gated + *audited per-read provenance*, jointly, validated in a
fairness-controlled head-to-head against a real A2A baseline.

## 7. Process deviation

The brainstorming skill's normal terminal state is `writing-plans` → subagent-driven code
implementation. The deliverable here is prose (a paper), not multi-task code, and the user
explicitly requested the paper be written directly. We therefore author the LaTeX directly after
design approval rather than running the code-implementation pipeline. The eval-harness code changes
required to *run* the evidence (free-model default, retry/throttle, token-counting fix, gated runner
spec) are tracked alongside on the `paper-gcp-vs-a2a` branch.
