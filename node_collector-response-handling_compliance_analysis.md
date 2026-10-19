# New Relic Service Response Handling Specification Compliance Analysis — Node.js Agent

| Field | Value |
|-------|-------|
| Date | 2026-10-19 |
| Agent | node |
| Agent Repository | /Users/achisholm/Desktop/amychisholm03-node-newrelic (branch: main, commit: 821848d) |
| Specification | Collector-Response-Handling.md |
| Spec Source | /Users/achisholm/Desktop/agent-specs/Collector-Response-Handling.md (branch: main, commit: 96f3d58) |

## Executive Summary

- Overall compliance: **69.7%** (23 of 33 explicit requirements compliant)
- Approved Deviations: None. Documented Exceptions: None.

| Status | Count |
|--------|-------|
| ✅ Compliant | 23 |
| ⚠️ Partial | 6 |
| ❌ Non-compliant | 4 |
| ❓ Unverified | 0 |
| **Total** | **33** |

### Compliance Breakdown by Category

| Category | ✅ | ⚠️ | ❌ | ❓ | Total |
|----------|----|----|----|----|-------|
| Retry On Next Harvest | 1 | 1 | 0 | 0 | 2 |
| Harvest Data | 1 | 2 | 0 | 0 | 3 |
| Agent Run | 3 | 2 | 0 | 0 | 5 |
| Retries and Backoffs | 9 | 1 | 2 | 0 | 12 |
| 429 Responses and Independent Harvests | 2 | 0 | 0 | 0 | 2 |
| JSON Validity | 1 | 0 | 0 | 0 | 1 |
| Metrics | 3 | 0 | 2 | 0 | 5 |
| Data Collection Limits | 3 | 0 | 0 | 0 | 3 |
| **Total** | **23** | **6** | **4** | **0** | **33** |

## Detailed Requirements Analysis

### Retry On Next Harvest

#### ⚠️ REQ-001 (MUST) — Retry the agent endpoint on the next harvest
All data endpoints go through `send` -> `_sendData` -> `_runLifecycle` -> `_handleResponseCode` (lib/collector/api.js:129-139, 500-516, 518-601, 618-649). Every non-410 result keeps the per-aggregator interval running (lib/aggregators/base-aggregator.js:203-206), so the next harvest retries. Covered: metric_data, error_data, error_event_data, analytic_event_data, custom_event_data, span_event_data, sql_trace_data, transaction_sample_data, log_event_data, pprof_data (api.js:93-108).
```js
if (!this.sendTimer) {
  this.sendTimer = setInterval(this.send.bind(this), this.periodMs)
```
Gap: `agent_settings` (api.js:435-450) bypasses `_handleResponseCode`. It is only called from `Agent#_configChange` (lib/agent.js:775-778). Failures are only `dumpErrors`'d at trace level, never retried, and status codes are not inspected.

#### ✅ REQ-002 (MUST NOT) — Do not retry on 410
lib/collector/api.js:636-642 (harvest path), api.js:241-245 (connect path).
```js
} else if (code === 410) {
  logFailure(endpoint, code, 'Disconnecting from New Relic')
  this._agent.stop(function onShutdown() { cb(null, CollectorResponse.fatal(response.payload)) })
```
`agent.stop` calls `harvester.stop()` (lib/agent.js:559); `fatal` sets retainData false. In the restart-then-410 edge case (REQ-007) the harvester restarts, but because `run_id` was cleared (api.js:481), `_runLifecycle` refuses to send (api.js:501-505), so no HTTP retry occurs.

### Harvest Data

#### ✅ REQ-003 (MUST) — Retain data when table says Retain
api.js:37-42, 632-635; response.js:37-39; base-aggregator.js:277-280; transaction-event-aggregator.js:137-142.
```js
const FAILURE_SAVE_DATA = new Set([408, 429, 500, 503])
...
if (response && response.retainData) { this._merge(data) }
```
Connection errors: `request.on('error')` (remote-method.js:317) -> api.js:546 `callback(error, { retainData: true })` -> merge.

#### ⚠️ REQ-004 (MUST) — Discard all data when table says Discard
Implemented: discard set (api.js:628-631), restart (624-627), 410 (636-642), unexpected codes (643-648), max payload (523-543) all set retainData false. Data already cleared in `send()` (base-aggregator.js:315-324).
Gap: Runtime errors are retained rather than discarded. Serialization (remote-method.js:70-74), compression (163-175) and request-preparation exceptions (182-187) call `callback(err)`, which api.js:521-548 maps to `{ retainData: true }`.

#### ⚠️ REQ-005 (MUST) — Log that data are being discarded
Implemented: discard set logs "Agent endpoint %s returned %s status. Discarding harvest data." (api.js:630, 656-658).
Gap: other discard paths do not state data is discarded:
- 401/409: "Restarting" only (api.js:626)
- 410: "Disconnecting from New Relic" only (api.js:638)
- Unexpected codes: "returned unexpected status" only (api.js:646)
- Max payload: discards silently (api.js:542-543); warning at remote-method.js:244-249 mentions only size
- Async `_toPayload` errors: discarded silently (base-aggregator.js:269-274)

### Agent Run

#### ✅ REQ-006 (MUST) — Preserve: stay alive and continue collecting
api.js:621-635, 643-648 use PRESERVE factories (response.js:29-39). `_sendData` passes them to the aggregator (api.js:595-599) without changing state or harvester. Agent errors also leave state alone (api.js:520-548).

#### ⚠️ REQ-007 (MUST) — Shutdown: call `shutdown` endpoint and stop collecting
Implemented: 410 on a data endpoint calls `agent.stop` (api.js:640), which stops the harvester, sets state stopping/stopped and calls `shutdown` (lib/agent.js:550-580). 410 at startup sets state errored (agent.js:434-440). `canCollectData()` gates main transaction paths (agent.js:46-55, 754-756; tracer/index.js:186, 239; transaction-shim.js:247, 289).
Gaps:
1. 410 during restart reconnect is ignored:
```js
// api.js:492-497
this.shutdown(function reconnect() {
  api.connect(function afterConnect() {   // fatal response ignored
    api._agent.onConnect(false, callback)  // restarts harvester, state 'started'
```
2. 410 on `agent_settings` not handled (api.js:435-450).
3. Transaction-creation paths not gated by `canCollectData()`: subscribers/message-consumer-tools.js:102-106, subscribers/grpcjs/server.js:118-120, subscribers/azure-functions/azure-handler-base.js:26, otel/traces/segments/server.js:20, otel/traces/segments/consumer.js:22.

#### ⚠️ REQ-008 (SHOULD) — Disable all instrumentation on Shutdown where possible
Implemented: after stop, `canCollectData()` returns false; tracer and transaction shim pass through (agent.js:46-55, 754-756; tracer/index.js:186-188; transaction-shim.js:247-249).
Gap: instrumentation is never unwrapped (FIXME at agent.js:538-541). Subscriber and OTel paths listed under REQ-007 stay active.

#### ✅ REQ-009 (MUST) — Restart: call `shutdown` endpoint
api.js:33-36, 624-627, 576-594, 487-498.
```js
} else if (RESTART.has(code)) {  // 401, 409
  setImmediate(cb, null, CollectorResponse.reconnect(0, null))
...
this._agent.harvester.stop()
this.shutdown(function reconnect() { ...
```
`shutdown()` invokes shutdown with the run ID (api.js:458-485). Each aggregator receiving 409 calls `restart()` independently, so restarts can overlap (TODO at api.js:579).

#### ✅ REQ-010 (MUST) — Restart: reconnect immediately via `connect`
api.js:492-497 — `api.connect` called immediately in shutdown callback; runs preconnect -> connect (api.js:172-193, 295-302, 374-376); `onConnect` resumes harvesting (agent.js:483-494).

### Retries and Backoffs

#### ✅ REQ-011 (SHOULD) — Retry harvest endpoints on the next harvest cycle
Data merged (base-aggregator.js:277-280) and resent on next interval tick (base-aggregator.js:203-206). `_sendData` (api.js:518-601) never resends immediately. `agent_settings` exception noted under REQ-001.

#### ⚠️ REQ-012 (MUST) — Log at warning or greater on each failure requiring retry (except 409)
Implemented: harvest HTTP failures log at error (api.js:626, 630, 634, 638, 646, 657). Connect failures log warn every attempt (api.js:246-274). Max payload (remote-method.js:244), compression (165, 173), not-connected (api.js:502), split transaction-event failures (transaction-event-aggregator.js:113-115) log warn.
Gaps:
- Network errors on harvest endpoints are never logged above trace: remote-method.js:317 -> api.js:509-511 -> api.js:546 -> base-aggregator.js:277-283 ignores error (`// TODO: Log?`).
- `agent_settings` failures logged only at trace (api.js:441-443, 63-75).

#### ❌ REQ-013 (SHOULD) — Log 409 at info level
```js
logFailure(endpoint, code, 'Restarting')  // 409 included
function logFailure(endpoint, code, action) {
  logger.error('Agent endpoint %s returned %s status. %s.', endpoint, code, action)
}
// connect path: logger.warn(error, `Received error status code from New Relic backend: ${response.status}.`)
```
Locations: api.js:624-627, 656-658; api.js:264-273. 409 is logged at error (harvest) or warn (connect) instead of info.

#### ❌ REQ-014 (MUST NOT) — Do not log 409 higher than info
api.js:626, 657 (`logger.error`); api.js:268-272 (`logger.warn`). The 24-hour reconnect is logged above info on every endpoint receiving it.

#### ✅ REQ-015 (MUST) — Back off to 300 s for connect/startup
api.js:22-29, 276, 288-292.
```js
const BACKOFFS = [{interval:15},{interval:15},{interval:30},{interval:60,warn:true},{interval:120},{interval:300}]
const backoff = BACKOFFS[Math.min(ctx.attempts, ctx.max) - 1]
setTimeout(function again() { api._login(api._retry.bind(api, ctx)) }, backoff.interval * TO_MILLIS)
```
Restart path uses this too (api.js:493).

#### ✅ REQ-016 (SHOULD) — Use sequence 15, 15, 30, 60, 120, 300
api.js:22-29 — sequence exactly 15, 15, 30, 60, 120, 300; consumed at api.js:276, 289-291.

#### ✅ REQ-017 (MUST) — 300 s delay for every retry thereafter
api.js:188, 276 — `Math.min(ctx.attempts, ctx.max) - 1` pins attempt 6+ at 300 s.

#### ✅ REQ-018 (MUST) — Retry indefinitely until success or 410
api.js:221-293. Only exits are success (231-236) and 410/SHUTDOWN (242-245). Everything else, including missing `agent_run_id` (398-401), reschedules (288-292). No attempt cap.

#### ✅ REQ-019 (MUST) — Warn after at least one minute of connect failures, including the error
api.js:246-274 warn with error/status on every failure; api.js:276-279 summary warn at 4th backoff.
```js
logger.warn(error, msg)
if (backoff.warn) { logger.warn('No connection has been established to New Relic after %d attempts.', ctx.attempts) }
```

#### ✅ REQ-020 (MAY) — Warning timing may be tied to nth backoff
api.js:26, 277-279 — warning tied to 4th backoff entry (`warn: true`).

#### ✅ REQ-021 (MUST) — Continue logging on every subsequent failure
api.js:246-274 — every branch warns on every attempt, no suppression.

#### ✅ REQ-022 (MUST) — Every connect attempt after failure begins with `preconnect`
api.js:192, 289-291, 295-302, 310-319, 388-395 — every attempt runs `_login` -> preconnect -> `_getFacts` -> connect; failure in either returns to `_retry`, which reschedules `_login`. Restarts begin at preconnect (api.js:493).

### 429 Responses and Independent Harvests

#### ✅ REQ-023 (MUST) — On 429, use normal retention and send on next harvest
api.js:39, 632-635 (429 -> `CollectorResponse.error`, retain); merged at base-aggregator.js:277-280, transaction-event-aggregator.js:138-141; sent next interval.

#### ✅ REQ-024 (MUST) — Ignore `Retry-After`
Searched `Retry-After`, `retry-after`, `retryAfter`, and response header reads in lib/. parse-response.js:61-64 uses only `statusCode` and body. `CollectorResponse.retryAfter` (response.js:18-20) is always 0 in `_handleResponseCode` and never read. No violation found.

### JSON Validity

#### ✅ REQ-025 (MUST NOT) — Do not alter behavior based on non-200 body
parse-response.js:45-66 sets payload null on invalid JSON and logs warn (57). `_handleResponseCode` branches only on status (api.js:619-648). `_onPreConnect`/`_onConnect` check `SUCCESS.has(status)` before reading body (api.js:311, 392). `agentRun` comes only from code-driven factories. Files checked: parse-response.js, api.js, response.js, remote-method.js, base-aggregator.js, transaction-event-aggregator.js. No violation found.

### Metrics

#### ❌ REQ-026 (SHOULD) — Generate HTTPError/Attempts/Duration metrics for every agent endpoint request
Searched lib/ for `Agent/Collector`, `HTTPError`, `/Attempts`, `/Duration` endpoint metrics — no matches. Only collector metrics present: `Supportability/Nodejs/Collector[/<method>]/Output/Bytes` (remote-method.js:86-92), `.../MaxPayloadSizeLimit/<method>` (remote-method.js:241-243), `Supportability/Registration/Attempts` (api.js:222-227).

#### ✅ REQ-027 (MAY) — Supportability metrics may be discarded with discarded data
Discard on metric_data drops the whole Metrics collection (base-aggregator.js:277-280, 324; metric-aggregator.js:49-68). The specified metrics are not generated in any case (REQ-026).

#### ✅ REQ-028 (MUST NOT) — No HTTPError metric for 200/202
`_handleResponseCode` (api.js:618-649) and `_retry` (221-293) record no status metrics. Files checked: api.js, remote-method.js, parse-response.js, metrics/names.js. No violation found; metric is absent entirely (REQ-026).

#### ✅ REQ-029 (MUST NOT) — No Attempts metric when only one attempt
The specified metric is never generated. Differently named `Supportability/Registration/Attempts` is incremented on every attempt including the first (api.js:222-227). Files checked: api.js, remote-method.js, metrics/names.js. No violation found.

#### ❌ REQ-030 (MUST) — Duration measured from just before sending to just before checking the response
Searched remote-method.js (`invoke`, `_post`, `_safeRequest`, `_request`) and api.js for `Date.now`, `hrtime`, `Timer`, `Duration` — no request timing or Duration metric exists.

### Data Collection Limits

#### ✅ REQ-031 (MUST) — Merge retained data back with next-harvest data
`_merge` on retain (base-aggregator.js:277-280; transaction-event-aggregator.js:137-142). Per type:
- Metrics: metric-aggregator.js:53-64 -> metrics/index.js:203-224
- Tx Traces: transaction/trace/aggregator.js:131-146
- Tx/Custom/Error/Span Events, Logs: event-aggregator.js:44-46, 120-148 -> priority-queue.js:106-120
- Slow SQL: db/query-trace-aggregator.js:43-52
- Error Traces: errors/error-trace-aggregator.js:52-63

pprof_data does not merge (profiling-aggregator.js:102-111) but is not in the spec table.

#### ✅ REQ-032 (SHOULD) — Retry non-harvest data at least once
Error traces merged back for next delivery (error-trace-aggregator.js:52-63). Thread profiles not implemented ("o").

#### ✅ REQ-033 (MAY) — May drop non-harvest data if retries fail
Error traces are not dropped after retries; capped only by aggregator limit (error-trace-aggregator.js:57-62).

## Implementation Index

### Retry On Next Harvest
- lib/collector/api.js:93-108, 129-139, 241-245, 435-450, 481, 500-516, 518-601, 618-649
- lib/aggregators/base-aggregator.js:203-206
- lib/agent.js:559, 775-778

### Harvest Data
- lib/collector/api.js:37-42, 523-548, 624-648, 656-658
- lib/collector/response.js:29-39
- lib/collector/remote-method.js:70-74, 163-175, 182-187, 244-249, 317
- lib/aggregators/base-aggregator.js:269-283, 315-324
- lib/aggregators/transaction-event-aggregator.js:137-142

### Agent Run
- lib/collector/api.js:33-36, 458-498, 576-594, 624-627, 640
- lib/agent.js:46-55, 434-440, 483-494, 538-541, 550-580, 754-756
- lib/tracer/index.js:186-188, 239
- lib/transaction-shim.js:247-249, 289
- subscribers/message-consumer-tools.js:102-106; subscribers/grpcjs/server.js:118-120; subscribers/azure-functions/azure-handler-base.js:26
- otel/traces/segments/server.js:20; otel/traces/segments/consumer.js:22

### Retries and Backoffs
- lib/collector/api.js:22-29, 172-193, 221-293, 295-302, 310-319, 374-401, 626, 657
- lib/aggregators/base-aggregator.js:203-206, 277-283
- lib/aggregators/transaction-event-aggregator.js:113-115

### 429 Responses and Independent Harvests
- lib/collector/api.js:39, 632-635
- lib/collector/response.js:18-20
- lib/collector/parse-response.js:61-64
- lib/aggregators/base-aggregator.js:277-280

### JSON Validity
- lib/collector/parse-response.js:45-66
- lib/collector/api.js:311, 392, 619-648

### Metrics
- lib/collector/remote-method.js:86-92, 241-243
- lib/collector/api.js:222-227, 221-293, 618-649

### Data Collection Limits
- lib/aggregators/base-aggregator.js:277-280
- lib/metrics/index.js:203-224; lib/aggregators/metric-aggregator.js:49-68
- lib/transaction/trace/aggregator.js:131-146
- lib/aggregators/event-aggregator.js:44-46, 120-148; lib/priority-queue.js:106-120
- lib/db/query-trace-aggregator.js:43-52
- lib/errors/error-trace-aggregator.js:52-63

## Gap Analysis

### Critical Gaps (MUST / MUST NOT non-compliant or partial)

No Approved Deviations or Documented Exceptions apply to any of these.

| REQ-ID | Type | Status | Gap |
|--------|------|--------|-----|
| REQ-001 | MUST | ⚠️ | `agent_settings` bypasses `_handleResponseCode`; failures not retried (api.js:435-450) |
| REQ-004 | MUST | ⚠️ | Runtime errors retained instead of discarded (remote-method.js:70-74, 163-175, 182-187; api.js:521-548) |
| REQ-005 | MUST | ⚠️ | Discard not logged as such for 401/409, 410, unexpected codes, max payload, `_toPayload` errors (api.js:626, 638, 646, 542-543; base-aggregator.js:269-274) |
| REQ-007 | MUST | ⚠️ | 410 ignored during restart reconnect (api.js:492-497); 410 on `agent_settings` unhandled; transaction-creation paths not gated by `canCollectData()` |
| REQ-012 | MUST | ⚠️ | Harvest network errors not logged above trace (base-aggregator.js:277-283); `agent_settings` failures logged at trace only |
| REQ-014 | MUST NOT | ❌ | 409 logged at error/warn (api.js:626, 657, 268-272) |
| REQ-030 | MUST | ❌ | No request Duration measurement or metric |

### Important Gaps (SHOULD / SHOULD NOT non-compliant or partial)

| REQ-ID | Type | Status | Gap |
|--------|------|--------|-----|
| REQ-008 | SHOULD | ⚠️ | Instrumentation never unwrapped (agent.js:538-541); subscriber/OTel paths remain active |
| REQ-013 | SHOULD | ❌ | 409 logged at error (harvest) or warn (connect), not info (api.js:624-627, 656-658, 264-273) |
| REQ-026 | SHOULD | ❌ | HTTPError, Attempts, Duration endpoint metrics not generated |

#### Pre-accepted (non-blocking)
None

### Optional Gaps (MAY non-compliant or unverified)
None

## Compliance Summary Matrix

| REQ-ID | Type | Category | Description | Status | Evidence |
|--------|------|----------|-------------|--------|----------|
| REQ-001 | MUST | Retry On Next Harvest | Retry endpoint on next harvest | ⚠️ | api.js:129-139, 518-601; base-aggregator.js:203-206; agent_settings gap api.js:435-450 |
| REQ-002 | MUST NOT | Retry On Next Harvest | No retry on 410 | ✅ | api.js:636-642, 241-245 |
| REQ-003 | MUST | Harvest Data | Retain data on Retain | ✅ | api.js:37-42, 632-635; base-aggregator.js:277-280 |
| REQ-004 | MUST | Harvest Data | Discard all data on Discard | ⚠️ | api.js:628-648; runtime errors retained remote-method.js:70-74, 163-187 |
| REQ-005 | MUST | Harvest Data | Log data discarded | ⚠️ | api.js:630, 656-658; missing at 626, 638, 646, 542-543 |
| REQ-006 | MUST | Agent Run | Preserve: continue running | ✅ | api.js:621-635, 643-648; response.js:29-39 |
| REQ-007 | MUST | Agent Run | Shutdown: call shutdown, stop collecting | ⚠️ | api.js:640; agent.js:550-580; gaps api.js:492-497 |
| REQ-008 | SHOULD | Agent Run | Disable instrumentation on shutdown | ⚠️ | agent.js:46-55, 538-541 |
| REQ-009 | MUST | Agent Run | Restart: call shutdown | ✅ | api.js:624-627, 487-498 |
| REQ-010 | MUST | Agent Run | Restart: reconnect immediately | ✅ | api.js:492-497; agent.js:483-494 |
| REQ-011 | SHOULD | Retries and Backoffs | Retry on next harvest cycle | ✅ | base-aggregator.js:203-206, 277-280 |
| REQ-012 | MUST | Retries and Backoffs | Log warn+ on retry failures (except 409) | ⚠️ | api.js:246-274, 626-657; gaps base-aggregator.js:277-283, api.js:441-443 |
| REQ-013 | SHOULD | Retries and Backoffs | 409 logged at info | ❌ | api.js:624-627, 656-658, 264-273 |
| REQ-014 | MUST NOT | Retries and Backoffs | 409 not logged above info | ❌ | api.js:626, 657, 268-272 |
| REQ-015 | MUST | Retries and Backoffs | Back off to 300 s for startup | ✅ | api.js:22-29, 276, 288-292 |
| REQ-016 | SHOULD | Retries and Backoffs | Sequence 15,15,30,60,120,300 | ✅ | api.js:22-29 |
| REQ-017 | MUST | Retries and Backoffs | 300 s thereafter | ✅ | api.js:188, 276 |
| REQ-018 | MUST | Retries and Backoffs | Retry indefinitely until success/410 | ✅ | api.js:221-293 |
| REQ-019 | MUST | Retries and Backoffs | Warn after one minute of failures | ✅ | api.js:246-279 |
| REQ-020 | MAY | Retries and Backoffs | Timing tied to nth backoff | ✅ | api.js:26, 277-279 |
| REQ-021 | MUST | Retries and Backoffs | Continue logging every failure | ✅ | api.js:246-274 |
| REQ-022 | MUST | Retries and Backoffs | Attempts begin with preconnect | ✅ | api.js:192, 289-319, 388-395 |
| REQ-023 | MUST | 429 Responses and Independent Harvests | 429: normal retention, next harvest | ✅ | api.js:39, 632-635; base-aggregator.js:277-280 |
| REQ-024 | MUST | 429 Responses and Independent Harvests | Ignore Retry-After | ✅ | parse-response.js:61-64; response.js:18-20 |
| REQ-025 | MUST NOT | JSON Validity | No behavior change on non-200 body | ✅ | parse-response.js:45-66; api.js:619-648 |
| REQ-026 | SHOULD | Metrics | Generate HTTPError/Attempts/Duration metrics | ❌ | No matches in lib/; remote-method.js:86-92, api.js:222-227 are different metrics |
| REQ-027 | MAY | Metrics | Metrics may be discarded with data | ✅ | base-aggregator.js:277-280, 324 |
| REQ-028 | MUST NOT | Metrics | No HTTPError for 200/202 | ✅ | api.js:221-293, 618-649 (metric absent) |
| REQ-029 | MUST NOT | Metrics | No Attempts if single attempt | ✅ | Metric absent; api.js:222-227 is different metric |
| REQ-030 | MUST | Metrics | Duration measured around request | ❌ | No timing in remote-method.js / api.js |
| REQ-031 | MUST | Data Collection Limits | Merge retained data | ✅ | base-aggregator.js:277-280; per-type aggregators |
| REQ-032 | SHOULD | Data Collection Limits | Retry non-harvest data at least once | ✅ | error-trace-aggregator.js:52-63 |
| REQ-033 | MAY | Data Collection Limits | May drop non-harvest data after retries fail | ✅ | error-trace-aggregator.js:57-62 |

## Inferred Requirements Review

> The following requirements were inferred from behavioral descriptions in the spec that do not
> use explicit RFC-style keywords. They are **not** counted in the compliance score above.
> Implemented items are candidates for adding MUST/SHOULD keywords to the spec. Unimplemented
> items are candidates for formalization before being tracked as compliance gaps.

### Implemented (candidate for keyword addition)

- ✅ **INF-001** — Per-code Retry / Harvest data / Agent run behavior from the HTTP response table.
  Basis: "| 400 | Bad request | One or more things about the format of the request is wrong | ✔ | Discard | Preserve |"
  Evidence: lib/collector/api.js:31-55, 618-649; lib/collector/response.js:29-51. `agent_settings` bypasses the table.
- ✅ **INF-002** — Unexpected HTTP errors: retry next harvest, discard, preserve.
  Basis: "| xxx | Unexpected | You've received an HTTP Error not specified here | ✔ | Discard | Preserve |"
  Evidence: api.js:643-648 (`logger.error` then `CollectorResponse.discard(null)`); log does not mention discard.
- ✅ **INF-004** — 407 from customer proxy handled per table.
  Basis: "* <sup>1</sup> Agents can receive `407 Proxy Authentication Required` responses when customers misconfigure their proxy. This is _not_ a response from any of New Relic's backend services that handle agent endpoints."
  Evidence: api.js:48 (discard set); connect path api.js:264-292; proxy warning api.js:204-213, 255-263.
- ✅ **INF-006** — Payload size checked against `max_payload_size_in_bytes`; discard if exceeded.
  Basis: "The agent should check the size of its payload against this value, if the payload exceeds `max_payload_size_in_bytes` it should discard the payload and retry the endpoint again at the next harvest."
  Evidence: lib/config/index.js:37, 882, 1095; remote-method.js:238-253; api.js:523-543. Check runs on post-compression body.
- ✅ **INF-007** — Node retries connect forever with 15, 15, 30, 60, 120, 300.
  Basis: "| Node    | ✔ <sup>4</sup> | 15, 15, 30, 60, 120, 300 |"
  Evidence: api.js:22-29, 241-292.
- ✅ **INF-008** — Independent harvests per endpoint.
  Basis: "| Node    | Yes (>= v5.12.0) |"
  Evidence: base-aggregator.js:200-207, 269-286; harvester.js:21-42.
- ✅ **INF-009** — 429 equivalent to 408.
  Basis: "Functionally a `429 Too Many Requests` is equivalent to a `408 Request Timeout` in that they will both result in the agent retaining the harvest data and making another request to the agent endpoint on the next harvest. The only difference is semantic."
  Evidence: api.js:37-42, 632-635 (shared `FAILURE_SAVE_DATA`).
- ✅ **INF-011** — Node retains/retries all eight data types; Thread Profile and Modules not implemented.
  Basis: "| Node  | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | o | o |"
  Evidence: merge per REQ-031; reservoir limits event-aggregator.js:128, error-trace-aggregator.js:57; method list api.js:93-108.

### Not Implemented (candidate for spec formalization)

- ❌ **INF-003** — 409 restart treated as expected operation, not presented as an error.
  Basis: "* <sup>3</sup> The collector requests that agents restart at least every 24 hours.  This should be considered an expected operation; it should not be presented to the user as an error."
  Searched: 409 handling; logged at error (api.js:626, 657) and warn (api.js:268-272).
- ⚠️ **INF-005** — Agent errors: Connection Error retains; Runtime Error and Max Payload Size discard.
  Basis: "| Connection Error | Retain | Preserve | ✔ |"
  Searched: Connection error retains (api.js:546) and max payload discards (remote-method.js:240-253, 182-187; api.js:523-543); runtime errors (remote-method.js:70-74, 163-175, 182-187) are retained (api.js:521-548).
- ⚠️ **INF-010** — Random jitter on backoff delays.
  Basis: "// Otherwise, wait a period and try again. The delay is adjusted by a random // 10% to prevent swarms of agents started at the same time from hammering // the network at the same time."
  Searched: api.js for `Math.random` and delay adjustment. Index cap present (api.js:188, 276); no jitter, fixed `backoff.interval * TO_MILLIS` (api.js:289-291).

### Unverified
None identified.
