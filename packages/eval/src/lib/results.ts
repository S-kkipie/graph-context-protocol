/**
 * Results model + aggregation + markdown rendering. Behavioral metrics are
 * aggregated across seeds as mean±stdev (LLM nondeterminism); structural
 * metrics are exact.
 *
 * @module results
 */

import type { LeakageMetrics } from "./canary";
import type { Arm } from "./runner";
import type { StructuralMetrics } from "./topology";

export interface BehavioralSample {
    readonly messages: number;
    readonly connections: number;
    readonly tokens: number;
    readonly roundTrips: number;
    readonly latencyMs: number;
    readonly taskSuccess: boolean;
}

export interface MetricsResult {
    readonly scenarioId: string;
    readonly arm: Arm;
    readonly n: number;
    readonly seed: number;
    readonly structural: StructuralMetrics;
    readonly behavioral: BehavioralSample;
    readonly leakage: LeakageMetrics;
    readonly provenance: number;
}

export interface Aggregate {
    readonly mean: number;
    readonly stdev: number;
    readonly n: number;
}

const NUMERIC_FIELDS = [
    "messages",
    "connections",
    "tokens",
    "roundTrips",
    "latencyMs",
] as const;

function agg(values: number[]): Aggregate {
    const n = values.length;
    if (n === 0) return { mean: 0, stdev: 0, n: 0 };
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    return { mean, stdev: Math.sqrt(variance), n };
}

/** Per numeric behavioral field, mean±stdev across the given results. */
export function aggregateBehavioral(
    results: MetricsResult[],
): Record<string, Aggregate> {
    const out: Record<string, Aggregate> = {};
    for (const field of NUMERIC_FIELDS) {
        out[field] = agg(results.map((r) => r.behavioral[field]));
    }
    out.successRate = agg(
        results.map((r) => (r.behavioral.taskSuccess ? 1 : 0)),
    );
    return out;
}

/** Renders a GCP-vs-A2A markdown comparison table for one scenario. */
export function renderTable(
    scenarioId: string,
    results: MetricsResult[],
): string {
    const byArm = (arm: Arm) => results.filter((r) => r.arm === arm);
    const lines: string[] = [];
    lines.push(`### ${scenarioId}`);
    lines.push("");
    lines.push("| metric | gcp | a2a |");
    lines.push("| --- | --- | --- |");
    const fmt = (a: Aggregate) =>
        a.n > 1
            ? `${a.mean.toFixed(1)} ± ${a.stdev.toFixed(1)}`
            : `${a.mean.toFixed(1)}`;
    const gcpAgg = aggregateBehavioral(byArm("gcp"));
    const a2aAgg = aggregateBehavioral(byArm("a2a"));
    for (const field of [...NUMERIC_FIELDS, "successRate"]) {
        lines.push(
            `| ${field} | ${fmt(gcpAgg[field])} | ${fmt(a2aAgg[field])} |`,
        );
    }
    const struct = (arm: Arm) => byArm(arm)[0]?.structural;
    lines.push(
        `| pairwiseConnections (struct) | ${struct("gcp")?.pairwiseConnections ?? "-"} | ${struct("a2a")?.pairwiseConnections ?? "-"} |`,
    );
    lines.push(
        `| integrationEffort (struct) | ${struct("gcp")?.integrationEffort ?? "-"} | ${struct("a2a")?.integrationEffort ?? "-"} |`,
    );
    const leak = (arm: Arm) => byArm(arm)[0]?.leakage.leakageRate ?? 0;
    lines.push(`| leakageRate | ${leak("gcp")} | ${leak("a2a")} |`);
    const prov = (arm: Arm) => byArm(arm)[0]?.provenance ?? 0;
    lines.push(`| provenanceCompleteness | ${prov("gcp")} | ${prov("a2a")} |`);
    lines.push("");
    return lines.join("\n");
}
