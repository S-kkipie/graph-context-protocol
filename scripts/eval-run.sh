#!/usr/bin/env bash
#
# eval-run.sh — guided single-model GCP-vs-A2A evaluation run.
#
# Wraps the three manual steps of the runbook into ONE command: tool-call
# pre-flight (§3a) → full eval (§3b/§3c) → surface the report's headline rows
# (discovery curve, runtime parity, delegation containment). Adapter is inferred
# from the model id: a hosted OpenRouter id contains "/" (e.g.
# `openai/gpt-oss-120b:free`); a bare tag (e.g. `qwen3:4b`) is local Ollama.
#
# Companion runbook:
#   docs/superpowers/specs/2026-06-22-multi-model-eval-runbook.md
#
# Usage:
#   scripts/eval-run.sh <model> [seeds] [anchors]
#
# Examples:
#   scripts/eval-run.sh qwen3:4b                    # local, default sweep
#   scripts/eval-run.sh qwen3:4b 15 2,4,8,16,32     # 15 seeds, full curve
#   scripts/eval-run.sh openai/gpt-oss-120b:free 5  # hosted (OpenRouter)
#
# Flags:
#   --no-preflight   skip the tool-call sanity check (§3a)
#   --dry-run        print the commands; run nothing
#   -h | --help      this help
#
# Env overrides (win over inference): EVAL_ADAPTER, EVAL_BASE_URL, EVAL_SEEDS,
# EVAL_ANCHORS, EVAL_THROTTLE_MS. Hosted runs read OPENROUTER_API_KEY from
# .env.local if present.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=0
PREFLIGHT=1
POSITIONAL=()

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-preflight) PREFLIGHT=0 ;;
    -h|--help) sed -n '2,33p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --*) echo "unknown flag: $arg" >&2; exit 2 ;;
    *) POSITIONAL+=("$arg") ;;
  esac
done

MODEL="${POSITIONAL[0]:-}"
if [[ -z "$MODEL" ]]; then
  echo "error: model id required. Try: scripts/eval-run.sh qwen3:4b" >&2
  exit 2
fi
SEEDS="${POSITIONAL[1]:-${EVAL_SEEDS:-5}}"
ANCHORS="${POSITIONAL[2]:-${EVAL_ANCHORS:-2,4,8,16,32}}"

# Infer adapter from the model id unless EVAL_ADAPTER is set explicitly.
if [[ -n "${EVAL_ADAPTER:-}" ]]; then
  ADAPTER="$EVAL_ADAPTER"
elif [[ "$MODEL" == */* ]]; then
  ADAPTER="openrouter"
else
  ADAPTER="ollama"
fi

run() { # echo + (unless dry-run) exec a command line given as a single string
  echo "+ $1"
  [[ "$DRY_RUN" -eq 1 ]] && return 0
  eval "$1"
}

# Assemble the env prefix shared by pre-flight and the full run. The API key is
# EXPORTED into the environment (never inlined into ENV_PREFIX) so it is never
# echoed by `run()`. Child processes inherit it.
if [[ "$ADAPTER" == "ollama" ]]; then
  BASE_URL="${EVAL_BASE_URL:-http://localhost:11434}"
  export OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-ollama}" # gate-only; ollama ignores it
  THROTTLE="${EVAL_THROTTLE_MS:-0}"
  ENV_PREFIX="EVAL_ADAPTER=ollama EVAL_BASE_URL=$BASE_URL EVAL_THROTTLE_MS=$THROTTLE"
else
  if [[ -f .env.local ]]; then
    set -a; # shellcheck disable=SC1091
    source .env.local; set +a
  fi
  if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
    echo "error: OPENROUTER_API_KEY unset (needed for hosted model '$MODEL')." >&2
    echo "       put it in .env.local or export it, or use a local Ollama tag." >&2
    exit 2
  fi
  export OPENROUTER_API_KEY
  THROTTLE="${EVAL_THROTTLE_MS:-4000}"
  ENV_PREFIX="EVAL_ADAPTER=openrouter EVAL_THROTTLE_MS=$THROTTLE"
fi

echo "── eval-run ─────────────────────────────────────────────"
echo "  model:   $MODEL"
echo "  adapter: $ADAPTER"
echo "  seeds:   $SEEDS"
echo "  anchors: $ANCHORS"
echo "─────────────────────────────────────────────────────────"

# 1. Pre-flight: a model that drives 0 tool calls yields meaningless behavioral
#    metrics. Stop early instead of writing a junk report.
if [[ "$PREFLIGHT" -eq 1 ]]; then
  echo "[1/2] pre-flight — can the model drive tool calls?"
  PF="import {canDriveToolCalls} from './packages/eval/src/lib/toolcall-sanity'; import {createEvalModel} from './packages/eval/src/lib/model-factory'; canDriveToolCalls({model: createEvalModel({apiKey: process.env.OPENROUTER_API_KEY, model:'$MODEL'})}).then(r=>{console.log(JSON.stringify(r)); process.exit(r.ok?0:1)})"
  if ! run "$ENV_PREFIX EVAL_MODEL=$MODEL pnpm tsx -e \"$PF\""; then
    echo "pre-flight FAILED: '$MODEL' did not drive a tool call." >&2
    echo "exclude it (log the reason), or re-run with --no-preflight to force." >&2
    [[ "$DRY_RUN" -eq 1 ]] || exit 1
  fi
fi

# 2. Full eval — writes packages/eval/results/eval-report-<stamp>-<model>.md
echo "[2/2] full eval — ${SEEDS} seeds, anchors ${ANCHORS}"
run "$ENV_PREFIX RUN_EVAL=1 EVAL_SEEDS=$SEEDS EVAL_ANCHORS=$ANCHORS EVAL_MODEL=$MODEL pnpm nx test @graph-context-protocol/eval -- run-eval.full.spec"

[[ "$DRY_RUN" -eq 1 ]] && exit 0

# Surface the headline rows so the result is visible without opening the file.
REPORT="$(ls -t packages/eval/results/eval-report-*.md 2>/dev/null | head -1 || true)"
if [[ -n "$REPORT" ]]; then
  echo "─────────────────────────────────────────────────────────"
  echo "report: $REPORT"
  echo "── scaling (discovery O(1) vs O(N), tokens at parity) ──"
  sed -n '/marketplace scaling/,/^$/p' "$REPORT" || true
  echo "── containment (delegation safety; read THIS not successRate) ──"
  grep -E "^\| containmentRate " "$REPORT" || echo "  (no delegation table in this report)"
fi
