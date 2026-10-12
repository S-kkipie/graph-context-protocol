/**
 * Per-run raw log (JSONL). Every (model, scenario, arm, seed) run is appended
 * as ONE line the moment it finishes, so an interrupted sweep loses nothing and
 * can be resumed, and the paper's tables can be recomputed from the raw runs
 * instead of from pre-aggregated means. Failed runs are logged too (with
 * `error`), so denominators are never silently shrunk.
 *
 * @module raw-log
 */

import {
    appendFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { MetricsResult } from "./results";

export interface RawRecord {
    readonly model: string;
    readonly adapter: string;
    readonly scenario: string;
    readonly arm: string;
    readonly seed: number;
    /** ISO time the run finished. */
    readonly at: string;
    readonly durationMs: number;
    /** Diagnostic tool-wording variant; absent means native. */
    readonly toolDescriptions?: string;
    /** Set when all retries failed; `result` is then absent. */
    readonly error?: string;
    readonly result?: MetricsResult;
}

export function recordKey(r: {
    model: string;
    scenario: string;
    arm: string;
    seed: number;
}): string {
    return `${r.model}|${r.scenario}|${r.arm}|${r.seed}`;
}

export function appendRecord(file: string, rec: RawRecord): void {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(rec)}\n`, "utf8");
}

export function readRecords(file: string): RawRecord[] {
    if (!existsSync(file)) return [];
    return readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as RawRecord);
}

/** Reads every `*.jsonl` in a directory (non-recursive). */
export function readAllRecords(dir: string): RawRecord[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((f) => f.endsWith(".jsonl"))
        .flatMap((f) => readRecords(join(dir, f)));
}

/** Keys of runs that already succeeded (used by --resume to skip them). */
export function completedKeys(records: readonly RawRecord[]): Set<string> {
    return new Set(
        records.filter((r) => r.result !== undefined).map((r) => recordKey(r)),
    );
}
