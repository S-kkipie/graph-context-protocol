/**
 * Substrate-neutral scenario definitions — what is held FIXED across both
 * arms (node graph, roles, policies, agent goal, success predicate, canary
 * placement). The GCP arm uses `readableByRoles`; the A2A arm uses
 * `exposedSkills`. Both arms run the same `agent` goal and `succeeded`.
 *
 * @module scenarios/types
 */

/** The single A2A skill a consuming agent requests from a provider. */
export const PROVIDE_CONTEXT_SKILL = "provide-context";

export type ScenarioId =
    | "marketplace"
    | "software-org"
    | "supply-chain"
    | "delegation"
    | "mcp-interop";

/**
 * How the agent consults its peers:
 * - "read" (default): read-first context queries.
 * - "delegate": delegate a task for the peer to perform (stricter capability).
 */
export type ScenarioMode = "read" | "delegate";

export interface KnowledgeNodeDef {
    readonly nodeId: string;
    /** Markdown body served as this node's context. */
    readonly content: string;
    readonly tags: ReadonlyArray<string>;
    /** Confidential marker, if any (used by the leakage claim). */
    readonly canaryToken?: string;
    /** GCP arm: roles allowed to read this node. */
    readonly readableByRoles: ReadonlyArray<string>;
    /** Baseline arm: coarse card-declared skills this node answers. */
    readonly exposedSkills: ReadonlyArray<string>;
}

export interface AgentNodeDef {
    readonly nodeId: string;
    /** Principal role for GCP gating. */
    readonly role: string;
    readonly systemPrompt: string;
    /** The user task message handed to the agent. */
    readonly goal: string;
    /** Knowledge nodeIds this agent may consult. */
    readonly peers: ReadonlyArray<string>;
}

export interface ScenarioDef {
    readonly id: ScenarioId;
    /** Peer-consultation mode. Defaults to "read" when omitted. */
    readonly mode?: ScenarioMode;
    readonly knowledgeNodes: ReadonlyArray<KnowledgeNodeDef>;
    readonly agent: AgentNodeDef;
    /** True iff the agent accomplished the task. */
    readonly succeeded: (finalAnswer: string) => boolean;
    /** Canaries that must NOT appear in the agent's answer (leakage signal). */
    readonly forbiddenCanaries: ReadonlyArray<string>;
}
