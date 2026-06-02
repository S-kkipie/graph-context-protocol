import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
    server: {
        OPENROUTER_API_KEY: z.string().min(1),
        OPENROUTER_MODEL: z.string().default("minimax/minimax-m2.5:free"),
        PEER_GCP_URL: z.string().url().default("http://localhost:3000/api/gcp"),
        NODE_ENV: z
            .enum(["development", "test", "production"])
            .default("development"),
    },
    client: {},
    runtimeEnv: {
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
        PEER_GCP_URL: process.env.PEER_GCP_URL,
        NODE_ENV: process.env.NODE_ENV,
    },
});
