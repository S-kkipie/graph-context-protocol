/**
 * Integration-effort proxy (deterministic, no model, no network).
 *
 * The acquaintance-graph count in `topology.ts` says how many edges a topology
 * has, not how much a deployer has to write or change. This module builds, for
 * each deployment style, the *configuration surface* a deployer must author for
 * an n-participant federation: one entry per declaration (a node endpoint, an
 * agent card, an access policy, a credential, a peer binding, ...), grouped by
 * the artifact that holds it (a node's config, an agent's config, the shared
 * credential table, the registry, ...). Onboarding a participant, or changing
 * an access rule, is then measured as the difference between two such surfaces.
 *
 * The per-node entries mirror what `runner.ts` actually passes when it stands
 * up each arm (`createGcpNode`, `createBaselineNode` and `PolicyEnforcingExecutor`
 * options). It is a proxy for effort, not a study with developers.
 *
 * @module integration-effort
 */

export type DeploymentStyle =
    /** GCP: one server, one generic query tool per agent. */
    | "gcp-hub"
    /** Base A2A, full mesh, one tool per peer card (the stock factory). */
    | "a2a-mesh"
    /** Base A2A through a registry, one generic send-task tool per agent. */
    | "a2a-hub"
    /** A2A behind a policy enforcement point, full mesh. */
    | "a2a-pep-mesh"
    /** A2A behind a policy enforcement point, through a registry. */
    | "a2a-pep-hub";

export const STYLES: readonly DeploymentStyle[] = [
    "gcp-hub",
    "a2a-mesh",
    "a2a-hub",
    "a2a-pep-mesh",
    "a2a-pep-hub",
];

/** artifact -> set of declarations it holds. */
export type Surface = Map<string, Set<string>>;

function put(s: Surface, artifact: string, entry: string): void {
    let set = s.get(artifact);
    if (!set) {
        set = new Set();
        s.set(artifact, set);
    }
    set.add(entry);
}

const isMesh = (v: DeploymentStyle) => v.endsWith("mesh");
const isGated = (v: DeploymentStyle) =>
    v === "gcp-hub" || v.startsWith("a2a-pep");

/** Entries a node owner declares for one participant's node. */
function nodeEntries(v: DeploymentStyle): string[] {
    if (v === "gcp-hub") return ["endpoint", "policy", "auth", "audit"];
    if (v.startsWith("a2a-pep"))
        return [
            "endpoint",
            "agent-card",
            "auth",
            "pep-wrapper",
            "policy",
            "audit",
        ];
    return ["endpoint", "agent-card"];
}

/** The configuration surface of an n-participant federation. */
export function surface(v: DeploymentStyle, n: number): Surface {
    const s: Surface = new Map();
    for (let i = 0; i < n; i++) {
        for (const e of nodeEntries(v)) put(s, `node:${i}`, e);
        if (isMesh(v)) {
            // Mesh: every agent holds a binding for every other agent.
            for (let j = 0; j < n; j++)
                if (j !== i) put(s, `agent:${i}`, `peer:${j}`);
        } else {
            // Hub: one generic tool per agent, discovery through the shared directory.
            put(s, `agent:${i}`, "tool");
            put(s, "directory", `register:${i}`);
        }
        if (isGated(v)) put(s, "credentials", `token:${i}`);
    }
    return s;
}

export interface OnboardingCost {
    /** Declarations that did not exist before. */
    readonly entriesAdded: number;
    /** Artifacts that already existed and had to be edited. */
    readonly existingArtifactsTouched: number;
    /** Artifacts created from scratch. */
    readonly newArtifacts: number;
}

/** Cost of adding participant n+1 to an n-participant federation. */
export function onboardingCost(v: DeploymentStyle, n: number): OnboardingCost {
    const before = surface(v, n);
    const after = surface(v, n + 1);
    let entriesAdded = 0;
    let touched = 0;
    let created = 0;
    for (const [artifact, entries] of after) {
        const old = before.get(artifact);
        if (!old) {
            created++;
            entriesAdded += entries.size;
            continue;
        }
        let added = 0;
        for (const e of entries) if (!old.has(e)) added++;
        if (added > 0) {
            touched++;
            entriesAdded += added;
        }
    }
    return {
        entriesAdded,
        existingArtifactsTouched: touched,
        newArtifacts: created,
    };
}

export interface RuleChangeCost {
    /** False when the style has nowhere to express an access rule at all. */
    readonly expressible: boolean;
    /** Declarations edited to change which roles may read one node. */
    readonly entriesEdited: number;
    /** Artifacts edited. */
    readonly artifactsEdited: number;
}

/** Cost of changing which roles may read (or delegate to) one node. */
export function ruleChangeCost(v: DeploymentStyle, n: number): RuleChangeCost {
    const s = surface(v, n);
    const holders = [...s].filter(([, entries]) => entries.has("policy"));
    if (holders.length === 0)
        return { expressible: false, entriesEdited: 0, artifactsEdited: 0 };
    // The rule lives with the node it protects: one policy entry in one artifact.
    return { expressible: true, entriesEdited: 1, artifactsEdited: 1 };
}

/** Total declarations a deployer maintains for n participants. */
export function totalEntries(v: DeploymentStyle, n: number): number {
    let total = 0;
    for (const entries of surface(v, n).values()) total += entries.size;
    return total;
}

/** How many separate artifacts hold an access policy. */
export function policyHolders(v: DeploymentStyle, n: number): number {
    return [...surface(v, n)].filter(([, e]) => e.has("policy")).length;
}
