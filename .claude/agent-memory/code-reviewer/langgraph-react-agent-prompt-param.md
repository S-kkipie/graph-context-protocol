---
name: langgraph-react-agent-prompt-param
description: createReactAgent messageModifier/stateModifier are deprecated in @langchain/langgraph 0.2.74; use prompt instead
metadata:
  type: project
---

In the installed `@langchain/langgraph@0.2.74`, `createReactAgent`'s `messageModifier` and `stateModifier` params are `@deprecated` (JSDoc) in favor of `prompt`. The deprecated params still type-check and work, so this is a lint/future-proofing concern, not a build break.

The researcher (and executor) `graph.ts` use `messageModifier: systemPrompt`. A `SystemMessage` is a valid `prompt` value too, so the migration is a near drop-in rename `messageModifier` -> `prompt`.

**Why:** flagged during Task 6 review (gcp-app-node-wiring). Build is green because deprecation is non-fatal.
**How to apply:** when reviewing/editing agent graph construction in apps, prefer `prompt` over `messageModifier`/`stateModifier`. Type defs live at the resolved 0.2.74 path under `dist/prebuilt/react_agent_executor.d.ts`.
