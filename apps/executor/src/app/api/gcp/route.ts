import { createFetchHandler } from "@graph-context-protocol/server";
import { getGcpServer } from "@/lib/gcp";

export async function POST(request: Request): Promise<Response> {
    const server = await getGcpServer();
    const handler = createFetchHandler({ server });
    return handler(request);
}
