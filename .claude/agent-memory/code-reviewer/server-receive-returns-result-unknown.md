---
name: server-receive-returns-result-unknown
description: GraphContextServer.receive returns Result<unknown, ServerError>; HandlerResult.response.payload is also unknown — casts in tests are expected
metadata:
  type: project
---

`GraphContextServer.receive(...)` is typed `Promise<Result<unknown, ServerError>>` (packages/server/src/lib/server/types.ts:63-65). On success, `result.data` is `unknown`. The handler actually puts a `HandlerResult`-shaped object there, whose `.response` is a `ProtocolMessage` and whose `.response.payload` is typed `unknown` (packages/server/src/lib/handlers/types.ts:32, packages/server/src/lib/types.ts:153).

**Why:** the server intentionally keeps the receive return + protocol payload as `unknown` rather than a discriminated union, so callers must narrow.

**How to apply:** when reviewing scenario/server tests, a cast like `result.data as { response?: { payload: ContextQueryResult } }` to extract `.response.payload.status` is reasonable and NOT a quality issue — it is the only way to narrow `unknown`. Do not flag it as an unsafe-cast smell. See [[server-context-query-response-contract]] for the context-query payload contract.
