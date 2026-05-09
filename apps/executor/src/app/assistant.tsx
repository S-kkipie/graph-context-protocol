"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useLangGraphRuntime } from "@assistant-ui/react-langgraph";
import { Thread } from "@/components/assistant-ui/thread";

export const Assistant = () => {
    const runtime = useLangGraphRuntime({
        stream: async function* (messages) {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages }),
            });

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            if (!reader) {
                throw new Error("No response body");
            }

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (line.trim()) {
                        yield JSON.parse(line);
                    }
                }
            }

            if (buffer.trim()) {
                yield JSON.parse(buffer);
            }
        },
    });

    return (
        <AssistantRuntimeProvider runtime={runtime}>
            <div className="h-dvh">
                <Thread />
            </div>
        </AssistantRuntimeProvider>
    );
};
