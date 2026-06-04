import type { GraphContextServer } from "@graph-context-protocol/server";
import { z } from "zod";
import { type GcpNodeConfig, GcpNodeConfigSchema } from "./config";
import { createGcpNode } from "./gcp-node";

/** A set of GCP nodes to launch together. */
export const NodeManifestSchema = z.object({
    nodes: z.array(GcpNodeConfigSchema).min(1),
});

/** Input accepted by `runManifest` (defaults applied during parse). */
export type NodeManifestInput = z.input<typeof NodeManifestSchema>;

/** A node after it has been built and started. */
export interface LaunchedNode {
    readonly config: GcpNodeConfig;
    readonly server: GraphContextServer;
}

/** Builds and starts the already-validated nodes. */
async function launchNodes(nodes: GcpNodeConfig[]): Promise<LaunchedNode[]> {
    const launched: LaunchedNode[] = [];
    for (const node of nodes) {
        const server = await createGcpNode(node);
        launched.push({ config: node, server });
    }
    return launched;
}

/**
 * Builds and starts every node in the manifest. Decoupled from Next.js so
 * later milestones (M3/M5) can launch many nodes headless.
 *
 * Validation runs synchronously (`NodeManifestSchema.parse`) before any async
 * work begins, so an invalid manifest (e.g. an empty `nodes` array) throws at
 * call time rather than rejecting a promise — `runManifest` is a sync function
 * that returns the launch promise, so `expect(() => runManifest(...)).toThrow()`
 * observes the validation error. (A `throw` inside an `async` function body
 * would instead surface as a rejected promise, which `.toThrow()` cannot catch.)
 */
export function runManifest(
    manifest: NodeManifestInput,
): Promise<LaunchedNode[]> {
    const parsed = NodeManifestSchema.parse(manifest);
    return launchNodes(parsed.nodes);
}
