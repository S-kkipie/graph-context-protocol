import type { ScenarioResult } from "./types";

export function renderScenarioReport(result: ScenarioResult): string {
    const startStatus = result.serverStart.success
        ? result.serverStart.data.status
        : "failed";
    const stopStatus = result.serverStop.success
        ? result.serverStop.data.status
        : "failed";
    const localHandled = result.localHandle.success
        ? (result.localHandle.data as { handled: boolean }).handled
        : false;
    const externalDelivered = result.externalDelivery.success
        ? result.externalDelivery.data.delivered
        : false;
    const knowledgeSourceId = result.knowledgeResults.success
        ? (result.knowledgeResults.data[0]?.sourceId ?? "none")
        : "error";

    return [
        "Server Demo Report",
        "==================",
        `Server ID: server:demo`,
        `Local Node: agent:server`,
        `Start Status: ${startStatus}`,
        `Stop Status: ${stopStatus}`,
        "",
        "Transports:",
        "- transport:memory",
        "",
        "Handler Result:",
        `- handled: ${localHandled}`,
        "",
        "External Agent Delivery:",
        `- delivered: ${externalDelivered}`,
        `- transport: transport:memory`,
        "",
        "Knowledge Result:",
        `- source: ${knowledgeSourceId}`,
    ].join("\n");
}
