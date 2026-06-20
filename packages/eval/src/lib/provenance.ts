/**
 * Provenance-completeness metric: fraction of read decisions that produced an
 * audit record. GCP wires an AuditSink (→ ~1.0); A2A has none (→ 0).
 *
 * @module provenance
 */

import type { RunArtifacts } from "./runner";

/** auditEvents / readDecisions, clamped to [0,1]; 0 decisions → 1 (vacuous). */
export function provenanceCompleteness(
    artifacts: RunArtifacts,
    readDecisions: number,
): number {
    if (readDecisions <= 0) return 1;
    return Math.min(1, artifacts.auditEvents.length / readDecisions);
}
