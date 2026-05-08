import { renderLLMReport, runLLMCollaboration } from "./llm-collaboration";

async function main() {
    if (!process.env.OPENROUTER_API_KEY) {
        console.error(
            "Error: OPENROUTER_API_KEY environment variable is required",
        );
        console.error("Set it with: export OPENROUTER_API_KEY=your_key_here");
        process.exit(1);
    }

    const topic =
        process.argv[2] ||
        "the benefits of Graph Context Protocol for AI systems";

    console.log(
        `Starting LLM-powered multi-agent collaboration on: ${topic}\n`,
    );
    console.log("This may take a minute as agents collaborate...\n");

    try {
        const messages = await runLLMCollaboration(topic);
        const report = renderLLMReport(messages);
        process.stdout.write(report + "\n");
    } catch (error) {
        console.error("Collaboration failed:", error);
        process.exit(1);
    }
}

main();
