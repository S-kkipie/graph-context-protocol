# Research and Evaluation Direction

> The research framing for Graph Context Protocol: the article goal, the falsifiable thesis, the benchmark suite, the metrics, and the prior art the work must position against.

## Why This Document Exists

GCP is not only an engineering library. The intended output is a **research article aimed at a Q1 venue**. That bar changes what "value" means:

- A library on its own is an artifact, not a contribution. Reviewers do not reward "we built a protocol."
- The contribution is a **falsifiable claim plus evidence** (and a small formal model that supports it).
- The GCP SDK is the **reference implementation / artifact** used to produce that evidence.

This document is the source of truth for the research direction. The engineering direction lives in [11-direction.md](./11-direction.md).

## Contribution Shape

**Path A — empirical thesis (spine), with a light formal model as support.**

Lead with a falsifiable claim and an experiment. Back it with a small formal model of role-gated read-first context federation and a no-leak property. The empirical result is the headline; the model gives the result rigor.

## The Thesis

> **For multi-agent ecosystems, read-first role-gated context federation is a better interop primitive than point-to-point message-passing — it lowers coupling, keeps the source of truth with its owner, and makes cross-owner access auditable and policy-bounded — at equal task success.**

This is deliberately falsifiable. If an A2A-style message-passing baseline matches GCP on coupling, leakage, and cost at equal task success, the thesis fails.

## Sub-Claims and the Benchmark Suite

Each scenario isolates one sub-claim so a reviewer cannot dismiss the result as a single toy. The common rig holds the LLM and the task fixed and **swaps only the interop layer** (GCP vs A2A baseline). That isolation is what makes the experiment credible.

### Claim 1 — Lower coupling / better scaling

**Scenario: agent marketplace.** Many buyer and seller agents; nodes join and leave at runtime. A2A baseline requires each agent to know its peers (agent cards, N×N integration). GCP discovers and queries on demand.

- **Metrics:** number of pairwise connections, number of messages, integration effort, as N grows 2 → 50.
- **Expected result:** A2A trends O(N²) in acquaintance; GCP trends ~O(N).

### Claim 2 — Role-gating prevents leakage (least-privilege context)

**Scenario: software organization.** PM owns roadmap, Dev owns issues and technical decisions, CEO reads all, external contractor sees only exposed summaries. Task: "plan the next sprint" pulls cross-role context.

- **Metric:** **information-leakage rate** — inject canary tokens into confidential nodes and count how many reach an under-privileged agent. A2A message-passing leaks via oversharing replies; GCP filters at the owner.
- **Alternate testbed:** personal-assistant privacy (calendar / health / finance nodes; a third-party booking agent must read availability but never health or finance). Same canary method.

### Claim 3 — Federated multi-hop read beats round-trip messaging

**Scenario: incident response / DevOps** (optional fourth scenario). Monitoring node (metrics + logs), deploy node (events), oncall agent federates a read to find root cause.

- **Metrics:** latency, tokens, number of round-trips to resolve; provenance/audit completeness.
- **Alternate testbed:** research/RAG federation — each lab owns a RAG; a survey agent queries across all. Metrics: recall, dedup, tokens vs asking each agent to explain its knowledge.

### Claim 4 — Cross-owner trust boundary (no central graph)

**Scenario: B2B supply chain.** Inventory app (company A), supplier (company B), logistics (company C) — three real ownership boundaries. A buyer agent needs stock (A), lead time (B), and ETA (C) to fulfill an order. Each owns its data and enforces its own auth and policy.

- **Metrics:** integration cost (N×N bilateral vs hub-less) and leakage (company A must not see company B's margins).
- **Why it matters:** this is the case MCP cannot model (single-owner) and a central store should not model (cross-org trust).

## Recommended Suite

Three scenarios that cover all four claims, with one optional addition:

1. **Agent marketplace** → coupling / scaling curve (Claim 1).
2. **Software organization** → leakage canaries + task success (Claim 2).
3. **B2B supply chain** → cross-owner + integration cost (Claim 4, and part of Claim 1).
4. *(optional)* **Incident response / RAG federation** → multi-hop federated read (Claim 3).

## Metrics Summary

| Metric | What it measures | Scenarios |
| --- | --- | --- |
| Pairwise connections | Coupling / acquaintance graph size | Marketplace, supply chain |
| Messages exchanged | Communication overhead | All |
| Tokens | LLM cost of the interop pattern | All |
| Latency / round-trips | Time to resolve a task | Incident, RAG |
| Task success rate | Correctness held constant across layers | All |
| Information-leakage rate | Canary tokens reaching under-privileged agents | Software org, personal assistant |
| Integration effort | Work to add one new participant | Marketplace, supply chain |
| Provenance completeness | Auditability of who read what when | Incident, supply chain |

## Experimental Method

- **Baseline:** an A2A-style message-passing implementation of each scenario.
- **Treatment:** the same scenario over GCP (read-first context queries + gated delegation).
- **Control:** identical LLM, identical task definition, identical agent logic; only the interop layer changes.
- **Reproducibility:** scenarios scripted and seeded; report token and message counts, not just wall-clock.

## Prior Art to Position Against

Reviewers will cite these. The work must cite them first and state the delta clearly.

| Prior art | What it is | GCP's delta |
| --- | --- | --- |
| **Solid / Linked Data Platform + WAC/ACP** | Decentralized data ownership with access control | Agent-centric and LLM-query-shaped, not human-app document access |
| **SPARQL federated query** | Querying across distributed RDF endpoints | Role-gated, provenance-tracked, agent-semantic |
| **RBAC / ABAC, capability security** | Access-control models | The substrate GCP's policy rests on; not the contribution itself |
| **FIPA-ACL / KQML** | 1990s agent communication languages | Context-access primitive, not a message ontology |
| **MCP (Model Context Protocol)** | One agent ↔ its own servers; resources + tools + OAuth | Cross-owner, role-gated, federated; MCP assumes a single owner |
| **A2A (Agent-to-Agent)** | Agent ↔ agent task delegation | Context-first rather than task-first; A2A assumes counterparts already trust and know each other |

## Relationship to Engineering Direction

The engineering work in [11-direction.md](./11-direction.md) produces the artifact this research evaluates. Two engineering commitments are driven by this research:

1. **Interoperate with MCP and A2A** (bridge adapters), because the baselines and the comparison demand it.
2. **Make role-gated context and provenance first-class**, because Claims 2 and 4 depend on measuring leakage and auditability.

## See Also

- [Direction](./11-direction.md) - Engineering / protocol direction
- [Architecture](./01-architecture.md)
- [Protocol Specific](./06-protocol-specific.md)
- [Project README](../README.md)
