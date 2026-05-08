// Types

// Implementation
export {
    CreateCapabilityInputSchema,
    CreateContextRuleInputSchema,
    createCapability,
    createContextRule,
    createRole,
} from "./role-factories";
export type {
    Capability,
    ContextRule,
    RoleDefinition,
} from "./role-types";
// Schemas and constants
export {
    CapabilitySchema,
    ContextRuleSchema,
    RoleDefinitionSchema,
    SystemCapabilities,
    SystemRoles,
} from "./role-types";
