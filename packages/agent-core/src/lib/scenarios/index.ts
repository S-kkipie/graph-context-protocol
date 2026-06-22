import { delegation } from "./delegation";
import { marketplace } from "./marketplace";
import { mcpInterop } from "./mcp-interop";
import { softwareOrg } from "./software-org";
import { supplyChain } from "./supply-chain";
import type { ScenarioDef, ScenarioId } from "./types";

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
    marketplace,
    "software-org": softwareOrg,
    "supply-chain": supplyChain,
    delegation,
    "mcp-interop": mcpInterop,
};

export { marketplaceScenario } from "./marketplace";
export {
    type AgentNodeDef,
    type KnowledgeNodeDef,
    PROVIDE_CONTEXT_SKILL,
    type ScenarioDef,
    type ScenarioId,
    type ScenarioMode,
} from "./types";
