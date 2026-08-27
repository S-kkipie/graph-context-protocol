---
name: fetch-handler-http-status-mapping
description: How createFetchHandler in @gcp/server maps ProtocolMessage dispatch outcomes to HTTP status codes — reference when reviewing HTTP-layer error correctness
metadata:
  type: project
---

`createFetchHandler` in `packages/server/src/lib/http/fetch-handler.ts` maps dispatch outcomes to HTTP status as: bad/unparseable JSON or missing `header.type` -> 400; any `server.receive` failure (`result.success === false`) -> 500 regardless of `ServerError.code`; success but no `handlerResult.response` -> 502; success with a response -> 200.

`server.receive` is typed `Promise<Result<unknown, ServerError>>` (see `packages/server/src/lib/server/types.ts`), so the handler's `result.data as { response?: ProtocolMessage }` cast is necessary and correctly targets the real `HandlerResult.response` field (`packages/server/src/lib/handlers/types.ts`). Same pattern as `.payload as ContextQueryResult` — see [[server-context-query-response-contract]].

**Why:** The `ServerError.code` union (`errors.ts`) includes domain-meaningful codes like `auth-error`, `authorization-error`, `not-found`, `validation-error`. Collapsing all of them to 500 means a denied/unauthorized/not-found query is reported to the HTTP client as a server fault, not a client fault. For the read-first peer-to-peer demo this is acceptable (the `ContextQueryResult.status` carries the real denial signal inside a 200 body), but it is the recurring correctness question for this layer.

**How to apply:** When reviewing changes to this HTTP layer, do not flag the 500-for-all-errors mapping as a blocker for the demo scope, but do raise it as Minor/Important if/when this endpoint is exposed to untrusted callers who need to distinguish 4xx (their fault) from 5xx (peer fault). A future improvement is a code->status map (e.g. `auth-error`/`authorization-error` -> 401/403, `not-found` -> 404, `validation-error` -> 400).
