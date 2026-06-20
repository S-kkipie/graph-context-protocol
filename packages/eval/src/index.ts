export type { TokenCounter } from "./lib/behavioral";
export { createTokenCountingModel, taskSuccess } from "./lib/behavioral";
export type { LeakageMetrics } from "./lib/canary";
export { detectLeaks } from "./lib/canary";
export { provenanceCompleteness } from "./lib/provenance";
export type {
    Aggregate,
    BehavioralSample,
    MetricsResult,
} from "./lib/results";
export { aggregateBehavioral, renderTable } from "./lib/results";
export type { Arm, RunArtifacts, RunOptions } from "./lib/runner";
export { runScenario } from "./lib/runner";
export type { StructuralMetrics } from "./lib/topology";
export { structuralMetrics } from "./lib/topology";
