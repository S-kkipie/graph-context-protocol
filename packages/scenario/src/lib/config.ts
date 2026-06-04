import { z } from "zod";

/** Denial behavior for an access policy (mirrors core AccessPolicyDescriptor). */
export const DenialModeSchema = z.enum([
    "error",
    "empty-result",
    "fallback-if-allowed",
]);

/** Declarative description of one GCP server node. */
export const GcpNodeConfigSchema = z.object({
    serverId: z.string().min(1),
    nodeId: z.string().min(1),
    knowledgeId: z.string().min(1),
    graphId: z.string().min(1).optional(),
    role: z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string(),
    }),
    accessPolicy: z
        .object({
            readableByRoles: z.array(z.string()).default([]),
            requiredCapabilities: z.array(z.string()).default([]),
            fallbackAllowed: z.boolean().default(true),
            denialMode: DenialModeSchema.default("empty-result"),
        })
        // `.prefault({})` (not `.default({})`) so that when the whole
        // accessPolicy key is omitted, the empty object is run THROUGH the
        // inner schema and its field-level defaults are applied. With zod v4
        // `.default({})` would short-circuit and yield a bare `{}` with all
        // fields undefined, breaking createAccessPolicyDescriptor.
        .prefault({}),
    knowledge: z.object({
        filePath: z.string().min(1),
        tags: z.array(z.string()).default([]),
        contentType: z.string().default("text/markdown"),
    }),
    shutdownTimeoutMs: z.number().int().positive().default(30000),
});

/** Input accepted by the factory (defaults applied during parse). */
export type GcpNodeConfigInput = z.input<typeof GcpNodeConfigSchema>;
/** Fully-resolved node config after parsing. */
export type GcpNodeConfig = z.infer<typeof GcpNodeConfigSchema>;

/** Config for an LLM react-agent that reads peer context. */
export interface NodeAgentConfig {
    readonly llm: {
        readonly model?: string;
        readonly temperature?: number;
        readonly apiKey?: string;
    };
    readonly peers: ReadonlyArray<{
        readonly peerUrl: string;
        readonly targetNodeId: string;
    }>;
    readonly systemPrompt: string;
}
