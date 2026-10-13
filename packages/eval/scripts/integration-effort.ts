/**
 * Integration-effort proxy tables for the paper (no model, no network).
 * Writes docs/eval/integration-effort.md.
 *
 * Usage: pnpm tsx packages/eval/scripts/integration-effort.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    onboardingCost,
    policyHolders,
    ruleChangeCost,
    STYLES,
    totalEntries,
} from "../src/lib/integration-effort";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const out = join(root, "docs", "eval", "integration-effort.md");

const NAMES: Record<string, string> = {
    "gcp-hub": "GCP (one server, one query tool)",
    "a2a-mesh": "A2A base, mesh (one tool per peer)",
    "a2a-hub": "A2A base, registry (one send-task tool)",
    "a2a-pep-mesh": "A2A+PEP, mesh",
    "a2a-pep-hub": "A2A+PEP, registry",
};

/** Source lines of the enforcement layer a deployer writes to gate A2A. */
function codeLines(path: string): number {
    const src = readFileSync(path, "utf8");
    let inBlock = false;
    let n = 0;
    for (const raw of src.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        if (inBlock) {
            if (line.includes("*/")) inBlock = false;
            continue;
        }
        if (line.startsWith("/*")) {
            if (!line.includes("*/")) inBlock = true;
            continue;
        }
        if (line.startsWith("//") || line.startsWith("*")) continue;
        n++;
    }
    return n;
}

const lines: string[] = [
    "# Integration-effort proxy (deterministic)",
    "",
    "Declarations a deployer authors (one entry per endpoint, card, policy, credential, peer binding, ...).",
    "",
    "## Onboarding participant n+1",
    "",
    "| style | n | entries added | existing artifacts edited | new artifacts |",
    "| --- | --- | --- | --- | --- |",
];
for (const v of STYLES) {
    for (const n of [10, 50]) {
        const c = onboardingCost(v, n);
        lines.push(
            `| ${NAMES[v]} | ${n} | ${c.entriesAdded} | ${c.existingArtifactsTouched} | ${c.newArtifacts} |`,
        );
    }
}
lines.push(
    "",
    "## Changing which roles may read one node, and totals",
    "",
    "| style | rule change (n=10) | artifacts holding a policy (n=10) | total declarations n=10 | n=50 |",
    "| --- | --- | --- | --- | --- |",
);
for (const v of STYLES) {
    const r = ruleChangeCost(v, 10);
    lines.push(
        `| ${NAMES[v]} | ${r.expressible ? `${r.entriesEdited} entry in ${r.artifactsEdited} artifact` : "not expressible"} | ${policyHolders(v, 10)} | ${totalEntries(v, 10)} | ${totalEntries(v, 50)} |`,
    );
}
const pep = codeLines(
    join(root, "packages", "baseline", "src", "lib", "policy-enforcement.ts"),
);
lines.push(
    "",
    `Enforcement layer written for the A2A+PEP arm: ${pep} source lines (policy-enforcement.ts, comments and blanks excluded).`,
    "",
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n"), "utf8");
console.log(lines.join("\n"));
