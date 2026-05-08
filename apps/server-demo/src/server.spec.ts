import http from "node:http";
import { describe, expect, it } from "vitest";
import { createExpressServer } from "./server";

function request(
    options: http.RequestOptions,
    body?: unknown,
): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                try {
                    resolve({
                        status: res.statusCode || 0,
                        body: JSON.parse(data),
                    });
                } catch {
                    resolve({ status: res.statusCode || 0, body: data });
                }
            });
        });
        req.on("error", reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

describe("Express Server", () => {
    it("GET /status returns server snapshot", async () => {
        const port = 3457;
        const server = createExpressServer(port);
        await server.start();

        const res = await request({
            hostname: "localhost",
            port,
            path: "/status",
            method: "GET",
        });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("id", "server:demo");
        expect(res.body).toHaveProperty("status", "idle");

        await server.stop();
    });

    it("POST /start starts the server", async () => {
        const port = 3458;
        const server = createExpressServer(port);
        await server.start();

        const res = await request({
            hostname: "localhost",
            port,
            path: "/start",
            method: "POST",
        });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("success", true);
        const body = res.body as Record<string, unknown>;
        expect(body.data).toHaveProperty("status", "ready");

        await request({
            hostname: "localhost",
            port,
            path: "/stop",
            method: "POST",
        });
        await server.stop();
    });

    it("GET /report returns the demo report", async () => {
        const port = 3459;
        const server = createExpressServer(port);
        await server.start();

        const res = await request({
            hostname: "localhost",
            port,
            path: "/report",
            method: "GET",
        });

        expect(res.status).toBe(200);
        expect(typeof res.body).toBe("string");
        expect(res.body).toContain("Server Demo Report");

        await server.stop();
    });
});
