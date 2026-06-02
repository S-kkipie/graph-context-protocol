/**
 * Markdown-file knowledge source adapter.
 *
 * Reads a `.md` file from disk and exposes its text as a single knowledge
 * node. The adapter `id` MUST equal the knowledge node id it backs, because
 * the server resolves adapters by `targetNodeId`.
 *
 * @module lib/markdown-adapter
 */

import { readFile } from "node:fs/promises";
import {
    createKnowledgeNode,
    createRole,
    fail,
    type RoleDefinition,
    succeed,
} from "@graph-context-protocol/core";
import {
    createServerError,
    type KnowledgeSourceAdapter,
} from "@graph-context-protocol/server";

/**
 * Configuration for {@link createMarkdownKnowledgeAdapter}.
 */
export interface MarkdownKnowledgeAdapterConfig {
    /** Adapter id — MUST equal the backed knowledge node id. */
    readonly id: string;
    /** Absolute path to the markdown file to read. */
    readonly filePath: string;
    /** Role assigned to the produced knowledge node. */
    readonly role?: RoleDefinition;
}

const DEFAULT_ROLE = createRole(
    "role:markdown-source",
    "Markdown Source",
    "Read-only markdown knowledge source",
);

/**
 * Creates a KnowledgeSourceAdapter backed by a single markdown file.
 */
export function createMarkdownKnowledgeAdapter(
    config: MarkdownKnowledgeAdapterConfig,
): KnowledgeSourceAdapter {
    const role = config.role ?? DEFAULT_ROLE;

    return {
        id: config.id,
        capabilities: ["lookup", "search"],

        async query() {
            try {
                const text = await readFile(config.filePath, "utf8");
                const node = createKnowledgeNode(config.id, role, {
                    contentType: "text/markdown",
                    content: text,
                });
                return succeed({
                    sourceId: config.id,
                    nodes: [node],
                    raw: text,
                    metadata: { sourceOfTruth: config.filePath },
                });
            } catch (cause) {
                return fail(
                    createServerError(
                        "not-found",
                        `Cannot read markdown file: ${config.filePath}`,
                        { metadata: { cause: String(cause) } },
                    ),
                );
            }
        },
    };
}
