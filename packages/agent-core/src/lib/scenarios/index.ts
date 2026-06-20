import { marketplace } from "./marketplace";
import { softwareOrg } from "./software-org";
import { supplyChain } from "./supply-chain";
import type { ScenarioDef, ScenarioId } from "./types";

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
    marketplace,
    "software-org": softwareOrg,
    "supply-chain": supplyChain,
};

export { marketplaceScenario } from "./marketplace";
export {
    type AgentNodeDef,
    type KnowledgeNodeDef,
    PROVIDE_CONTEXT_SKILL,
    type ScenarioDef,
    type ScenarioId,
} from "./types";
