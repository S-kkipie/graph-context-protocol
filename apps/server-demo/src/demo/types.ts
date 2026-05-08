import type { Result } from "@graph-context-protocol/core";
import type {
    DeliveryReceipt,
    KnowledgeQueryResult,
    ServerError,
    ServerSnapshot,
    TransportEnvelope,
} from "@graph-context-protocol/server";

export interface ScenarioResult {
    readonly serverStart: Result<ServerSnapshot, ServerError>;
    readonly serverStop: Result<ServerSnapshot, ServerError>;
    readonly localHandle: Result<unknown, ServerError>;
    readonly externalDelivery: Result<DeliveryReceipt, ServerError>;
    readonly capturedOutbound?: TransportEnvelope;
    readonly knowledgeResults: Result<
        readonly KnowledgeQueryResult[],
        ServerError
    >;
}
