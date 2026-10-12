/**
 * Diagnostic report for the empty-final-answer finding: per directory (variant),
 * scenario and arm, prints runs, task success, runs whose final answer is
 * empty ("" or "[]"), and runs whose answer is a pseudo tool call. Used to decide whether tool-description wording explains
 * the gcp-arm failures of gemini-2.5-flash-lite.
 *
 * Usage: pnpm tsx packages/eval/scripts/empty-answers.ts \
 *            --model gemini-2.5-flash-lite --dirs docs/eval/swap/native,docs/eval/swap/swapped
 */

import { resolve } from "node:path";
import { readAllRecords } from "../src/lib/raw-log";
import { wilson } from "../src/lib/stats";

function flag(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}
const model = flag("model") ?? "gemini-2.5-flash-lite";
const dirs = (
    flag("dirs") ?? "docs/eval/raw,docs/eval/swap/native,docs/eval/swap/swapped"
).split(",");
const isEmpty = (a: string) => ["", "[]"].includes(a.trim());
// Answers that are pseudo tool calls instead of prose (observed for llama3.1:8b).
const isToolCallShaped = (a: string) => /^\s*(#\s*)?tool[ _-]?call/i.test(a);

const lines = [
    `# Empty-final-answer diagnostic (${model})`,
    "",
    "| variant | scenario | arm | runs | success [95% CI] | empty answers | empty among failures | tool-call-shaped answers |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
];
for (const dir of dirs) {
    const recs = readAllRecords(resolve(dir)).filter(
        (r) => r.model === model && r.result,
    );
    const keys = [...new Set(recs.map((r) => `${r.scenario}|${r.arm}`))].sort();
    for (const k of keys) {
        const [scenario, arm] = k.split("|");
        const rs = recs.filter((r) => r.scenario === scenario && r.arm === arm);
        const succ = rs.filter((r) => r.result?.behavioral.taskSuccess).length;
        const empty = rs.filter((r) =>
            isEmpty(r.result?.trace?.answer ?? ""),
        ).length;
        const failed = rs.filter((r) => !r.result?.behavioral.taskSuccess);
        const emptyFailed = failed.filter((r) =>
            isEmpty(r.result?.trace?.answer ?? ""),
        ).length;
        const shaped = rs.filter((r) =>
            isToolCallShaped(r.result?.trace?.answer ?? ""),
        ).length;
        const ci = wilson(succ, rs.length);
        lines.push(
            `| ${dir} | ${scenario} | ${arm} | ${rs.length} | ${succ}/${rs.length} [${(100 * ci.lo).toFixed(0)}%-${(100 * ci.hi).toFixed(0)}%] | ${empty}/${rs.length} | ${emptyFailed}/${failed.length} | ${shaped}/${rs.length} |`,
        );
    }
}
console.log(lines.join("\n"));
