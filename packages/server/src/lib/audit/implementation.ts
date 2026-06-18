/**
 * In-memory audit sink implementation.
 *
 * @module audit/implementation
 */

import type { ReadProvenance } from "@graph-context-protocol/core";
import type { AuditSink } from "./types";

/**
 * Creates an in-memory audit sink. Records are held in insertion order and
 * returned as a defensive copy. Sufficient for tests and the M5 harness's
 * provenance-completeness metric; swap for a persistent sink when reproducible
 * logs are required.
 *
 * @returns A new in-memory AuditSink
 */
export function createInMemoryAuditSink(): AuditSink {
    const records: ReadProvenance[] = [];
    return {
        record(event: ReadProvenance): void {
            records.push(event);
        },
        list(): readonly ReadProvenance[] {
            return [...records];
        },
    };
}
