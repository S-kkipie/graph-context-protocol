import { createExpressServer } from "./server";

const PORT = Number(process.env.PORT) || 3456;

const server = createExpressServer(PORT);

server.start().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});

process.on("SIGTERM", async () => {
    console.log("SIGTERM received, shutting down...");
    await server.stop();
    process.exit(0);
});

process.on("SIGINT", async () => {
    console.log("SIGINT received, shutting down...");
    await server.stop();
    process.exit(0);
});
