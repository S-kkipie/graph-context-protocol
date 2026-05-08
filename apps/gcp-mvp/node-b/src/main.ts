import { createGcpServer } from "./server";

const NODE_ID = process.env.NODE_ID || "node-b";
const PORT = Number(process.env.PORT) || 4102;
const PEER_URL = process.env.PEER_URL || "http://localhost:4101";

const server = createGcpServer(NODE_ID, PORT, PEER_URL);

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
