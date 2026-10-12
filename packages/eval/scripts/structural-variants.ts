/**
 * Deterministic topology-variant tables for the paper (no model, no network):
 * integration edges (A2A mesh vs A2A hub vs GCP hub) and tool-prompt tokens
 * (A2A per-peer tools vs A2A single generic tool vs GCP single query tool).
 * Writes docs/eval/structural-variants.md.
 *
 * Usage: pnpm tsx packages/eval/scripts/structural-variants.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { edgeVariants, toolPromptVariants } from "../src/lib/topology-variants";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(
    here,
    "..",
    "..",
    "..",
    "docs",
    "eval",
    "structural-variants.md",
);

const lines: string[] = [
    "# Structural topology variants (deterministic)",
    "",
    "## Integration edges (directed)",
    "",
    "| n | A2A mesh n(n-1) | A2A via hub/registry (n) | GCP hub (n) |",
    "| --- | --- | --- | --- |",
];
for (const n of [2, 3, 5, 10, 20, 50]) {
    const e = edgeVariants(n);
    lines.push(`| ${n} | ${e.a2aMesh} | ${e.a2aHub} | ${e.gcpHub} |`);
}
lines.push(
    "",
    "## Per-request tool-prompt tokens",
    "",
    "| n | A2A per-peer tools | A2A single generic tool | GCP single query tool |",
    "| --- | --- | --- | --- |",
);
for (const n of [2, 4, 8, 16, 32]) {
    const t = toolPromptVariants(n);
    lines.push(
        `| ${n} | ${t.a2aPerPeer} | ${t.a2aSingleTool} | ${t.gcpSingleTool} |`,
    );
}
lines.push("");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n"), "utf8");
console.log(lines.join("\n"));
