# Multi-Model Evaluation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-run the GCP-vs-A2A behavioral evaluation (plus M2 delegation and M4a MCP-interop containment) across **several models** — free OpenRouter tiers *and* cheap local Ollama models — so the robustness of the results no longer rests on a single model (`gpt-oss-120b`). Paper write-up is OUT OF SCOPE here (done later).

**Architecture:** The harness already constructs every model through one neutral factory (`createOpenRouterLLM`, OpenAI-compatible) that *already* accepts a `baseURL`. The single missing wire is threading `baseURL` from env through `runFullEval`. Once wired, Ollama (OpenAI-compatible server at `http://localhost:11434/v1`, dummy key) is just another `baseURL` — no new client, no per-arm drift. Structural-coupling metrics are pure topology math (model-independent) and are NOT re-run per model; only behavioral metrics (tokens, latency, success, leakage, round-trips, provenance) are swept. A pre-flight tool-call sanity gate excludes models whose API can't drive the ReAct agent (no `tool_calls` → 0 round-trips → meaningless metrics) instead of polluting the tables.

**Tech Stack:** Nx 22 / pnpm 9 / Node 20 / TS 5.9 strict ESM, Vitest 4, LangChain `@langchain/openai` `ChatOpenAI`, `@langchain/langgraph` ReAct agent, OpenRouter (`:free` tiers), Ollama (RTX 3050 6 GB Laptop GPU; Windows host 24 GB RAM, WSL2).

## Global Constraints

- OpenRouter API key ONLY in git-ignored `.env.local`; NEVER commit it; NOT in CI. (verbatim standing rule)
- Real-LLM / full-eval runs stay gated on `RUN_EVAL=1` + `OPENROUTER_API_KEY`; they skip cleanly without it. (verbatim standing rule)
- For local Ollama runs, `OPENROUTER_API_KEY=ollama` (any non-empty dummy) satisfies the gate; the value is sent as the OpenAI `apiKey` and ignored by Ollama. `ollama` is NOT a secret.
- Demo tokens `tok:*` and fixtures `SECRET-CANARY-*`, `RUNBOOK-EXEC-9F3K`, `MCP-LEAK-7Q2X`, `P5-MCP-CANARY` are NOT real secrets.
- Commit ONLY intended source. Never commit `results/*.md` (already git-ignored — see `packages/eval/results/.gitignore`), `.next/`, `*.tsbuildinfo`, `next-env.d.ts`, `.claude/`, `dist/`, `out-tsc/`, `SAI_PAPER_FORMAT.docx`.
- Commit/push only when the user asks. On `main`, branch first. Commit bodies end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Additive only: do NOT change `Arm`, `MetricsResult`, scenario definitions, or any proven gate. The robustness sweep must reuse the EXACT code paths the baseline used, or the comparison is unfair.
- Local hardware cap: model must fit ~5–5.5 GB VRAM for full GPU offload (fast). Larger spills to CPU (slow but works). 24 GB host RAM is NOT the binding constraint — 6 GB VRAM is.

---

## Model Menu

Curated for **reliable OpenAI-style tool-calling** (the ReAct agent is unusable without it). Availability of `:free` OpenRouter tiers shifts over time and is rate-limited; treat the list as candidates and confirm each at run time.

### Free on OpenRouter (`:free`) — tool-calling capable

| Model id | Why include |
| --- | --- |
| `openai/gpt-oss-120b:free` | **baseline** — keeps continuity with the existing report |
| `openai/gpt-oss-20b:free` | same family, smaller — isolates size effect within one lineage |
| `meta-llama/llama-3.3-70b-instruct:free` | already the harness default; strong, well-known tools |
| `meta-llama/llama-3.1-8b-instruct:free` | small open model, reliable tools |
| `qwen/qwen-2.5-72b-instruct:free` | different lineage (Qwen), strong tools |
| `mistralai/mistral-small-3.2-24b-instruct:free` | Mistral lineage, native tools |
| `mistralai/mistral-nemo:free` | 12B, cheap, native tools |
| `google/gemma-3-27b-it:free` | Gemma3 lineage; tools partial — gate it first |

Avoid for the metric tables (use only as a documented negative): `deepseek/deepseek-r1:free` and other R1 reasoning models — `<think>` traces routinely break the `tool_calls` schema → 0 round-trips. Worth ONE run to *report* "reasoning model could not drive the protocol tool," not for the comparison rows.

### Cheap local (Ollama) — fits RTX 3050 6 GB, tool-calling capable

| `ollama pull` tag | ~VRAM (q4) | Notes |
| --- | --- | --- |
| `qwen3:4b` | ~2.6 GB | **best small tool-caller**; hybrid thinking — set `/no_think` or low temp |
| `qwen3:1.7b` | ~1.4 GB | tiny; tools ok; weakest reasoning |
| `qwen2.5:7b` | ~4.7 GB | fits 6 GB; very solid tools |
| `qwen2.5:3b` | ~1.9 GB | smaller Qwen sibling |
| `llama3.1:8b` | ~4.9 GB | fits 6 GB (tight); native tools |
| `llama3.2:3b` | ~2.0 GB | small Llama; native tools |
| `mistral:7b` | ~4.4 GB | native tools |
| `granite3.3:8b` | ~4.9 GB | IBM Granite — explicitly tuned for tool/function calling |
| `hermes3:8b` | ~4.7 GB | fine-tuned for function calling |

### Heavy local (Ollama) — exceed 6 GB VRAM, run partly/mostly on CPU + 24 GB system RAM

These do NOT fit the 6 GB GPU. Ollama keeps ~5.5 GB of layers on the GPU and the rest in system RAM, so generation is **CPU-bound and slow** (~2–5 tok/s; a single ReAct run can take minutes). 24 GB host RAM is enough to load them. Use a **reduced sweep** (`EVAL_SEEDS=3 EVAL_ANCHORS=2,5`, or even `EVAL_SEEDS=2`) and expect long wall-clock. Value: shows the protocol claims hold on a strong local model, not just small ones.

| `ollama pull` tag | ~VRAM/RAM (q4) | Notes |
| --- | --- | --- |
| `qwen2.5:32b` | ~20 GB | strong tools; the safe heavy pick |
| `command-r:35b` | ~20 GB | Cohere — explicitly built for tool-use + RAG |
| `gemma3:27b` | ~17 GB | tools partial — gate before sweeping |
| `qwen3:32b` | ~20 GB | hybrid-thinking sibling of qwen3:4b |

Too big for 24 GB at usable quant (skip): `llama3.3:70b` (~40 GB), `mixtral:8x7b` (~26 GB), `qwen2.5:72b` local. Use the 70B-class only via the OpenRouter `:free` tiers above.

Skip for this study: `qwen3-vl` (vision model — scenarios have no images; larger for no benefit) and `deepseek-r1` distills (`deepseek-r1:1.5b/7b/8b` — reasoning, flaky tools; same caveat as the hosted R1). One documented negative run is enough.

### Local transport: native `ChatOllama` vs OpenAI-compat `baseURL` (✅ BUILT — env-selected)

Two ways to reach Ollama. Token counting works with BOTH — the counter (`behavioral.ts` `usageTokens`) is provider-agnostic (reads `usage_metadata.total_tokens`, which recent `ChatOllama` populates). Fairness is preserved either way: the SAME injected model object drives both arms (model is built once in `collectResult` and injected), so the "one neutral factory" property is about per-arm symmetry, which holds regardless of transport.

| Option | How | Pros | Cons |
| --- | --- | --- | --- |
| **OpenAI-compat `baseURL`** (built, Task 1) | `EVAL_BASE_URL=http://localhost:11434/v1`, dummy key, reuse `createOpenRouterLLM` | zero new deps; ONE construction path; works today; also covers vLLM / LM Studio / llama.cpp servers | relies on Ollama's `/v1` shim — some tool-capable models surface `tool_calls` less cleanly → risk of FALSE exclusion by the sanity gate |
| **Native `ChatOllama`** (`@langchain/ollama`) | `new ChatOllama({ model, baseUrl: "http://localhost:11434" })` (native API, NOT `/v1`); `.bindTools()` first-class | most reliable Ollama tool-calling → fewer false exclusions; idiomatic; native usage→`usage_metadata` | new dep `@langchain/ollama`; a second construction branch (selected only for local; OpenRouter still via `createOpenRouterLLM`) |

**BOTH are built.** `createEvalModel(cfg, env)` (`model-factory.ts`) selects the adapter:
1. explicit `adapter` arg, else
2. `EVAL_ADAPTER` env (`ollama` | `openrouter`), else
3. inference from the baseURL — `:11434` WITHOUT `/v1` → `ollama` (native); a `…/v1` URL → `openrouter` (OpenAI-compat shim / OpenRouter), else
4. default `openrouter`.

`collectResult` now builds the real model through `createEvalModel` instead of `createOpenRouterLLM` directly. The OpenRouter path still requires a key; the ollama path needs none.

**Recommendation for local:** use the NATIVE adapter — `EVAL_ADAPTER=ollama` with `EVAL_BASE_URL=http://localhost:11434` (note: NO `/v1`). It's the most reliable for Ollama tool-calling. Keep the OpenAI-compat `/v1` path only as a fallback (also serves vLLM / LM Studio / llama.cpp). Exclude a tool-capable model only if it yields 0 round-trips under BOTH transports.

**Recommended minimal set** (good coverage, bounded time): re-run `gpt-oss-120b:free` (baseline) + add `llama-3.1-8b-instruct:free` and `qwen-2.5-72b-instruct:free` (free, cross-lineage), then local `qwen3:4b` and `llama3.1:8b`. Five models, three lineages, hosted-vs-local contrast. Add `granite3.3:8b` if a third local is wanted, and one R1 negative run for honesty.

---

## File Structure

- `packages/agent-core/src/lib/llm.ts` — already supports `baseURL`; no change.
- `packages/eval/src/lib/run-eval.ts` — **modify**: add `baseURL` to `runFullEval` opts + the `llm` carrier; read `EVAL_BASE_URL`. Widen the inline `llm` type `{ apiKey?; model?; baseURL? }`.
- `packages/eval/src/lib/run-eval.spec.ts` — **modify**: tests for `buildLlmConfig` baseURL resolution.
- `packages/eval/package.json` — **modify**: add dep `@langchain/ollama@^0.2.4`.
- `packages/eval/src/lib/model-factory.ts` — **create**: `resolveAdapter` + `createEvalModel` (env-driven adapter selection: OpenRouter `ChatOpenAI` vs native `ChatOllama`).
- `packages/eval/src/lib/model-factory.spec.ts` — **create**: adapter-precedence + client-type tests.
- `packages/eval/src/lib/toolcall-sanity.ts` — **create**: a tiny gate that runs one scenario×one seed and reports whether the model emitted any tool call (round-trips > 0).
- `packages/eval/src/lib/toolcall-sanity.spec.ts` — **create**: the failing-first test for the gate, using the deterministic mock model.
- `packages/eval/results/` — run artifacts (git-ignored).
- Metrics summary doc — **create**: cross-model comparison table. Exact path + format TO BE DETAILED with the user (Task 7). Paper edits (`paper.tex`/`paper-es.tex`, PDFs) are OUT OF SCOPE here — deferred.

---

### Task 1: Thread `baseURL` through `runFullEval` — ✅ DONE (commit 6b88c62)

> **As-built:** extracted a pure seam `buildLlmConfig(apiKey, model, baseURL?, env = process.env)` (explicit `baseURL` > `EVAL_BASE_URL` > omitted), TDD'd with 3 cases in `run-eval.spec.ts`; wired into `runFullEval` (`const llm = buildLlmConfig(key, model, opts?.baseURL)`); widened the `llm` carrier to `{ apiKey?, model?, baseURL? }` on `CollectOptions` and `RunOptions`. The brittle `clientConfig.baseURL` assertion sketched below was replaced by the `buildLlmConfig` unit tests (cleaner, not coupled to ChatOpenAI internals). 4/4 tests + typecheck green.

**Files:**
- Modify: `packages/eval/src/lib/run-eval.ts`
- Test: `packages/eval/src/lib/run-eval.spec.ts`

**Interfaces:**
- Consumes: `createOpenRouterLLM(config: { apiKey?; model?; temperature?; baseURL? }): ChatOpenAI` (already exists, `packages/agent-core/src/lib/llm.ts:37`). `collectResult(opts: CollectOptions)` builds `createOpenRouterLLM(opts.llm)` when no model is injected (`run-eval.ts:42-43`).
- Produces: `runFullEval(opts?: { seeds?; sweep?; anchors?; model?; baseURL? })`; an `llm` object of shape `{ apiKey?: string; model?: string; baseURL?: string }` carried into `collectResult`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/eval/src/lib/run-eval.spec.ts — add this test
import { createOpenRouterLLM } from "@graph-context-protocol/agent-core";

it("createOpenRouterLLM honors an explicit baseURL (Ollama path)", () => {
    const model = createOpenRouterLLM({
        apiKey: "ollama",
        model: "qwen3:4b",
        baseURL: "http://localhost:11434/v1",
    });
    // ChatOpenAI stores the configured base on clientConfig.baseURL
    const base = (model as unknown as { clientConfig?: { baseURL?: string } })
        .clientConfig?.baseURL;
    expect(base).toBe("http://localhost:11434/v1");
    expect(model.model).toBe("qwen3:4b");
});
```

- [ ] **Step 2: Run test to verify it passes or pins the accessor**

Run: `set -a; source .env.local; set +a; pnpm nx test @graph-context-protocol/eval -- run-eval.spec`
Expected: PASS. If the base lands on a different field, fix the accessor in the test to the real property (inspect with a one-off `console.dir(model, { depth: 1 })`) — the point is to pin where `ChatOpenAI` records `baseURL` so the harness wiring is trustworthy.

- [ ] **Step 3: Add `baseURL` to the `llm` carrier + env read**

In `runFullEval` (`run-eval.ts`), after the `model` resolution, add:

```typescript
    const baseURL = opts?.baseURL ?? process.env.EVAL_BASE_URL;
    const llm = { apiKey: key, model, ...(baseURL ? { baseURL } : {}) };
```

Replace the existing `const llm = { apiKey: key, model };` line with the above. Add `baseURL?: string;` to the `runFullEval` opts type and to `CollectOptions.llm` (`run-eval.ts:31`) and `RunOptions.llm` (`runner.ts:60`): change `{ apiKey?: string; model?: string }` → `{ apiKey?: string; model?: string; baseURL?: string }` in all three literals.

- [ ] **Step 4: Run typecheck + the spec**

Run: `pnpm nx typecheck @graph-context-protocol/eval && set -a; source .env.local; set +a; pnpm nx test @graph-context-protocol/eval -- run-eval.spec`
Expected: typecheck GREEN; spec PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/eval/src/lib/run-eval.ts packages/eval/src/lib/runner.ts packages/eval/src/lib/run-eval.spec.ts
git commit -m "feat(eval): thread baseURL into runFullEval (enables Ollama/local OpenAI-compatible models)"
```

---

### Task 2: Tool-call sanity gate — ✅ DONE (commit 2b2de92)

> **As-built:** `canDriveToolCalls({ model?, llm? }): Promise<{ ok, roundTrips, answer }>` runs one `gcp`-arm `supply-chain` run; `ok = roundTrips > 0`. Transport-agnostic (any injected `BaseChatModel`). Tests: the real mock (calls bound tools → ok) + an inline `NoToolModel` that never emits `tool_calls` (→ not-ok). 2/2 tests + typecheck green.

**Files:**
- Create: `packages/eval/src/lib/toolcall-sanity.ts`
- Test: `packages/eval/src/lib/toolcall-sanity.spec.ts`

**Interfaces:**
- Consumes: `runScenario(opts: RunOptions): Promise<RunArtifacts>` (`runner.ts:233`); `RunArtifacts.toolTranscript` (round-trips); `SCENARIOS["supply-chain"]` from `@graph-context-protocol/agent-core`; `createOpenRouterLLM`; `createMockChatModel` from `./mock-model`.
- Produces: `canDriveToolCalls(opts: { model?: BaseChatModel; llm?: { apiKey?; model?; baseURL? } }): Promise<{ ok: boolean; roundTrips: number; answer: string }>` — runs ONE `gcp`-arm `supply-chain` run and reports whether the agent emitted ≥1 tool call.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/eval/src/lib/toolcall-sanity.spec.ts
import { describe, expect, it } from "vitest";
import { createMockChatModel } from "./mock-model";
import { canDriveToolCalls } from "./toolcall-sanity";

describe("canDriveToolCalls", () => {
    it("reports ok when the model issues a peer-context tool call", async () => {
        // Mock model that calls the first peer tool once, then answers.
        const model = createMockChatModel({ callFirstToolThenAnswer: true });
        const res = await canDriveToolCalls({ model });
        expect(res.ok).toBe(true);
        expect(res.roundTrips).toBeGreaterThan(0);
    });

    it("reports not-ok when the model never calls a tool", async () => {
        const model = createMockChatModel({ finalAnswer: "no tools used" });
        const res = await canDriveToolCalls({ model });
        expect(res.ok).toBe(false);
        expect(res.roundTrips).toBe(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test @graph-context-protocol/eval -- toolcall-sanity.spec`
Expected: FAIL — `canDriveToolCalls` not defined. (First, read `packages/eval/src/lib/mock-model.ts` to use the REAL option names for "call a tool then answer"; adjust the test's mock options to match what the mock actually supports.)

- [ ] **Step 3: Implement the gate**

```typescript
// packages/eval/src/lib/toolcall-sanity.ts
/**
 * Pre-flight gate: does this model's API drive the ReAct agent's tool calls?
 * A model that emits no tool_calls yields 0 round-trips and meaningless
 * behavioral metrics — exclude it from the sweep instead of polluting tables.
 *
 * @module toolcall-sanity
 */

import { SCENARIOS } from "@graph-context-protocol/agent-core";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { runScenario } from "./runner";

export async function canDriveToolCalls(opts: {
    model?: BaseChatModel;
    llm?: { apiKey?: string; model?: string; baseURL?: string };
}): Promise<{ ok: boolean; roundTrips: number; answer: string }> {
    const artifacts = await runScenario({
        arm: "gcp",
        scenario: SCENARIOS["supply-chain"],
        model: opts.model,
        llm: opts.llm,
    });
    const roundTrips = artifacts.toolTranscript.length;
    return { ok: roundTrips > 0, roundTrips, answer: artifacts.answer };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test @graph-context-protocol/eval -- toolcall-sanity.spec`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add packages/eval/src/lib/toolcall-sanity.ts packages/eval/src/lib/toolcall-sanity.spec.ts
git commit -m "feat(eval): tool-call sanity gate to exclude non-tool-calling models from the sweep"
```

---

### Task 2b: Env-driven adapter factory (`createEvalModel`) — ✅ DONE

> **As-built:** added dep `@langchain/ollama@^0.2.4` (peer `@langchain/core >=0.3.58 <0.4.0`, satisfied by the resolved `0.3.80`; the newest 0.x line — `1.x` needs core `^1.0.0` which the repo is not on). New `packages/eval/src/lib/model-factory.ts` exports `EvalAdapter`, `resolveAdapter(cfg, env)`, `createEvalModel(cfg, env)`. `collectResult` now builds the real model via `createEvalModel` (was `createOpenRouterLLM`). 7 unit tests (adapter precedence + both client types via `instanceof`); full eval suite 47 passed / 1 skipped, typecheck green.

**Files:**
- Modify: `packages/eval/package.json` (add `@langchain/ollama`)
- Create: `packages/eval/src/lib/model-factory.ts`
- Test: `packages/eval/src/lib/model-factory.spec.ts`
- Modify: `packages/eval/src/lib/run-eval.ts` (`collectResult` → `createEvalModel`)

**Interfaces:**
- Produces: `type EvalAdapter = "openrouter" | "ollama"`; `resolveAdapter(cfg?: { adapter?: EvalAdapter; baseURL?: string }, env?): EvalAdapter`; `createEvalModel(cfg?: { apiKey?; model?; baseURL?; adapter?; temperature? }, env?): BaseChatModel`.
- Selection rule: explicit `adapter` > `EVAL_ADAPTER` env > baseURL inference (`:11434` w/o `/v1` ⇒ ollama) > `openrouter`.

---

### Task 3: Install + warm Ollama, pull the local model set

**Files:** none (environment setup). Done once on the WSL host.

- [ ] **Step 1: Install Ollama (WSL2, GPU-enabled)**

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama --version
```

- [ ] **Step 2: Start the server and confirm GPU offload**

```bash
# Server (leave running; or use the systemd unit the installer adds)
ollama serve &
# Confirm it sees the RTX 3050
ollama run qwen3:1.7b "hi" --verbose 2>&1 | grep -i "gpu\|layers" || true
```
Expected: layers offloaded to GPU (not "100% CPU"). If CPU-only, models still run, just slower.

- [ ] **Step 3: Pull the chosen local models (recommended set)**

```bash
ollama pull qwen3:4b
ollama pull llama3.1:8b
# optional extras / negatives
ollama pull granite3.3:8b
ollama pull deepseek-r1:7b   # negative-result candidate only
# heavy (CPU-bound on 6 GB GPU + 24 GB RAM — slow, reduced sweep)
ollama pull qwen2.5:32b
ollama pull command-r:35b
```

- [ ] **Step 4: Verify the Ollama endpoints answer**

```bash
# native API (used by the ChatOllama adapter — note NO /v1)
curl -s http://localhost:11434/api/tags | head -c 400; echo
# OpenAI-compat shim (fallback path)
curl -s http://localhost:11434/v1/models | head -c 400; echo
```
Expected: both list the pulled models. Native base = `http://localhost:11434`; shim base = `…/v1`.

- [ ] **Step 5: Tool-call pre-flight per local model (native adapter)**

For each pulled model, run the Task 2 gate via a one-off (do NOT add to the committed report yet). Uses the native `ChatOllama` adapter (no `/v1`):

```bash
EVAL_ADAPTER=ollama EVAL_BASE_URL=http://localhost:11434 \
  pnpm tsx -e "import {canDriveToolCalls} from './packages/eval/src/lib/toolcall-sanity'; import {createEvalModel} from './packages/eval/src/lib/model-factory'; canDriveToolCalls({model: createEvalModel({model:'qwen3:4b'})}).then(r=>console.log(r))"
```
Expected: `{ ok: true, roundTrips: >0, ... }`. If `ok:false`, re-test the SAME model via the `/v1` shim (`createEvalModel({model:'qwen3:4b', baseURL:'http://localhost:11434/v1'})`). Record as **excluded (no tool calls)** only if BOTH transports give 0 round-trips — do not run its full sweep.

---

### Task 4: Run the free-OpenRouter sweep

**Files:** writes to `packages/eval/results/` (git-ignored).

Adapter defaults to `openrouter` — no `EVAL_ADAPTER`/`EVAL_BASE_URL` needed for these. Each run is one model. Behavioral scenarios + marketplace anchors are model-dependent; the structural curve at the tail is deterministic (identical every run) — keep it, it's free, but cite it ONCE.

- [ ] **Step 1: Baseline re-run (continuity)**

```bash
set -a; source .env.local; set +a
RUN_EVAL=1 EVAL_SEEDS=5 EVAL_MODEL=openai/gpt-oss-120b:free \
  pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
```
Expected: report written to `packages/eval/results/eval-report-<stamp>-openai_gpt-oss-120b_free.md`. Sanity-check it matches the existing numbers within seed noise.

- [ ] **Step 2: Each additional free model**

Repeat Step 1 changing only `EVAL_MODEL`, one at a time (free tiers are rate-limited — keep the default `EVAL_THROTTLE_MS`, raise it via `EVAL_THROTTLE_MS=8000` on 429 storms):

```bash
RUN_EVAL=1 EVAL_SEEDS=5 EVAL_MODEL=meta-llama/llama-3.1-8b-instruct:free \
  pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
RUN_EVAL=1 EVAL_SEEDS=5 EVAL_MODEL=qwen/qwen-2.5-72b-instruct:free \
  pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
```

- [ ] **Step 3: Record outcomes**

For each: note the report filename, whether all scenarios produced round-trips > 0, and any model excluded (rate-limited to death, or 0 tool calls). A model that 429s past `EVAL_RUN_RETRIES` is **excluded (unavailable)**, not a data point.

---

### Task 5: Run the local-Ollama sweep

**Files:** writes to `packages/eval/results/` (git-ignored).

Local uses the **native `ChatOllama` adapter**: `EVAL_ADAPTER=ollama` + `EVAL_BASE_URL=http://localhost:11434` (NO `/v1`). `OPENROUTER_API_KEY=ollama` is still required — the `runFullEval` GATE checks for a non-empty key even though the ollama path ignores it. No rate limit → `EVAL_THROTTLE_MS=0`. Local is slower per call; bound time with fewer anchors/seeds if needed.

Shared env prefix for every local run:

```bash
set -a; source .env.local; set +a   # for any other vars; key is overridden below
LOCAL="RUN_EVAL=1 EVAL_THROTTLE_MS=0 OPENROUTER_API_KEY=ollama EVAL_ADAPTER=ollama EVAL_BASE_URL=http://localhost:11434"
```

- [ ] **Step 1: One local model, full behavioral**

```bash
env $LOCAL EVAL_SEEDS=5 EVAL_MODEL=qwen3:4b \
  pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
```
Expected: `packages/eval/results/eval-report-<stamp>-qwen3_4b.md`. Watch `nvidia-smi` in another shell to confirm GPU use.

- [ ] **Step 2: Remaining small/medium local models, one at a time**

```bash
env $LOCAL EVAL_SEEDS=5 EVAL_MODEL=llama3.1:8b \
  pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
```
Repeat per pulled model. If a model is slow, drop to `EVAL_SEEDS=3 EVAL_ANCHORS=2,5` to bound wall-clock; note the reduced config in the comparison doc.

- [ ] **Step 3: Heavy local models (reduced sweep, CPU-bound)**

These exceed 6 GB VRAM → mostly CPU → minutes per run. Use a small sweep and watch `nvidia-smi`/`htop` (expect high CPU, partial GPU):

```bash
env $LOCAL EVAL_SEEDS=3 EVAL_ANCHORS=2,5 EVAL_MODEL=qwen2.5:32b \
  pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
env $LOCAL EVAL_SEEDS=3 EVAL_ANCHORS=2,5 EVAL_MODEL=command-r:35b \
  pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
```
Record the reduced `EVAL_SEEDS`/`EVAL_ANCHORS` in the comparison doc so the heavy rows are not compared head-to-head with 5-seed rows.

- [ ] **Step 4: One R1 negative run (honesty)**

```bash
env $LOCAL EVAL_SEEDS=1 EVAL_ANCHORS=2 EVAL_MODEL=deepseek-r1:7b \
  pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec || true
```
Expected: likely 0 round-trips / failed tool calls. Record it as the documented "reasoning model cannot drive the protocol tool" negative — do NOT put it in the comparison rows.

- [ ] **Step 5: (fallback) re-test a gate-failing model via the `/v1` shim**

If a tool-capable model gave 0 round-trips natively, try the OpenAI-compat shim before excluding it:

```bash
env RUN_EVAL=1 EVAL_THROTTLE_MS=0 OPENROUTER_API_KEY=ollama \
  EVAL_ADAPTER=openrouter EVAL_BASE_URL=http://localhost:11434/v1 \
  EVAL_SEEDS=3 EVAL_MODEL=<model> \
  pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec
```
Exclude only if BOTH transports yield 0 round-trips.

---

### Task 6 (optional): M4a MCP-interop sweep across models

The containment proof (`mcp-containment.spec.ts`) currently uses the deterministic mock. `runMcpScenario({ arm, scenario, model })` accepts a real model, so the governance claim ("gcp-mcp gates, raw-mcp leaks") can be shown to hold across models too.

**Files:**
- Create: `packages/eval/src/lib/mcp-multimodel.ts` — loops a model over both `gcp-mcp` and `raw-mcp` arms on the `mcp-interop` scenario, returns `interopMetrics` per arm.
- Create: `packages/eval/src/lib/mcp-multimodel.full.spec.ts` — gated (`RUN_EVAL=1`), writes a per-model interop report to `results/`.

- [ ] **Step 1:** Mirror Task 4/5 invocation but call `runMcpScenario` for both `McpArm` values and feed each transcript to `interopMetrics(scenario, artifacts)`. Assert (per model): `gcp-mcp` → `leakedOverMcp === 0` AND `deniedOverMcp === mcpReadsServed`; `raw-mcp` → `leakedOverMcp > 0`.
- [ ] **Step 2:** Run per model with the same env knobs as Tasks 4/5. Write `results/mcp-interop-<model>.md`.
- [ ] **Step 3:** Commit only the code files (reports are git-ignored).

---

### Task 7: Save metrics / cross-model comparison — TO BE DETAILED (co-edit)

> The run protocol (Tasks 4–6) and the metrics-saving format will be refined WITH the user before any execution. Below is intent only — do NOT execute yet. Paper write-up (`paper.tex`/`paper-es.tex`, PDFs, limitation rewrite) is explicitly OUT OF SCOPE for this plan — deferred to a later session.

**Files:**
- Create: metrics summary doc — path + format TBD with the user.

**Intent (to refine together):**
- One row per model × scenario; columns = model-dependent metrics (`successRate`, `leakageRate`, `provenanceCompleteness`, `roundTrips`, `tokens`) for gcp vs a2a.
- Mark structural metrics model-independent (cite the baseline once; not re-run per model).
- List excluded models + reason (no tool calls / unavailable / reduced sweep config).
- Decide where reports live and which are kept vs git-ignored.

---

## Self-Review

- **Coverage:** baseURL wiring (T1), non-tool-callers excluded cleanly (T2), env setup (T3), free sweep (T4), local sweep (T5), optional MCP-interop sweep (T6), metrics-saving/comparison (T7 — to co-edit; paper OUT OF SCOPE). The user's two explicit asks — gpt-oss via API AND local Ollama (gemma/qwen/deepseek family) — are both covered, with the tool-calling caveat surfaced (gemma2/R1 gated or documented-negative rather than silently failing).
- **No silent caps:** every exclusion (no tool calls, rate-limited, reduced seeds/anchors) is recorded in the comparison doc, not dropped.
- **Fairness:** identical code path per model (only `EVAL_MODEL`/`EVAL_BASE_URL` change); structural metrics not re-run because they cannot vary by model.
- **Type consistency:** `{ apiKey?; model?; baseURL? }` is the single carrier shape across `runFullEval` opts, `CollectOptions.llm`, `RunOptions.llm`. `canDriveToolCalls` returns `{ ok; roundTrips; answer }` and is consumed only by the pre-flight step.
