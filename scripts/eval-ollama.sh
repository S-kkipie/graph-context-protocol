#!/usr/bin/env bash
#
# eval-ollama.sh — install Ollama + pull the local models used by the
# multi-model evaluation runbook
# (docs/superpowers/specs/2026-06-22-multi-model-eval-runbook.md).
#
# Nothing runs without an explicit flag. Install + pulls are idempotent.
# Target hardware: RTX 3050 6 GB VRAM + 24 GB host RAM (WSL2). Models >~6 GB
# spill to CPU (slower but fine on 24 GB).
#
# Usage:
#   scripts/eval-ollama.sh [flags]
#
# Flags:
#   --install        Install Ollama (curl https://ollama.com/install.sh | sh)
#   --serve          Start `ollama serve` in the background if not already up
#   --small          Pull small/medium models (fit-ish on 6 GB GPU)
#   --heavy          Pull heavy models (>6 GB → partial/mostly CPU, reduced sweep)
#   --negative       Pull the reasoning negative-control model (deepseek-r1:7b)
#   --all            --install --serve --small --heavy --negative
#   --list           `ollama list`
#   --check          Probe native (:11434/api/tags) + OpenAI-compat (/v1/models)
#   --gpu            Show GPU via nvidia-smi
#   --dry-run        Print what would run; do nothing
#   -h | --help      This help
#
# Examples:
#   scripts/eval-ollama.sh --install --serve --small      # get going fast
#   scripts/eval-ollama.sh --all                          # everything
#   scripts/eval-ollama.sh --check --gpu                  # verify env
#
set -euo pipefail

OLLAMA_HOST_URL="${OLLAMA_HOST:-http://localhost:11434}"

# Model sets — keep in sync with the runbook §2 matrix.
SMALL_MODELS=(qwen3:4b llama3.1:8b granite3.3:8b gemma4:12b)
HEAVY_MODELS=(qwen2.5:32b command-r:35b gemma4:26b)
NEGATIVE_MODELS=(deepseek-r1:7b)

DO_INSTALL=0 DO_SERVE=0 DO_SMALL=0 DO_HEAVY=0 DO_NEGATIVE=0
DO_LIST=0 DO_CHECK=0 DO_GPU=0 DRY_RUN=0

log()  { printf '\033[1;34m[eval-ollama]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[eval-ollama] WARN:\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31m[eval-ollama] ERROR:\033[0m %s\n' "$*" >&2; }

run() {
    if [[ "$DRY_RUN" == 1 ]]; then
        printf '  + %s\n' "$*"
    else
        "$@"
    fi
}

usage() { sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; }

have_ollama() { command -v ollama >/dev/null 2>&1; }

server_up() { curl -fsS "${OLLAMA_HOST_URL}/api/tags" >/dev/null 2>&1; }

install_ollama() {
    if have_ollama; then
        log "Ollama already installed: $(ollama --version 2>/dev/null || echo unknown)"
        return 0
    fi
    log "Installing Ollama (curl https://ollama.com/install.sh | sh)"
    if [[ "$DRY_RUN" == 1 ]]; then
        printf '  + curl -fsSL https://ollama.com/install.sh | sh\n'
        return 0
    fi
    curl -fsSL https://ollama.com/install.sh | sh
    have_ollama || { err "install finished but 'ollama' not on PATH"; return 1; }
    log "Installed: $(ollama --version 2>/dev/null || echo unknown)"
}

serve_ollama() {
    if server_up; then
        log "Ollama server already up at ${OLLAMA_HOST_URL}"
        return 0
    fi
    if [[ "$DRY_RUN" == 1 ]]; then
        printf '  + nohup ollama serve >/tmp/ollama-serve.log 2>&1 &\n'
        return 0
    fi
    have_ollama || { err "Ollama not installed — run with --install first"; return 1; }
    log "Starting 'ollama serve' in background (logs: /tmp/ollama-serve.log)"
    nohup ollama serve >/tmp/ollama-serve.log 2>&1 &
    for _ in $(seq 1 30); do
        server_up && { log "Server is up."; return 0; }
        sleep 1
    done
    err "server did not come up within 30s — check /tmp/ollama-serve.log"
    return 1
}

pull_set() {
    local label="$1"; shift
    if [[ "$DRY_RUN" != 1 ]]; then
        have_ollama || { err "Ollama not installed — run with --install first"; return 1; }
        server_up || warn "server not detected at ${OLLAMA_HOST_URL}; 'ollama pull' may auto-start it"
    fi
    log "Pulling ${label} models: $*"
    local m
    for m in "$@"; do
        log "  → $m"
        run ollama pull "$m"
    done
}

check_endpoints() {
    log "Native API   ${OLLAMA_HOST_URL}/api/tags"
    curl -fsS "${OLLAMA_HOST_URL}/api/tags" 2>/dev/null | head -c 600 || warn "native API not responding"
    printf '\n'
    log "OpenAI-compat ${OLLAMA_HOST_URL}/v1/models"
    curl -fsS "${OLLAMA_HOST_URL}/v1/models" 2>/dev/null | head -c 600 || warn "/v1 shim not responding"
    printf '\n'
}

gpu_info() {
    if command -v nvidia-smi >/dev/null 2>&1; then
        nvidia-smi -L || true
        nvidia-smi --query-gpu=memory.used,memory.total --format=csv 2>/dev/null || true
    else
        warn "nvidia-smi not found (CPU-only or GPU passthrough missing)"
    fi
}

[[ $# -eq 0 ]] && { usage; exit 0; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --install)  DO_INSTALL=1 ;;
        --serve)    DO_SERVE=1 ;;
        --small)    DO_SMALL=1 ;;
        --heavy)    DO_HEAVY=1 ;;
        --negative) DO_NEGATIVE=1 ;;
        --all)      DO_INSTALL=1; DO_SERVE=1; DO_SMALL=1; DO_HEAVY=1; DO_NEGATIVE=1 ;;
        --list)     DO_LIST=1 ;;
        --check)    DO_CHECK=1 ;;
        --gpu)      DO_GPU=1 ;;
        --dry-run)  DRY_RUN=1 ;;
        -h|--help)  usage; exit 0 ;;
        *)          err "unknown flag: $1"; usage; exit 2 ;;
    esac
    shift
done

[[ "$DRY_RUN" == 1 ]] && log "DRY RUN — no changes will be made"

[[ "$DO_INSTALL"  == 1 ]] && install_ollama
[[ "$DO_SERVE"    == 1 ]] && serve_ollama
[[ "$DO_GPU"      == 1 ]] && gpu_info
[[ "$DO_SMALL"    == 1 ]] && pull_set "small/medium" "${SMALL_MODELS[@]}"
[[ "$DO_HEAVY"    == 1 ]] && pull_set "heavy" "${HEAVY_MODELS[@]}"
[[ "$DO_NEGATIVE" == 1 ]] && pull_set "negative-control" "${NEGATIVE_MODELS[@]}"
[[ "$DO_LIST"     == 1 ]] && { log "Installed models:"; run ollama list; }
[[ "$DO_CHECK"    == 1 ]] && check_endpoints

log "Done."
