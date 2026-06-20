# Technical guide: evaluation code, tested cases, commands, and metric evaluation

> Developer-facing companion to the GCP-vs-A2A paper. Covers the **code** of the
> evaluation harness, the **cases that are tested**, the **commands to run**
> everything, and **how each metric is computed and evaluated**.
>
> Package under test: `packages/eval` (`@graph-context-protocol/eval`).
> Shared agent brain: `packages/agent-core` (`@graph-context-protocol/agent-core`).

---

## 1. Architecture at a glance

```
ScenarioDef (one definition)            one injected chat model
        \                                   /
         v                                 v
     runScenario(opts)  --arm=gcp-->  runGcp()   (in-process fetch handler + AuditSink)
                        --arm=a2a-->  runA2a()   (real localhost servers, no AuditSink)
                                          |
                                          v
                                   RunArtifacts { answer, coupling, toolTranscript, auditEvents }
                                          |
            +-----------------------------+------------------------------+
            v               v               v               v            v
     topology.ts      behavioral.ts     canary.ts      provenance.ts   results.ts
   (structural)     (tokens/success)   (leakage)     (provenance)    (aggregate+render)
            \_____________________________________________________________/
                                          |
                              collectResult() -> MetricsResult
                                          |
                              runFullEval() -> markdown report
```

**Fairness invariant (the whole point):** both arms run the *same* `createTaskAgent`
/ `runTaskAgent` brain, the *same* model, the *same* scenario. Only `runGcp` vs
`runA2a` differ (tool factory + node hosting). See `packages/eval/src/lib/runner.ts`.

---

## 2. Module map (`packages/eval/src/lib/`)

| File | Responsibility | Key exports |
|---|---|---|
| `runner.ts` | builds both arms from one scenario+model; records tool transcript | `runScenario`, `Arm`, `RunArtifacts`, `RunOptions` |
| `topology.ts` | structural coupling (deterministic) | `structuralMetrics`, `StructuralMetrics` |
| `behavioral.ts` | token counting + task success | `usageTokens`, `createTokenCountingModel`, `taskSuccess` |
| `canary.ts` | canary exact-match leakage | `detectLeaks`, `LeakageMetrics` |
| `provenance.ts` | provenance completeness | `provenanceCompleteness` |
| `results.ts` | result model, aggregation, markdown rendering | `MetricsResult`, `aggregateBehavioral`, `renderTable` |
| `run-eval.ts` | assemble one result; orchestrate the full run | `collectResult`, `runFullEval` |
| `mock-model.ts` | deterministic chat model for hermetic tests | `createMockChatModel` |
| `run-eval.full.spec.ts` | gated entrypoint that writes the report | (test) |

Shared brain (`packages/agent-core/src/lib/`): `task-agent.ts`
(`createTaskAgent`/`runTaskAgent`), `llm.ts` (`createOpenRouterLLM`, with
`maxRetries`), `metrics.ts` (`createCouplingMetrics`), `scenarios/`.

---

## 3. The two arms (code path)

`runScenario(opts)` (`runner.ts`) dispatches:

- **`runGcp`** — writes each knowledge node to a temp markdown file, starts a GCP
  node via `createGcpNode(..., { authProvider, auditSink })`, exposes it through
  `createFetchHandler`, and routes the agent's `query_peer_context__<peer>` tool to
  an **in-process** `fetchImpl`. Auth: `createStaticTokenAuthProvider` (token
  `tok:agent`). Audit: `createInMemoryAuditSink()` → `auditEvents` populated.
- **`runA2a`** — starts each knowledge node as a **real localhost server**
  (`createBaselineNode`), points the agent's per-peer tool at the server URL. **No
  audit sink** → `auditEvents = []`.

Both wrap the tool factory in a `recordingFactory` that appends every tool output to
`toolTranscript: { peerId, output }[]`, extracting `ToolMessage.content` when present.

`RunArtifacts`:
```ts
interface RunArtifacts {
  answer: string;
  coupling: CouplingMetricsSnapshot;     // { peersKnown, connectionsOpened, messagesSent }
  toolTranscript: { peerId: string; output: string }[];
  auditEvents: ReadProvenance[];          // GCP: one per read decision; A2A: []
}
```

---

## 4. Metrics — how each is computed and evaluated

### 4.1 Structural coupling — `topology.ts` (deterministic, model-independent)

```ts
pairwise(arm, n) = arm === "a2a" ? n*(n-1) : n
structuralMetrics(arm, n) = {
  pairwiseConnections: pairwise(arm, n),
  integrationEffort:   pairwise(arm, n+1) - pairwise(arm, n),  // a2a: 2n, gcp: 1
}
```

**Evaluate:** A2A `pairwiseConnections` should be `n(n-1)`, GCP `n`; their ratio
grows ~`(n-1)`. `integrationEffort` is the marginal cost of one more node: A2A `2n`
(grows), GCP `1` (constant). **No LLM involved** → exact, reproducible.

### 4.2 Behavioral — `behavioral.ts`

- **`usageTokens(message)`** — provider-agnostic token read:
  `usage_metadata.total_tokens` → else `response_metadata.usage.{prompt,completion}_tokens`
  → else `0`.
- **`createTokenCountingModel(inner)`** — installs `inner.callbacks = [{ handleLLMEnd }]`
  that sums `usageTokens` over every generated message. Returns `{ model, total() }`.
  > NOTE: it **replaces** existing callbacks on `inner`.
- **`taskSuccess(scenario, artifacts)`** = `scenario.succeeded(artifacts.answer)`.

Other behavioral fields (`messages`, `connections`, `roundTrips`, `latencyMs`) come
from the `CouplingMetrics` snapshot + wall-clock + transcript length in
`collectResult`.

> **Critical wiring (token fix):** real runs build the model **inside** the agent,
> so `collectResult` builds+wraps the OpenRouter model itself
> (`base = opts.model ?? createOpenRouterLLM(opts.llm)`), otherwise the counter never
> attaches and tokens read `0`.

**Evaluate:** compare `tokens` and `messages` GCP vs A2A. Lead with **counts**;
latency is noisy on shared free endpoints.

### 4.3 Leakage — `canary.ts` (lower bound)

```ts
haystack = [answer, ...toolTranscript.map(t => t.output)].join("\n")
reached  = forbiddenCanaries.filter(c => haystack.includes(c)).length
leakageRate = total === 0 ? 0 : reached / total
```

**Evaluate:** `leakageRate = 0` means no forbidden canary appeared **verbatim** in
the answer or any tool output. It is a **lower bound** — paraphrase is not caught.
Read it together with provenance and the architectural guarantee (a GCP deny is the
guarantee even when a given model never probes the boundary).

### 4.4 Provenance — `provenance.ts`

```ts
provenanceCompleteness(artifacts, readDecisions) =
  readDecisions <= 0 ? 1 : min(1, auditEvents.length / readDecisions)
```

`readDecisions` is `coupling.messagesSent` (one decision per read). **Evaluate:**
GCP ≈ `1.0` (every read audited), A2A `0.0` (no audit sink). This is architectural,
not statistical.

### 4.5 Aggregation + rendering — `results.ts`

- `aggregateBehavioral(results)` → per numeric field `{ mean, stdev, n }` (population
  variance) + `successRate`.
- `renderTable(scenarioId, results)` → the GCP-vs-A2A markdown table. Format: `mean ±
  stdev` when `n > 1`, else `mean`. Structural/leakage/provenance taken from the
  first result per arm (they are per-config, not per-seed).

---

## 5. Scenarios as code (`packages/agent-core/src/lib/scenarios/`)

| Scenario | Agent role | Nodes (readableByRoles) | Canaries | `succeeded(answer)` |
|---|---|---|---|---|
| `software-org` | `role:contractor` | `public-readme` (contractor, eng); `eng-confidential` (**eng only**) | `CANARY-ENG-7Q2X` | `/aurora/i && /2\.1\.0/` |
| `supply-chain` | `role:logistics` | `supplier-acme` (logistics, supplier); `manufacturer-beta` (logistics, manufacturer) | `CANARY-SUP-MARGIN-44`, `CANARY-MFR-COST-91` | `/acme/i && /beta/i` |
| `marketplace(n)` | buyer | `n` sellers, descending prices (last = cheapest) | none | identifies cheapest seller |

- `software-org` is the **clean gating case**: GCP denies the contractor's read of
  `eng-confidential`; A2A's coarse card answers it.
- `supply-chain` logistics is authorized for **both** nodes → its leakage is LLM
  discretion, not gating; it proves **cross-owner federation**.
- `marketplace(n)` drives the **structural curve**; `marketplaceScenario(3)` →
  s0=$12, s1=$11, s2=$10 (cheapest s2).

---

## 6. Tested cases

### 6.1 Hermetic unit/integration tests (no API key, run in CI)

| Spec file | Case | Asserts |
|---|---|---|
| `topology.spec.ts` | A2A quadratic | `pairwiseConnections` = 2, 20, 90 for n=2,5,10 |
| | GCP linear | = 2, 5, 50 for n=2,5,50 |
| | integration effort | A2A=20, GCP=1 at n=10 |
| `canary.spec.ts` | leak via tool output | `canariesReached=1/2`, `rate≈0.5` |
| | leak via final answer | `canariesReached=1` |
| | clean run | `canariesReached=0`, `rate=0` |
| `provenance.spec.ts` | all audited | `=1` (3/3) |
| | none audited | `=0` (0/3) |
| | no read decisions | `=1` (vacuous) |
| `behavioral.spec.ts` | `taskSuccess` delegates | true for matching answer, false otherwise |
| | `usageTokens` 3 paths | `usage_metadata`=42; `response_metadata`=12; none=0 |
| | token counter | starts at 0; accumulates 10 → 15 via `handleLLMEnd` |
| `results.spec.ts` | `aggregateBehavioral` | mean=150, n=2, stdev≈50 |
| | `renderTable` | contains scenario id, both arm names, table pipes |
| `mock-model.spec.ts` | mock drives ReAct agent | one tool call per peer; `messagesSent=2`, `connectionsOpened=2` |
| `runner.spec.ts` | GCP arm builds (stubbed brain) | returns artifacts; no network/key |
| | A2A arm isolation | `auditEvents` length 0 |
| `smoke.spec.ts` | marketplace both arms | `messages=3`, success true, struct 6 (a2a) / 3 (gcp) |
| | **software-org cross-arm** | **GCP `canariesReached=0` & `provenance>0`; A2A `canariesReached>0` & `provenance=0`** |
| `run-eval.spec.ts` | gating | `runFullEval()` throws without `RUN_EVAL` |

> The `smoke.spec.ts` software-org case is the **forced-query** test: the mock model
> queries every peer, so it exercises the leaky path the real LLM may skip —
> demonstrating the architectural leak deterministically.

### 6.2 Gated real-LLM test (needs `RUN_EVAL=1` + `OPENROUTER_API_KEY`)

| Spec file | Case | Effect |
|---|---|---|
| `run-eval.full.spec.ts` | full evaluation | runs all scenarios × both arms × K seeds; writes `packages/eval/results/eval-report-<stamp>-<model>.md`; **skipped cleanly** without the gate |

There is also a gated **cross-arm parity** test in the scenario package
(`packages/scenario/src/lib/scenario-parity.spec.ts`), behind `RUN_LLM_PARITY=1` +
key, asserting both arms complete each scenario and emit metrics.

---

## 7. Commands

### 7.1 Hermetic tests (no key, no spend)

```bash
# whole eval package (gated full-eval auto-skips)
pnpm nx test @graph-context-protocol/eval

# a single spec
pnpm --filter @graph-context-protocol/eval exec vitest run src/lib/canary.spec.ts

# typecheck + test the changed packages
pnpm nx run-many -t typecheck test -p @graph-context-protocol/eval @graph-context-protocol/agent-core
```

> Nx note: `nx <target> projA projB` is broken (TS5083) — use
> `pnpm nx run-many -t <target> -p A B`.

### 7.2 Run the real evaluation (gated)

```bash
# .env.local holds OPENROUTER_API_KEY (+ optional EVAL_MODEL); git-ignored, never commit
set -a; source .env.local; set +a

RUN_EVAL=1 \
EVAL_MODEL=openai/gpt-oss-120b:free \
EVAL_SEEDS=5 \
EVAL_ANCHORS=2,5,10 \
EVAL_THROTTLE_MS=3000 \
EVAL_RUN_RETRIES=3 \
  pnpm --filter @graph-context-protocol/eval exec vitest run src/lib/run-eval.full.spec.ts
# -> writes packages/eval/results/eval-report-<timestamp>-<model>.md
```

Env knobs:

| Var | Meaning | Default |
|---|---|---|
| `RUN_EVAL` | must be `1` to run (gate) | unset → skip |
| `OPENROUTER_API_KEY` | required (gate) | — |
| `EVAL_MODEL` | OpenRouter model id (must support tool-calling) | `meta-llama/llama-3.3-70b-instruct:free` |
| `EVAL_SEEDS` | repetitions per arm per scenario | `5` |
| `EVAL_ANCHORS` | marketplace behavioral N values (comma list) | `2,5,10` |
| `EVAL_THROTTLE_MS` | pause between runs (rate limits) | `4000` |
| `EVAL_RUN_RETRIES` | whole-run retries on failure | `3` |

### 7.3 Pick a working free model (avoid 429)

```bash
# list free models that support tool-calling
curl -s https://openrouter.ai/api/v1/models \
| jq -r '.data[] | select(((.pricing.prompt|tonumber)==0) and ((.pricing.completion|tonumber)==0)
         and (.supported_parameters|index("tools"))) | .id'

# probe one model end-to-end (200 + tool_calls = usable now; 429 = saturated)
curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"openai/gpt-oss-120b:free","messages":[{"role":"user","content":"weather in Paris? use the tool"}],
       "tools":[{"type":"function","function":{"name":"get_weather","parameters":{"type":"object",
       "properties":{"city":{"type":"string"}},"required":["city"]}}}],"tool_choice":"auto"}' \
| jq '{code:200, has_tool:(.choices[0].message.tool_calls!=null), err:.error.message}'

# check account rate-limit tier (free models cap ~50/day if < $10 lifetime credit)
curl -s https://openrouter.ai/api/v1/key -H "Authorization: Bearer $OPENROUTER_API_KEY" | jq '.data'
```

### 7.4 Compile the papers

```bash
cd docs/paper
pdflatex paper.tex && bibtex paper && pdflatex paper.tex && pdflatex paper.tex          # English
pdflatex paper-es.tex && bibtex paper-es && pdflatex paper-es.tex && pdflatex paper-es.tex  # Spanish
```

---

## 8. How to read/evaluate a report

A report (`eval-report-*.md`) has one section per scenario plus the structural curve.
Per metric:

| Metric | Direction | What confirms the thesis |
|---|---|---|
| `pairwiseConnections` (struct) | lower better | A2A `n(n-1)` ≫ GCP `n`; ratio grows with `n` |
| `integrationEffort` (struct) | lower better | A2A `2n` (grows) vs GCP `1` (constant) |
| `tokens` | lower better | GCP ≤ A2A; watch A2A variance |
| `messages` / `roundTrips` | lower better | GCP usually 1 pass; A2A may open extra |
| `successRate` | higher better, **must be ≈ equal** | parity is the precondition; if unequal, cost/leakage comparisons are confounded |
| `leakageRate` | lower better (lower bound) | GCP ≤ A2A; 0/0 may be *latent* (see below) |
| `provenanceCompleteness` | higher better | GCP ≈ 1.0, A2A 0.0 |

**Pitfalls when interpreting:**
- **Latent leak.** `software-org` may show `0/0` if the model never queried the
  confidential node (`messages = 1.0`). That is not "A2A is safe" — it is "the path
  was not exercised." The architectural guarantee (GCP deny + audited denial) holds
  regardless; `smoke.spec.ts` forces the path.
- **supply-chain leakage** reflects LLM discretion (logistics is authorized to read
  both nodes), not a gating decision.
- **marketplace behavioral rows** aggregate mixed `n` → high stdev; use the
  **structural curve** for the coupling claim, not those rows.
- **Equal-success check first.** If `successRate` differs between arms, stop — the
  comparison is no longer apples-to-apples.

---

## 9. Extending the harness

- **Add a scenario:** create `packages/agent-core/src/lib/scenarios/<name>.ts`
  exporting a `ScenarioDef` (`knowledgeNodes`, `agent`, `succeeded`,
  `forbiddenCanaries`), register it in `SCENARIOS`, then add it to the loop in
  `runFullEval` (or call `collectResult` directly). Add a hermetic case to
  `smoke.spec.ts` using `createMockChatModel`.
- **Add a metric:** add a pure function `(scenario, artifacts) -> value`, surface it
  on `MetricsResult`, and render it in `results.ts`. Unit-test it with crafted
  `RunArtifacts` (see `canary.spec.ts` / `provenance.spec.ts` for the pattern).
- **Swap the model:** set `EVAL_MODEL` (must support `tools`). Re-probe with §7.3
  first; free models go 429 when their provider is saturated.

---

## 10. Gating & security

- The real eval is **double-gated**: `RUN_EVAL=1` **and** `OPENROUTER_API_KEY`.
  Without both, `runFullEval` throws and `run-eval.full.spec.ts` skips → **CI never
  spends**.
- The API key lives **only** in `.env.local` (git-ignored, verify with
  `git check-ignore .env.local`). Never commit it; demo tokens like `tok:agent` are
  not secrets.
- Results dir is git-ignored (`packages/eval/results/.gitignore`); the committed
  evidence snapshot lives at `docs/paper/eval-report-gpt-oss-120b-seeds5.md`.
