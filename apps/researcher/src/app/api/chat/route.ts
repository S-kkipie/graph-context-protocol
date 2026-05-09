import { graph } from "@/lib/graph";

export async function POST(req: Request) {
    const body = await req.json();
    const messages = body.messages ?? [];

    const stream = await graph.stream({ messages }, { streamMode: "messages" });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
        async start(controller) {
            try {
                for await (const [msg, metadata] of stream) {
                    const event = {
                        event: "messages",
                        data: [msg, metadata],
                    };
                    controller.enqueue(
                        encoder.encode(`${JSON.stringify(event)}\n`),
                    );
                }
            } catch (error) {
                controller.error(error);
            } finally {
                controller.close();
            }
        },
    });

    return new Response(readable, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}
