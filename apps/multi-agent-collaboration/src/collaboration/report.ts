/**
 * Report renderer - converts scenario results to readable output.
 * @module collaboration/report
 */

import type { ScenarioResult, ReportOutput } from "./types";

/** Renders the agent graph section */
function renderAgentGraph(result: ScenarioResult): string {
    const agents = Array.from(result.graph.nodes.keys());

    return [
        "## Agent Graph",
        "",
        "```",
        "Planner → Researcher → Writer → Reviewer",
        "   ↑                      |",
        "   └──────────────────────┘",
        "```",
        "",
        "### Agents",
        ...agents.map(
            (agent) =>
                `- **${agent.charAt(0).toUpperCase() + agent.slice(1)}**: ${getAgentDescription(agent)}`,
        ),
    ].join("\n");
}

/** Gets description for an agent */
function getAgentDescription(agent: string): string {
    const descriptions: Record<string, string> = {
        planner: "Plans tasks and defines goals",
        researcher: "Gathers information and findings",
        writer: "Creates content based on research",
        reviewer: "Reviews and provides feedback",
    };
    return descriptions[agent] ?? "Unknown agent";
}

/** Renders the context flow section */
function renderContextFlow(result: ScenarioResult): string {
    const lines = ["## Context Flow", ""];

    for (const prop of result.propagations) {
        const status = prop.success ? "✓" : "✗";
        const from = prop.from.charAt(0).toUpperCase() + prop.from.slice(1);
        const to = prop.to.charAt(0).toUpperCase() + prop.to.slice(1);

        lines.push(`### ${from} → ${to} ${status}`);
        lines.push("");

        if (prop.excludedKeys.length > 0) {
            lines.push(`**Filtered out:** ${prop.excludedKeys.join(", ")}`);
            lines.push("");
        }

        const dataKeys = Object.keys(prop.filteredData);
        if (dataKeys.length > 0) {
            lines.push("**Propagated keys:**");
            for (const key of dataKeys) {
                lines.push(`- \`${key}\``);
            }
            lines.push("");
        }
    }

    return lines.join("\n");
}

/** Renders the provenance trace section */
function renderProvenanceTrace(result: ScenarioResult): string {
    const lines = ["## Provenance Trace", ""];

    for (let i = 0; i < result.traces.length; i++) {
        const trace = result.traces[i];
        const from = trace.from.charAt(0).toUpperCase() + trace.from.slice(1);
        const to = trace.to.charAt(0).toUpperCase() + trace.to.slice(1);

        lines.push(`${i + 1}. **${from}** → **${to}**`);
        lines.push(`   - Message: \`${trace.messageId}\``);
        lines.push(
            `   - Provenance: ${trace.provenance.join(" → ") || "(start)"}`,
        );
        lines.push("");
    }

    return lines.join("\n");
}

/** Renders the final state section */
function renderFinalState(result: ScenarioResult): string {
    const lines = ["## Final State", ""];

    if (result.finalContext) {
        lines.push("**Final context data:**");
        lines.push("");

        const data = result.finalContext.accumulatedData;
        for (const [key, value] of Object.entries(data)) {
            const displayValue =
                typeof value === "string" && value.length > 50
                    ? value.slice(0, 50) + "..."
                    : String(value);
            lines.push(`- \`${key}\`: ${displayValue}`);
        }
    } else {
        lines.push("*No final context (workflow failed)*");
    }

    lines.push("");
    lines.push("**Statistics:**");
    lines.push(`- Total steps: ${result.steps.length}`);
    lines.push(
        `- Successful propagations: ${result.propagations.filter((p) => p.success).length}/${result.propagations.length}`,
    );
    lines.push(`- Messages exchanged: ${result.messages.length}`);

    return lines.join("\n");
}

/** Renders a complete scenario report */
export function renderScenarioReport(result: ScenarioResult): string {
    const output: ReportOutput = {
        title: "# Multi-Agent Collaboration Demo",
        summary:
            "This demo shows how context propagates through a workflow of AI agents using the Graph Context Protocol.",
        agentGraph: renderAgentGraph(result),
        contextFlow: renderContextFlow(result),
        provenanceTrace: renderProvenanceTrace(result),
        finalState: renderFinalState(result),
    };

    return [
        output.title,
        "",
        output.summary,
        "",
        output.agentGraph,
        "",
        output.contextFlow,
        "",
        output.provenanceTrace,
        "",
        output.finalState,
    ].join("\n");
}
