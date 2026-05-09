export {
    createAllowAllAuthProvider,
    createCapabilityAuthProvider,
    createStaticTokenAuthProvider,
} from "./implementation.js";
export { authorizeKnowledgeNodeAccess } from "./node-authorization.js";
export type { NodeAuthorizationOptions } from "./node-authorization.js";

export type {
    AuthAction,
    AuthorizationDecision,
    AuthorizationRequest,
    AuthProvider,
    Credentials,
    Principal,
} from "./types.js";
