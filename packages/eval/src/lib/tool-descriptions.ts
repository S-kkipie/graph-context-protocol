/**
 * Tool-description swap (diagnostic). Each arm's per-peer tool carries
 * protocol-specific wording ("...over the Graph Context Protocol" vs
 * "...via an A2A message"). `swapped` gives every arm the OTHER protocol's
 * wording while keeping behavior, names and schemas, so a difference in model
 * outcomes that follows the wording rather than the arm is attributable to it.
 *
 * @module tool-descriptions
 */

import {
    createCouplingMetrics,
    type PeerContextToolFactory,
} from "@graph-context-protocol/agent-core";
import { createA2aPeerContextToolFactory } from "@graph-context-protocol/baseline";
import { createGcpPeerContextToolFactory } from "@graph-context-protocol/scenario";

export type ToolDescriptions = "native" | "swapped";

/** Returns `base` with each tool's description replaced by `donor`'s for the same peer. */
export function withDescriptionsFrom(
    base: PeerContextToolFactory,
    donor: PeerContextToolFactory,
): PeerContextToolFactory {
    return (peer, metrics) => {
        const tool = base(peer, metrics);
        tool.description = donor(peer, createCouplingMetrics()).description;
        return tool;
    };
}

/** Applies the variant for an arm; `native` returns `base` unchanged. */
export function applyToolDescriptions(
    variant: ToolDescriptions | undefined,
    arm: "gcp" | "a2a" | "a2a-pep",
    base: PeerContextToolFactory,
): PeerContextToolFactory {
    if (variant !== "swapped") return base;
    return withDescriptionsFrom(
        base,
        arm === "gcp"
            ? createA2aPeerContextToolFactory()
            : createGcpPeerContextToolFactory(),
    );
}
