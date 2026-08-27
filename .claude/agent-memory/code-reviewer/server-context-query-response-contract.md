---
name: server-context-query-response-contract
description: How the @gcp/server context-query handler shapes its response message — verify HTTP client payload extraction against this
metadata:
  type: project
---

The `context-query` handler in `packages/server/src/lib/handlers/context-query-handler.ts` builds its response via `buildResponseMessage`, which calls `createProtocolMessage(responseHeader, context, queryResult)`. So a `context-query-response` ProtocolMessage carries the `ContextQueryResult` directly as its `.payload` field.

`ContextQueryResult` (= `ContextQueryResponse` in `packages/core/src/lib/context/context-query-types.ts`) fields: `contractVersion`, `queryId`, `status` (`"ok" | "denied" | "not-found" | "invalid-query" | "unavailable" | "error"`), `sourceNodeId`, `result?`, `error?`, `provenance?`, `metadata`.

**Why:** When reviewing HTTP/transport code that extracts a result from a response message (e.g. `queryRemoteContext` in `packages/server/src/lib/http/fetch-client.ts` doing `responseMessage.payload as ContextQueryResult`), this is the authoritative shape to check the cast against. The cast is correct for well-behaved server responses.

**How to apply:** When a reviewer sees an unchecked `as ContextQueryResult` on `response.payload`, confirm it matches this contract before flagging — it is structurally correct, though it lacks runtime validation (a real concern if the peer is untrusted/misbehaving).
