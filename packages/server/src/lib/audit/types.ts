/**
 * Audit sink for context-read provenance.
 *
 * @module audit/types
 */

import type { ReadProvenance } from "@graph-context-protocol/core";

/** A sink that records context-read authorization decisions. */
export interface AuditSink {
    /** Records a single read-provenance/audit event. */
    record(event: ReadProvenance): void | Promise<void>;
    /** Returns all recorded events in insertion order (oldest first). */
    list(): readonly ReadProvenance[];
}
