# Multi-Model Evaluation — Runbook & Metrics Spec

**Status:** final runbook. The harness changes it depends on are merged
(`buildLlmConfig`, `createEvalModel` adapter selection, `canDriveToolCalls`
gate). This document is the step-by-step for actually running the sweep and
collecting the metrics. Paper write-up stays OUT OF SCOPE (later session).

Companion plan: [`docs/superpowers/plans/2026-06-22-multi-model-eval.md`](../plans/2026-06-22-multi-model-eval.md).

---

## 0. What this measures

The same agent task is run under two substrates — `gcp` (Graph Context
Protocol) and `a2a` (agent-to-agent baseline) — across several LLMs. Goal:
show the protocol's claims hold across models, not just one. Each
`(scenario, arm, model, seed)` run produces one `MetricsResult`; seeds are
averaged (mean ± population s.d.).

**Two metric classes — keep them apart:**

| Class | Metrics | Varies by model? |
| --- | --- | --- |
| **Model-independent** (topology / wiring) | `pairwiseConnections`, `integrationEffort`, `provenanceCompleteness`, `discoveryMessages`, `toolPromptTokens`, `containmentRate` | **No** — pure structure. Report ONCE from the baseline; do NOT re-tabulate per model. |
| **Model-dependent** (behavioral) | `successRate`, `leakageRate`, `tokens`, `roundTrips`, `messages`, `connections`, `latencyMs` | **Yes** — report the spread across models. |

`provenanceCompleteness` is structural: `gcp = 1` (audit sink records every
read), `a2a = 0` (no provenance). It does not depend on the model and must not
be presented as a model-varying result.

### 0.1 The headline signals (read these first)

The per-run **query** fan-out is **O(N) on both arms by construction** (one
orchestrator queries each peer once), so the live `tokens`/`latency` of the
query path look equal — that parity is expected, not a weakness. The protocol's
edge lives in the signals the report now surfaces explicitly:

| signal | where | gcp | a2a | what it proves |
| --- | --- | --- | --- | --- |
| **discovery** (`discoveryMessages`) | `marketplace scaling` + per-N tables | `1` at every N | `N` (one card fetch per peer) | acquaintance cost **O(1) vs O(N)** — MEASURED, not just the analytic `pairwiseConnections` curve |
| **tool-prompt tokens** (`toolPromptTokens`) | `marketplace scaling` (`toolTok` cols) + per-N tables | flat (one `query_context` tool) | grows with N (one tool per peer) | **prompt-token** cost of the tool-binding model is **O(1) vs O(N)** — re-sent every react turn, so it compounds. This is where GCP saves real tokens |
| **runtime parity** (`tokens`, `latencyMs`) | `marketplace scaling` table | ≈ a2a | ≈ gcp | GCP buys all of the above at **zero query-cost penalty** |
| **containment** (`containmentRate`) | `delegation` table | `1.00` | `0.00` | unauthorized delegation gated (GCP) vs executed (A2A). Read THIS, not `successRate` — GCP's `successRate=0` on delegation is the **correct refusal**, not a failure |

Both scaling signals are MEASURED genuinely, not hand-written:
- **discovery** — the GCP arm registers every peer with the shared substrate and
  resolves them in one query; the A2A arm fetches each peer's real
  `.well-known/agent-card.json`. (Impl: `packages/eval/src/lib/discovery.ts`.)
- **tool-prompt tokens** — counted from the actual tool definitions each arm
  binds: A2A's per-peer tool (`createA2aPeerContextToolFactory`) × N vs GCP's
  single `createGcpQueryToolFactory` tool. It is *structural* (the protocol's
  prescribed binding, like the topology curve) but expressed in tokens and
  grounded in real schemas; it predicts the live `tokens` gap because an LLM
  re-receives every bound tool's schema on every turn. To confirm end-to-end you
  would run the GCP arm with the single tool live — future work; the structural
  number already quantifies the gap. (Impl: `packages/eval/src/lib/tool-budget.ts`.)

Both gaps widen with N, so the marketplace sweep must span several N (see
`EVAL_ANCHORS` below). Sample (mock model, so live `tokens` are 0; `toolTok` is
the deterministic driver):

```
| N  | gcp toolTok | a2a toolTok |
| 2  | 72          | 110         |
| 8  | 72          | 440         |
| 16 | 72          | 886         |
| 32 | 72          | 1782        |   ~25x, and re-sent every turn
```

---

## 1. Prerequisites

- `.env.local` holds `OPENROUTER_API_KEY` (git-ignored, never committed).
- Harness is built (this branch): `createEvalModel` selects the adapter by env;
  `runFullEval` threads `baseURL`; gate stays `RUN_EVAL=1` + non-empty
  `OPENROUTER_API_KEY`.
- For local models: Ollama installed + serving, models pulled. Quickest path —
  `scripts/eval-ollama.sh --install --serve --small` (flags: `--install --serve
  --small --heavy --negative --all --list --check --gpu --dry-run`; see
  `--help`). NOT required for the hosted (OpenRouter) arm.

**Env knobs (all read by `run-eval.full.spec` / `runFullEval`):**

| Var | Meaning | Default |
| --- | --- | --- |
| `RUN_EVAL` | must be `1` or the spec skips | (unset → skip) |
| `OPENROUTER_API_KEY` | gate + hosted key. For local: any non-empty (`ollama`) | (unset → skip) |
| `EVAL_MODEL` | model id (OpenRouter id, or Ollama tag) + report label | `meta-llama/llama-3.3-70b-instruct:free` |
| `EVAL_ADAPTER` | `openrouter` \| `ollama` (else inferred from baseURL) | inferred → `openrouter` |
| `EVAL_BASE_URL` | OpenAI-compat base (`…/v1`) or native Ollama (`http://localhost:11434`) | OpenRouter |
| `EVAL_SEEDS` | reps per arm | `5` |
| `EVAL_ANCHORS` | marketplace behavioral Ns (comma list) — the discovery/scaling sweep | `2,4,8,16,32` |
| `EVAL_THROTTLE_MS` | inter-run pause (rate-limit guard; multiplied by attempt) | `4000` |
| `EVAL_RUN_RETRIES` | whole-run retries on failure | `3` |

Output of each run: `packages/eval/results/eval-report-<stamp>-<model>.md`
(git-ignored). Header carries model + seeds + timestamp; body has one table per
scenario (with `discoveryMessages`, `toolPromptTokens`, and, for delegation,
`containmentRate`), the **`marketplace scaling`** table (one row per N —
discovery and `toolTok` O(1) vs O(N), live tokens/latency at parity), one detail
table per N, and the analytic structural curve. The old
single pooled marketplace table is gone — it conflated different N (that is why
the earlier `messages 5.7 ± 3.3` row was meaningless).

### 1.1 Local setup helper — `scripts/eval-ollama.sh`

Idempotent helper that installs Ollama and pulls the local model sets (§2).
Nothing runs without an explicit flag; model sets stay in sync with §2.

| flag | action |
| --- | --- |
| `--install` | install Ollama via `curl https://ollama.com/install.sh \| sh` (skips if present) |
| `--serve` | start `ollama serve` in the background, wait until up |
| `--small` | pull `qwen3:4b llama3.1:8b granite3.3:8b gemma4:12b` |
| `--heavy` | pull `qwen2.5:32b command-r:35b gemma4:26b` |
| `--negative` | pull `deepseek-r1:7b` (reasoning control) |
| `--all` | `--install --serve --small --heavy --negative` |
| `--list` | `ollama list` |
| `--check` | probe native `:11434/api/tags` + OpenAI-compat `/v1/models` |
| `--gpu` | `nvidia-smi -L` + VRAM usage |
| `--dry-run` | print intended commands, change nothing |
| `-h`, `--help` | usage |

```bash
# fast start: install, serve, pull the small/medium set, show GPU
./scripts/eval-ollama.sh --install --serve --small --gpu
# verify endpoints before running the sweep
./scripts/eval-ollama.sh --check
# add heavy + negative models later
./scripts/eval-ollama.sh --heavy --negative
# preview everything without touching the machine
./scripts/eval-ollama.sh --all --dry-run
```

Respects `OLLAMA_HOST` (default `http://localhost:11434`). After setup, run the
sweep per §3.

---

## 2. Model matrix

Run each row as one invocation (§3). Confirm `:free` availability at run time.

| # | `EVAL_MODEL` | adapter | sweep | role |
| --- | --- | --- | --- | --- |
| 1 | `openai/gpt-oss-120b:free` | openrouter | seeds 5 | **baseline** (continuity) |
| 2 | `openai/gpt-oss-20b:free` | openrouter | seeds 5 | same family, smaller |
| 3 | `meta-llama/llama-3.1-8b-instruct:free` | openrouter | seeds 5 | small open, cross-lineage |
| 4 | `qwen/qwen-2.5-72b-instruct:free` | openrouter | seeds 5 | Qwen lineage |
| 5 | `qwen3:4b` | ollama (native) | seeds 5 | local small, best tool-caller |
| 6 | `llama3.1:8b` | ollama (native) | seeds 5 | local 8B |
| 7 | `granite3.3:8b` | ollama (native) | seeds 5 | local, tool-tuned (optional) |
| 7b | `gemma4:12b` | ollama (native) | seeds 5 (≈7.6 GB → partial CPU) | **Google**, native function-calling, multimodal |
| 8 | `qwen2.5:32b` | ollama (native) | **seeds 3, anchors 2,5** | heavy, CPU-bound |
| 9 | `command-r:35b` | ollama (native) | **seeds 3, anchors 2,5** | heavy, tool/RAG-tuned |
| 9b | `gemma4:26b` | ollama (native) | **seeds 3, anchors 2,5** | heavy MoE (18 GB, 3.8B active → faster than size); Google |
| N | `deepseek-r1:7b` | ollama (native) | seeds 1, anchors 2 | **negative** (reasoning, expect 0 tool calls) |

Gemma 4 (Ollama) tags + footprint: `gemma4:e2b` 7.2 GB · `gemma4:e4b` 9.6 GB · `gemma4:12b` 7.6 GB · `gemma4:26b` 18 GB (MoE) · `gemma4:31b` 20 GB (dense). Native function-calling — unlike gemma2 (no tools) / gemma3 (partial). Multimodal, but scenarios are text-only (vision unused). Has a configurable **thinking** mode — run the §3a pre-flight and prefer non-thinking (thinking traces can break `tool_calls`); on the 6 GB GPU everything ≥7 GB spills partly to CPU. Smallest fit: `gemma4:e2b`.

Minimal set if time-bound: rows 1, 3, 4, 5, 6.

---

## 3. Run instructions

### 3.0 One-command guided run (recommended) — `scripts/eval-run.sh`

Wraps pre-flight (§3a) + full eval (§3b/§3c) + report surfacing into one step.
Adapter is inferred from the model id: an id with `/` is hosted (OpenRouter); a
bare tag is local Ollama. Hosted runs read `OPENROUTER_API_KEY` from
`.env.local`; local runs need Ollama up (`scripts/eval-ollama.sh --serve`). The
key is exported, never echoed.

```bash
# local, default sweep (seeds 5, anchors 2,4,8,16,32)
./scripts/eval-run.sh qwen3:4b
# local, tighter error bars + explicit curve
./scripts/eval-run.sh qwen3:4b 15 2,4,8,16,32
# hosted (OpenRouter)
./scripts/eval-run.sh openai/gpt-oss-120b:free 5
# preview the exact commands, run nothing
./scripts/eval-run.sh qwen2.5:32b 3 2,8 --dry-run
```

On finish it prints the report path, the `marketplace scaling` block (discovery
O(1) vs O(N), tokens at parity), and the `containmentRate` row. Pre-flight that
fails (0 tool calls) aborts before writing a junk report — override with
`--no-preflight`. The manual steps below (§3a–§3c) are what this script runs;
use them when you need finer control.

### 3a. Pre-flight (every model, before its full sweep)

Confirm the model actually drives tool calls — a 0-round-trip model produces
meaningless behavioral metrics and must be excluded, not tabulated.

```bash
# hosted
set -a; source .env.local; set +a
pnpm tsx -e "import {canDriveToolCalls} from './packages/eval/src/lib/toolcall-sanity'; import {createEvalModel} from './packages/eval/src/lib/model-factory'; canDriveToolCalls({model: createEvalModel({apiKey: process.env.OPENROUTER_API_KEY, model:'meta-llama/llama-3.1-8b-instruct:free'})}).then(r=>console.log(r))"

# local native
EVAL_ADAPTER=ollama EVAL_BASE_URL=http://localhost:11434 \
  pnpm tsx -e "import {canDriveToolCalls} from './packages/eval/src/lib/toolcall-sanity'; import {createEvalModel} from './packages/eval/src/lib/model-factory'; canDriveToolCalls({model: createEvalModel({model:'qwen3:4b'})}).then(r=>console.log(r))"
```
`{ ok: true, roundTrips: >0 }` → proceed. `ok:false` → for a tool-capable model,
re-test via the `/v1` shim (`createEvalModel({model, baseURL:'http://localhost:11434/v1'})`);
exclude only if BOTH give 0.

### 3b. Hosted (OpenRouter) — adapter defaults to openrouter

```bash
set -a; source .env.local; set +a
RUN_EVAL=1 EVAL_SEEDS=5 EVAL_MODEL=openai/gpt-oss-120b:free \
  pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
# repeat, changing only EVAL_MODEL, one at a time (rows 2-4)
RUN_EVAL=1 EVAL_SEEDS=5 EVAL_MODEL=meta-llama/llama-3.1-8b-instruct:free \
  pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
```
On 429 storms: raise `EVAL_THROTTLE_MS=8000`. A model that 429s past
`EVAL_RUN_RETRIES` is **excluded (unavailable)**, not a data point.

### 3c. Local (Ollama) — native adapter, no rate limit

```bash
LOCAL="RUN_EVAL=1 EVAL_THROTTLE_MS=0 OPENROUTER_API_KEY=ollama EVAL_ADAPTER=ollama EVAL_BASE_URL=http://localhost:11434"
# small/medium (rows 5-7b)
env $LOCAL EVAL_SEEDS=5 EVAL_MODEL=qwen3:4b   pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
env $LOCAL EVAL_SEEDS=5 EVAL_MODEL=llama3.1:8b pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
env $LOCAL EVAL_SEEDS=5 EVAL_MODEL=gemma4:12b pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
# heavy, CPU-bound (rows 8-9b) — minutes per run; reduced sweep
env $LOCAL EVAL_SEEDS=3 EVAL_ANCHORS=2,5 EVAL_MODEL=qwen2.5:32b  pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
env $LOCAL EVAL_SEEDS=3 EVAL_ANCHORS=2,5 EVAL_MODEL=command-r:35b pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
env $LOCAL EVAL_SEEDS=3 EVAL_ANCHORS=2,5 EVAL_MODEL=gemma4:26b   pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
# negative (row N) — expect failure/0 tool calls; keep out of comparison rows
env $LOCAL EVAL_SEEDS=1 EVAL_ANCHORS=2 EVAL_MODEL=deepseek-r1:7b pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec || true
```
`OPENROUTER_API_KEY=ollama` is only there to satisfy the gate; the ollama
adapter ignores it. Watch `nvidia-smi` to confirm GPU offload (small models)
vs CPU spill (heavy models).

Heavy rows use a reduced `EVAL_ANCHORS=2,5` for speed — that truncates the
discovery curve to two points (still `1` vs `2` and `1` vs `5`). The full
`2,4,8,16,32` curve shape is established by the small/local models at default
sweep; heavy models only need to confirm the same direction, not re-trace it.

---

## 4. Collect metrics

Each run already wrote a markdown report to `packages/eval/results/`. Collection
turns N reports into ONE cross-model comparison.

### 4a. Inventory the reports

```bash
ls -1 packages/eval/results/eval-report-*.md
# label each by its `- model:` header line:
grep -H "^- model:" packages/eval/results/eval-report-*.md
```

### 4b. Path A — no-code aggregation (works today)

The numbers live in the per-scenario tables (`| metric | gcp | a2a |`). Pull a
single metric across all reports with grep, e.g. leakage and success:

```bash
for f in packages/eval/results/eval-report-*.md; do
  m=$(grep -m1 "^- model:" "$f" | sed 's/^- model: //')
  echo "== $m =="
  grep -E "^\| (successRate|leakageRate|tokens|roundTrips|discoveryMessages|toolPromptTokens|containmentRate) " "$f"
done
# the discovery curve lives in the scaling table — pull it per report:
for f in packages/eval/results/eval-report-*.md; do
  echo "== $f =="; sed -n '/marketplace scaling/,/^$/p' "$f"
done
```
Transcribe into the comparison template (§4d). Tedious but exact; fine for ≤10
models.

### 4c. Path B — JSON sidecar + aggregator (recommended; small code task)

Make collection reproducible. **To implement** (TDD, additive — not yet built):

1. **Emit a JSON sidecar.** In `run-eval.full.spec.ts`, after writing the
   markdown, also write `results/eval-metrics-<stamp>-<model>.json` containing
   the raw `MetricsResult[]`. This needs `runFullEval` to optionally RETURN the
   structured results, not only the rendered markdown. Add an overload, e.g.
   `runFullEval({ ..., emit: "both" })` that returns
   `{ markdown: string; results: MetricsResult[] }`; the spec writes both files.
   `MetricsResult` already carries `scenarioId, arm, n, seed, structural,
   behavioral, leakage, delegation, provenance` — no new shape needed.
2. **Aggregator** `packages/eval/src/lib/collect-metrics.ts`:
   `aggregate(results: Array<{ model: string; results: MetricsResult[] }>): string`
   → groups by `scenarioId`, averages model-dependent metrics over seeds per
   `(model, arm)`, and renders one markdown table per scenario with a column per
   model (gcp/a2a side by side). Structural metrics rendered once.
3. **CLI** `pnpm tsx packages/eval/src/lib/collect-metrics.ts packages/eval/results/eval-metrics-*.json > docs/eval/multi-model-comparison.md`.
4. Tests: `collect-metrics.spec.ts` — feed two fixture `MetricsResult[]` for two
   models, assert the table has both model columns and the averaged values.

Until Path B is built, use Path A.

### 4d. Comparison doc

Write `docs/eval/multi-model-comparison.md` (NOT under `docs/paper/` — paper is
out of scope). One block per scenario; one row per model; model-dependent
columns only. Template:

```markdown
# Multi-model comparison (GCP vs A2A)

Structural (model-independent, from baseline): integrationEffort gcp=1 a2a=4;
provenanceCompleteness gcp=1 a2a=0; pairwiseConnections linear (gcp) vs
quadratic (a2a); discoveryMessages gcp=1 (any N) vs a2a=N; toolPromptTokens gcp=O(1) vs a2a=O(N); containmentRate
(delegation) gcp=1.00 vs a2a=0.00 — see baseline report's `marketplace scaling`
and `delegation` tables.

## software-org
| model | seeds | successRate g/a | leakageRate g/a | tokens g/a | roundTrips g/a |
| --- | --- | --- | --- | --- | --- |
| openai/gpt-oss-120b:free | 5 | … | … | … | … |
| qwen3:4b (local) | 5 | … | … | … | … |
| … | | | | | |

## supply-chain
| … |

## marketplace (anchors)
| … |

### Excluded
| model | reason |
| --- | --- |
| deepseek-r1:7b | reasoning model — 0 tool calls (could not drive the protocol tool) |
| <model> | rate-limited past EVAL_RUN_RETRIES (unavailable) |
```

### 4e. Honesty rules (record, don't hide)

- Any model with reduced sweep (`EVAL_SEEDS`/`EVAL_ANCHORS`) → note it in its
  row; never compare a 3-seed row head-to-head with 5-seed as if equal.
- Excluded models go in the **Excluded** table with the reason — never silently
  dropped.
- Small/local models showing lower `successRate` is a real result — report it,
  don't massage it.
- The negative (R1) is reported as "could not drive the tool," NOT as a 0
  success-rate data point in the comparison rows.

---

## 5. Done criteria

- [ ] Pre-flight green for every included model.
- [ ] One report per included model in `results/`.
- [ ] Excluded models logged with reasons.
- [ ] `docs/eval/multi-model-comparison.md` filled (model-dependent metrics;
      structural cited once).
- [ ] (optional) Path B aggregator built + comparison regenerated reproducibly.

Paper integration (limitation rewrite, `paper.tex`/PDF) is a separate later
task — explicitly NOT part of this runbook.
