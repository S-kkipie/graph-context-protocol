import type { ProtocolMessage, Result } from "@graph-context-protocol/core";
import { fail, succeed } from "@graph-context-protocol/core";
import type {
    DeliveryReceipt,
    OutboundMessageEnvelope,
    ServerError,
    Transport,
    TransportEnvelope,
    TransportMessageListener,
    TransportSnapshot,
    Unsubscribe,
} from "@graph-context-protocol/server";
import type { Request, Response } from "express";
import express from "express";

export interface ExpressTransportOptions {
    id?: string;
    port?: number;
    path?: string;
}

export function createExpressTransport(
    options: ExpressTransportOptions = {},
): Transport {
    const id = options.id || "transport:express";
    const port = options.port || 3456;
    const path = options.path || "/messages";

    let status:
        | "idle"
        | "starting"
        | "listening"
        | "draining"
        | "stopped"
        | "failed" = "idle";
    let app: express.Application;
    let server: ReturnType<typeof app.listen> | undefined;
    let startedAt: string | undefined;
    let stoppedAt: string | undefined;
    const listeners = new Set<TransportMessageListener>();

    return {
        id,

        get status() {
            return status;
        },

        async start(): Promise<Result<TransportSnapshot, ServerError>> {
            if (status === "listening") {
                return succeed(createSnapshot());
            }

            status = "starting";
            app = express();
            app.use(express.json());

            app.post(path, (req: Request, res: Response) => {
                const envelope: TransportEnvelope = {
                    transportId: id,
                    message: req.body as unknown as ProtocolMessage,
                    receivedAt: new Date().toISOString(),
                    metadata: {},
                };

                for (const listener of listeners) {
                    listener(envelope);
                }

                res.json({ received: true });
            });

            await new Promise<void>((resolve) => {
                server = app.listen(port, () => {
                    resolve();
                });
            });

            startedAt = new Date().toISOString();
            stoppedAt = undefined;
            status = "listening";

            return succeed(createSnapshot());
        },

        async stop(): Promise<Result<TransportSnapshot, ServerError>> {
            if (status === "stopped") {
                return succeed(createSnapshot());
            }

            status = "draining";

            await new Promise<void>((resolve, reject) => {
                if (!server) {
                    resolve();
                    return;
                }
                server.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            stoppedAt = new Date().toISOString();
            status = "stopped";

            return succeed(createSnapshot());
        },

        async send(
            envelope: OutboundMessageEnvelope,
        ): Promise<Result<DeliveryReceipt, ServerError>> {
            if (status !== "listening") {
                return fail({
                    code: "transport-error",
                    message: `Transport is not listening: ${id}`,
                    metadata: { transportId: id, status },
                } as ServerError);
            }

            const timestamp = new Date().toISOString();

            return succeed({
                delivered: true,
                timestamp,
                transportId: id,
                connectionId: envelope.connectionId,
            });
        },

        onMessage(listener: TransportMessageListener): Unsubscribe {
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
            };
        },

        snapshot(): TransportSnapshot {
            return createSnapshot();
        },
    };

    function createSnapshot(): TransportSnapshot {
        return { id, status, startedAt, stoppedAt };
    }
}
