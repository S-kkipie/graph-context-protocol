/**
 * Boots one A2A server (express + JSON-RPC) for a scenario node on an
 * ephemeral localhost port. This task handles knowledge nodes; Task 5 adds
 * the agent-node path.
 *
 * @module baseline-node
 */

import type { AddressInfo } from "node:net";
import { AGENT_CARD_PATH } from "@a2a-js/sdk";
import { DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import {
    agentCardHandler,
    jsonRpcHandler,
    UserBuilder,
} from "@a2a-js/sdk/server/express";
import type {
    AgentNodeDef,
    CouplingMetrics,
    KnowledgeNodeDef,
    TaskAgentConfig,
} from "@graph-context-protocol/agent-core";
import express from "express";
import { buildAgentCard } from "./agent-card";
import { KnowledgeExecutor } from "./knowledge-executor";

export interface BaselineNodeHandle {
    readonly url: string;
    readonly nodeId: string;
    close(): Promise<void>;
}

export interface CreateBaselineNodeOptions {
    readonly port?: number;
    readonly metrics?: CouplingMetrics;
    readonly llm?: TaskAgentConfig["llm"];
    /** Maps a peer knowledge nodeId -> its base URL (agent nodes only). */
    readonly peerEndpoints?: Record<string, string>;
}

function isKnowledge(
    node: KnowledgeNodeDef | AgentNodeDef,
): node is KnowledgeNodeDef {
    return "content" in node;
}

/**
 * Starts an A2A server for the node and returns a handle. The base URL has no
 * trailing slash; the card is served at `${url}/.well-known/agent-card.json`
 * and JSON-RPC at `${url}/a2a/jsonrpc`.
 *
 * SDK note: AGENT_CARD_PATH = ".well-known/agent-card.json" (no leading slash),
 * so we prepend "/" for the express mount path.
 */
export function createBaselineNode(
    node: KnowledgeNodeDef | AgentNodeDef,
    opts: CreateBaselineNodeOptions = {},
): Promise<BaselineNodeHandle> {
    return new Promise((resolve, reject) => {
        const app = express();
        const server = app.listen(opts.port ?? 0, () => {
            const address = server.address() as AddressInfo;
            const url = `http://127.0.0.1:${address.port}`;
            const card = buildAgentCard(node, url);

            if (!isKnowledge(node)) {
                // Agent-node path is implemented in Task 5.
                server.close();
                reject(
                    new Error(
                        "createBaselineNode: agent nodes require Task 5 (BrainExecutor)",
                    ),
                );
                return;
            }

            const requestHandler = new DefaultRequestHandler(
                card,
                new InMemoryTaskStore(),
                new KnowledgeExecutor(node),
            );
            // AGENT_CARD_PATH has no leading slash in SDK 0.3.x; prepend "/" for express mount
            app.use(
                `/${AGENT_CARD_PATH}`,
                agentCardHandler({ agentCardProvider: requestHandler }),
            );
            app.use(
                "/a2a/jsonrpc",
                jsonRpcHandler({
                    requestHandler,
                    userBuilder: UserBuilder.noAuthentication,
                }),
            );

            resolve({
                url,
                nodeId: node.nodeId,
                close: () =>
                    new Promise<void>((res, rej) =>
                        server.close((err) => (err ? rej(err) : res())),
                    ),
            });
        });
        server.on("error", reject);
    });
}
