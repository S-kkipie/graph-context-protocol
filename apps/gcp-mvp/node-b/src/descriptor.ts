import { z } from "zod";

export const NodeSnapshotSchema = z.object({
    id: z.string(),
    kind: z.string(),
    roleId: z.string(),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
});

export const EdgeSnapshotSchema = z.object({
    version: z.literal(1),
    id: z.string(),
    source: z.string(),
    target: z.string(),
    type: z.string(),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
    bidirectional: z.boolean(),
});

export const GraphSnapshotSchema = z.object({
    id: z.string(),
    nodes: z.array(NodeSnapshotSchema),
    edges: z.array(EdgeSnapshotSchema),
});

export const DescriptorSchema = z.object({
    nodeId: z.string(),
    name: z.string(),
    agentNodeId: z.string(),
    knowledgeNodeIds: z.array(z.string()),
    endpoints: z.array(z.string()),
    peerUrl: z.string().optional(),
});

export type NodeSnapshotDto = z.infer<typeof NodeSnapshotSchema>;
export type EdgeSnapshotDto = z.infer<typeof EdgeSnapshotSchema>;
export type GraphSnapshotDto = z.infer<typeof GraphSnapshotSchema>;
export type DescriptorDto = z.infer<typeof DescriptorSchema>;
