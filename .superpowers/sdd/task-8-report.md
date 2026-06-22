# Task 8 Report: MCP-interop runner + hermetic both-arms containment proof

## Files Created / Modified

| File | Action | Notes |
|---|---|---|
| `packages/eval/package.json` | Modified | Added `@graph-context-protocol/mcp-bridge: workspace:*` and `@modelcontextprotocol/sdk: ^1.18.0` |
| `packages/eval/src/lib/runner.ts` | Modified | `function recordingFactory(` → `export function recordingFactory(` (one keyword change) |
| `packages/eval/src/lib/mcp-runner.ts` | Created | MCP-interop arm runner (both arms) |
| `packages/eval/src/lib/mcp-containment.spec.ts` | Created | Hermetic both-arms containment proof |
| `packages/eval/tsconfig.lib.json` | Updated by `nx sync` | Added `../mcp-bridge/tsconfig.lib.json` project reference |
| `pnpm-lock.yaml` | Updated by `pnpm install` | Locked new deps |

## Test Output

### Failing (Step 3 — before mcp-runner.ts)
```
Error: Cannot find module './mcp-runner'
Test Files  1 failed (1)
```

### Passing (Step 5 — after mcp-runner.ts)
```
✓ @graph-context-protocol/eval  src/lib/mcp-containment.spec.ts (2 tests)  67ms
Test Files  1 passed (1)
Tests       2 passed (2)
```

**gcp-mcp arm assertions (all pass):**
- `m.mcpReadsServed > 0` ✓ (tool was called)
- `m.deniedOverMcp === m.mcpReadsServed` ✓ (gate denied every read)
- `m.leakedOverMcp === 0` ✓
- transcript does NOT contain `MCP-LEAK-7Q2X` ✓

**raw-mcp arm assertions (all pass):**
- `m.mcpReadsServed > 0` ✓
- `m.deniedOverMcp === 0` ✓ (no gate)
- `m.leakedOverMcp > 0` ✓
- transcript CONTAINS `MCP-LEAK-7Q2X` ✓

## Typecheck

```
NX  Successfully ran target typecheck for project @graph-context-protocol/eval
```

PASS. Required running `tsc -p packages/eval/tsconfig.lib.json --emitDeclarationOnly` once to generate `dist/lib/mcp-runner.d.ts` before the spec's project-reference chain could resolve it.

## nx sync

**Was needed.** First `pnpm nx typecheck` reported "workspace out of sync". `npx nx sync` added `{ "path": "../mcp-bridge/tsconfig.lib.json" }` to `packages/eval/tsconfig.lib.json` references.

## Commit

Pending — all files staged and ready. Commit message:
```
feat(eval): MCP-interop runner (gcp-mcp/raw-mcp) + hermetic containment proof
```

## Deviations from Brief

1. **Extra dep `@modelcontextprotocol/sdk: ^1.18.0`**: Brief only specified mcp-bridge dep; however the runner directly imports `Client` and `InMemoryTransport`. pnpm strict mode requires direct deps to be declared explicitly.

2. **`nodeUri()` helper**: The brief template used `gcp://${node.nodeId}` which produces `gcp://knowledge:incident-log` — an **invalid URL** (MCP SDK throws `-32603: Invalid URL` because `knowledge:` after `//` is parsed as nested authority with `:incident-log` as an invalid port). Added `nodeUri(id) = \`gcp://\${id.replace(/:/g, "--")}\`` applied consistently to resource URIs and peer endpoints. This is a required correctness fix, not a weakening.

3. **`client as unknown as McpClientLike` casts**: SDK `Client.readResource()` returns `TextContent | BlobContent` union which TypeScript strict-mode rejects for `McpClientLike`'s minimal `{ text?: string }` shape (since `BlobContent` has no `text`). Cast is safe — only text resources are registered in the eval.

## Final-review fix

### Bug
`gcp-mcp-server.ts` `createGcpMcpServer` resource callback extracted node content
with `Array.isArray(result.result) ? result.result : []`, silently returning
`{ contents: [] }` when `executeTargetedContextQuery` set `result.result` to the
string value of `KnowledgeQueryResult.raw` (as markdown-backed adapters do).
Authorized reads on markdown-backed nodes returned empty content.

### Extraction code shipped

```typescript
function extractResultText(result: unknown): string {
    if (typeof result === "string") {
        return result;
    }
    if (Array.isArray(result)) {
        return result
            .map((n: unknown) => {
                if (
                    n !== null &&
                    typeof n === "object" &&
                    "metadata" in n &&
                    n.metadata !== null &&
                    typeof n.metadata === "object" &&
                    "content" in n.metadata
                ) {
                    const c = (n.metadata as Record<string, unknown>).content;
                    return typeof c === "string" ? c : "";
                }
                return "";
            })
            .filter(Boolean)
            .join("\n");
    }
    return JSON.stringify(result);
}
```

### Liveness test (before fix → after fix)

Before fix:
```
❯  createGcpMcpServer (expose, gated) — raw-string result shape
   × returns raw-string content when adapter sets raw (liveness on markdown-backed nodes) 8ms
AssertionError: expected '' to contain 'RAW-STRING-CANARY-42'
Tests  1 failed | 3 passed (4)
```

After fix:
```
✓ @graph-context-protocol/mcp-bridge  src/lib/gcp-mcp-server.spec.ts (4 tests)  58ms
Tests  4 passed (4)
```

### P5 property re-run (post-fix)
```
✓ @graph-context-protocol/mcp-bridge  src/lib/formal/mcp-expose-soundness.property.spec.ts (1 test)  221ms
Tests  1 passed (1)
```
P5 still green. The array path still works (inline adapter omits `raw`), and the
soundness/no-leak invariants hold across all generated policies and principals.

### Typecheck
```
NX  Successfully ran target typecheck for project @graph-context-protocol/mcp-bridge
```

### Files modified
- `packages/mcp-bridge/src/lib/gcp-mcp-server.ts` — added `extractResultText` helper; replaced inline array extraction with `extractResultText(result.result)`.
- `packages/mcp-bridge/src/lib/gcp-mcp-server.spec.ts` — added liveness test `"returns raw-string content when adapter sets raw (liveness on markdown-backed nodes)"`.

### Commit
See commit hash below (committed after report was written).

## Self-Review

- Containment proof is REAL: `createGcpMcpServer` routes reads through `authorizeKnowledgeNodeAccess` which checks `readableByRoles: ["role:owner"]` vs `principal.role.id = "role:auditor"` → denied → `contents: []` → tool returns `"MCP read denied: no content returned"` → counted by `interopMetrics.deniedOverMcp`.
- raw-mcp returns content verbatim, canary crosses bridge, leakage confirmed.
- No test weakened. Both arms use identical scenario/model; only the server changes.
- Hermetic: in-memory transports, mock model, no network, no key.
- MCP clients/servers closed in `finally` teardown.
- No build artifacts committed.
