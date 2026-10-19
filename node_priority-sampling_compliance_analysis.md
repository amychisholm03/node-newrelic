# Priority Sampling Specification Compliance Analysis — Node.js Agent

| Field | Value |
|-------|-------|
| Date | 2026-10-19 |
| Agent | Node.js |
| Agent Repository | /Users/achisholm/Desktop/amychisholm03-node-newrelic (branch: main, commit: 821848d) |
| Specification | Priority-Sampling.md |
| Spec Source | /Users/achisholm/Desktop/agent-specs/Priority-Sampling.md (branch: FY27Q3-nodejs-compliance, commit: 47662ac) |

## Executive Summary

**Overall compliance: 70.6%** (12 of 17 explicit requirements fully compliant)

| Status | Count |
|--------|-------|
| ✅ Compliant | 12 |
| ⚠️ Partial | 4 |
| ❌ Non-compliant | 1 |
| ❓ Unverified | 0 |
| **Total** | **17** |

Enumerated tally: REQ-001 ✅, REQ-002 ⚠️, REQ-003 ✅, REQ-004 ⚠️, REQ-005 ⚠️, REQ-006 ✅, REQ-007 ✅, REQ-008 ❌, REQ-009 ✅, REQ-010 ✅, REQ-011 ✅, REQ-012 ✅, REQ-013 ⚠️, REQ-014 ✅, REQ-015 ✅, REQ-016 ✅, REQ-017 ✅.

All sampled event pools (transaction, error, custom, log, span) use a priority queue backed by a Fibonacci heap with correct lowest-priority eviction and retain-on-failure merging. The partial MUST findings stem from lazy assignment of transaction priority (`null` until a sampling decision), sampler priority boosts that place stored transaction priorities outside 0.0–1.0, and `priority || Math.random()` fallbacks that replace a priority of `0` or `null` with an independent random value. Locally generated non-transaction priorities are not truncated to 6 decimal places.

### Compliance Breakdown by Category

| Category | ✅ | ⚠️ | ❌ | ❓ | Total |
|----------|----|----|----|----|-------|
| Motivation | 1 | 0 | 0 | 0 | 1 |
| Implementation — Transaction Flow | 2 | 3 | 0 | 0 | 5 |
| Implementation — Non-Transaction Flow | 2 | 0 | 1 | 0 | 3 |
| Implementation — Notes | 2 | 0 | 0 | 0 | 2 |
| Data Structure | 1 | 0 | 0 | 0 | 1 |
| Example | 3 | 1 | 0 | 0 | 4 |
| What To Do When Things Go Wrong | 1 | 0 | 0 | 0 | 1 |
| **Total** | **12** | **4** | **1** | **0** | **17** |

Approved Deviations: none for Node against Priority-Sampling.md. Documented Exceptions: none.

## Detailed Requirements Analysis

### Motivation

#### ✅ REQ-001 — Priority Sampling SHOULD be used instead of reservoir sampling

All sampled event pools extend `EventAggregator`, which wraps `PriorityQueue` (lib/aggregators/event-aggregator.js:10, lib/aggregators/event-aggregator.js:23, lib/aggregators/event-aggregator.js:108-110; lib/priority-queue.js:31-51):

```js
// event-aggregator.js
const PriorityQueue = require('../priority-queue')
...
    this._items = new PriorityQueue(opts.limit)
...
  addEvent(event, priority) {
    return this._items.add(event, priority)
  }
```

Consumers:
- Transaction events: lib/transaction/transaction-event-aggregator.js:15, constructed lib/agent.js:232-240
- Custom events: lib/custom-events/custom-event-aggregator.js:11, constructed lib/agent.js:242-251
- Error events: lib/errors/error-event-aggregator.js:13, constructed lib/agent.js:264-272
- Log events: lib/aggregators/log-aggregator.js:20, constructed lib/agent.js:274-282
- Span events: lib/spans/span-event-aggregator.js:17, constructed lib/spans/create-span-event-aggregator.js:86-95

No reservoir-sampling implementation exists in lib/; the only `reservoir` matches are the `reservoir_size` payload metadata key (lib/transaction/transaction-event-aggregator.js:36 and the span/error event aggregators). Infinite Tracing's `StreamingSpanEventAggregator` (lib/spans/streaming-span-event-aggregator.js:33) streams spans without pooling and therefore has no sampling pool; it is outside this spec's pool model.

### Implementation — Transaction Flow

#### ⚠️ REQ-002 — Agents MUST generate a random priority between 0.0 and 1.0 and store it in the transaction

Implemented: a random value in [0, 1) is generated and stored on every transaction that reaches a sampling decision. lib/samplers/sampler.js:40-44:

```js
  static generatePriority() {
    // eslint-disable-next-line sonarjs/pseudo-random
    const priority = Math.random()
    return ((priority * 1e6) | 0) / 1e6
  }
```

- Stored on the transaction: lib/samplers/adaptive-sampler.js:127-129 (default sampler), lib/samplers/ratio-based-sampler.js:27-29, lib/samplers/index.js:85-89 (DT disabled / both granularities disabled sets `transaction.priority = Sampler.generatePriority()`).
- Always assigned before the transaction finishes: lib/transaction/index.js:614 (`this.agent.samplers.applySamplingDecision({ transaction: this })` in `end()`).

Deviations from the spec text as written:

1. **Stored priority is not between 0.0 and 1.0 for sampled transactions.** lib/samplers/adaptive-sampler.js:129 and lib/samplers/ratio-based-sampler.js:29 store `Sampler.incrementPriority(initPriority, partialType)`, which adds +2 (full granularity) or +1 (partial granularity). lib/samplers/sampler.js:53-57:

   ```js
     static incrementPriority(priority, partialType) {
       const increment = partialType ? 1 : 2
       const newPriority = priority + increment
       return ((newPriority * 1e6) | 0) / 1e6
     }
   ```

   Sampled transactions therefore carry priorities in [1.0, 3.0).
2. **Non-random constant priorities.** `AlwaysOnSampler` stores 3.0 (full) / 2.0 (partial) at lib/samplers/always-on-sampler.js:12; `AlwaysOffSampler` stores 0 at lib/samplers/always-off-sampler.js:11.
3. **Not generated at transaction start.** lib/transaction/index.js:142-143 sets `this.priority = null` ("Lazy evaluate the priority and sampling in case we end up accepting a payload"). Priority is only set on demand, at lib/transaction/index.js:450, lib/transaction/index.js:614, lib/transaction/index.js:1034, lib/transaction/index.js:1074, or on inbound DT acceptance (lib/transaction/index.js:437; lib/transaction/distributed-trace/incoming-payload.js:100-108).

These behaviors appear to originate in the newer core-tracing sampler design; no Approved Deviation for Node exists against Priority-Sampling.md, so they are evaluated against this spec as written.

#### ✅ REQ-003 — Agents SHOULD truncate the transaction priority to at most 6 digits past the decimal point

lib/samplers/sampler.js:40-44 truncates via `((p * 1e6) | 0) / 1e6` (integer truncation, not rounding); the increment path at lib/samplers/sampler.js:53-57 also truncates. Every sampler that randomly generates a transaction priority uses these helpers:
- lib/samplers/adaptive-sampler.js:118-119, lib/samplers/adaptive-sampler.js:127-129
- lib/samplers/ratio-based-sampler.js:27-29
- lib/samplers/index.js:88

Tests: test/unit/samplers/sampler.test.js:25-35 (`0.123456789` truncated to 6 places).

The `tx.priority || Math.random()` fallback at lib/agent.js:836 produces an untruncated pool key for the transaction event when `tx.priority` is 0; that is tracked under REQ-005 (wrong priority used), not as truncation of the transaction's stored priority.

#### ⚠️ REQ-004 — Events created within the transaction MUST store the transaction's priority

Implemented (events carry `transaction.priority`):
- Error events, collected at transaction end via `onTransactionFinished` (lib/agent.js:857 → lib/errors/error-collector.js:158; in-transaction errors are deferred at lib/errors/error-collector.js:238-242, lib/errors/error-collector.js:275-279). lib/errors/error-collector.js:314-318:

  ```js
        const priority = (transaction && transaction.priority) || Math.random()
        const event = createEvent(transaction, errorTrace, exception.timestamp, this.config)
        this.eventAggregator.add(event, priority)
  ```
- Span events, generated after `applySamplingDecision` in `end()`: lib/spans/span-event-aggregator.js:92, lib/spans/span-event-aggregator.js:105 (`this.add(span, transaction.priority)`); partial traces at lib/transaction/trace/partial-trace.js:294; intrinsic attribute at lib/spans/span-event.js:117 and lib/spans/streaming-span-event.js:148.
- Log events: buffered per transaction (lib/aggregators/log-aggregator.js:74-78, lib/transaction/logs.js:27-33) and flushed with the transaction priority at end: lib/transaction/index.js:631 (`this.logs.flush(this.priority)`) → lib/transaction/logs.js:41-42 → lib/aggregators/log-aggregator.js:83-86.

Missing:
1. **Custom events recorded via `recordCustomEvent` mid-transaction usually do not get the transaction's priority.** api.js:1327-1330:

   ```js
     const tx = this.agent.getTransaction()
     // eslint-disable-next-line sonarjs/pseudo-random
     const priority = (tx && tx.priority) || Math.random()
     this.agent.customEventAggregator.add([intrinsics, filteredAttributes], priority)
   ```

   Transaction priority is lazily `null` (lib/transaction/index.js:143) and nothing assigns it at transaction start (all `applySamplingDecision` call sites: lib/transaction/index.js:450, lib/transaction/index.js:614, lib/transaction/index.js:1034, lib/transaction/index.js:1074). A custom event recorded before any outbound DT call, `isSampled()`, or inbound DT acceptance receives an independent `Math.random()` priority; the transaction later receives a different priority at `end()`, so the custom event and transaction event are not correlated.
2. **AI Monitoring (LLM) custom events never pass a priority**, even inside a transaction: lib/subscribers/ai-monitoring/base.js:99-102 and lib/subscribers/aws-sdk/middleware/bedrock/utils.js:65-68 call `agent.customEventAggregator.add([...])` with no priority argument, so lib/priority-queue.js:36 assigns `Math.random()`.
3. **Priority 0 is discarded.** With `AlwaysOffSampler` (`transaction.priority = 0`, lib/samplers/always-off-sampler.js:11), the `||` fallbacks at lib/errors/error-collector.js:316, api.js:1329 and lib/priority-queue.js:36 (log events flushed with priority 0 via lib/aggregators/log-aggregator.js:85) replace the transaction priority with a fresh random number for each event.

#### ⚠️ REQ-005 — The transaction event MUST use the priority generated in step 2

Implemented at lib/agent.js:836:

```js
  this.transactionEventAggregator.add(event, tx.priority || Math.random())
```

`_addEventFromTransaction` runs from the `transactionFinished` handler (lib/agent.js:350, lib/agent.js:845-866), after `applySamplingDecision` in `Transaction.end()` (lib/transaction/index.js:614, lib/transaction/index.js:634), so `tx.priority` is the transaction's stored priority. The `priority` intrinsic on the event also comes from the transaction (lib/transaction/index.js:448-454, via lib/agent.js:816-818).

Missing: when `tx.priority === 0` (configured `always_off` sampler, lib/samplers/always-off-sampler.js:11; or the ~1e-6-probability case where `generatePriority()` truncates to 0), the `||` fallback uses a new, untruncated `Math.random()` as the pool key instead of the transaction's priority. The event's `priority` intrinsic (0) then disagrees with the key used for sampling, and the transaction event is decorrelated from its error/log events, which also receive independent random keys (see REQ-004 item 3). The same `||` pattern appears at lib/agent.js:836, lib/errors/error-collector.js:316, api.js:1329 and lib/priority-queue.js:36.

#### ✅ REQ-006 — A full pool MUST drop the lowest priority event in favor of a higher priority event (transaction flow)

lib/priority-queue.js:31-51:

```js
PriorityQueue.prototype.add = function add(value, priority) {
  this.seen++
  if (this.limit <= 0) {
    return false
  }
  priority = priority || Math.random()
  if (this.length === this.limit) {
    return this._replace(value, priority)
  }
  this._data.insert(priority, value)
  return true
}

PriorityQueue.prototype._replace = function _replace(value, priority) {
  if (priority > this._data.findMinimum().key) {
    this._data.insert(priority, value)
    this._data.extractMinimum()
    return true
  }
  return false
}
```

Consumed by all transaction-flow pools via `EventAggregator.addEvent` (lib/aggregators/event-aggregator.js:48-60, lib/aggregators/event-aggregator.js:108-110): transaction events (lib/agent.js:836), error events (lib/errors/error-collector.js:318), custom events (api.js:1330), log events (lib/aggregators/log-aggregator.js:85), span events (lib/spans/span-event-aggregator.js:105, plus early reject at lib/spans/span-event-aggregator.js:92 using `getMinimumPriority()`, lib/priority-queue.js:27-29). Pool limits are configurable via `event_harvest_config.harvest_limits.*` (lib/agent.js:235, lib/agent.js:245, lib/agent.js:267, lib/agent.js:277, lib/spans/create-span-event-aggregator.js:90) and updated on reconnect via lib/aggregators/event-aggregator.js:95-106 → `setLimit` (lib/priority-queue.js:98-103).

### Implementation — Non-Transaction Flow

#### ✅ REQ-007 — Agents MUST generate a random priority between 0.0 and 1.0 and store it in the event

Non-transaction events receive a fresh random priority in [0, 1):
- Custom events: api.js:1328-1330 (`(tx && tx.priority) || Math.random()`; `tx` undefined → `Math.random()`).
- Error events: lib/errors/error-collector.js:241, lib/errors/error-collector.js:279 (`collect` called immediately without a transaction) → lib/errors/error-collector.js:316 `Math.random()`.
- Log events: lib/aggregators/log-aggregator.js:78-79 `super.add(logLine)` (no priority) → lib/priority-queue.js:36 `priority = priority || Math.random()`.
- LLM custom events outside a transaction: lib/subscribers/ai-monitoring/base.js:99 → lib/priority-queue.js:36.

The value is stored with the event as its heap key (lib/priority-queue.js:40).

#### ❌ REQ-008 — Agents SHOULD truncate the event priority to at most 6 digits past the decimal point

Every non-transaction path uses raw, untruncated `Math.random()` rather than `Sampler.generatePriority()`:

- api.js:1329 — custom events

  ```js
    const priority = (tx && tx.priority) || Math.random()
  ```
- lib/errors/error-collector.js:316 — error events

  ```js
        const priority = (transaction && transaction.priority) || Math.random()
  ```
- lib/priority-queue.js:36 — log events (lib/aggregators/log-aggregator.js:79) and LLM custom events

  ```js
    priority = priority || Math.random() // eslint-disable-line sonarjs/pseudo-random
  ```

Searched for truncation of these values (`1e6`, `toFixed`, `generatePriority` usage outside lib/samplers/): only lib/samplers/* and the outbound tracestate formatter (lib/transaction/tracecontext.js:103) truncate or round. Non-transaction event priorities carry ~16 decimal digits instead of at most 6.

#### ✅ REQ-009 — A full pool MUST drop the lowest priority event in favor of a higher priority event (non-transaction flow)

Same `PriorityQueue.add` / `_replace` logic as REQ-006 (lib/priority-queue.js:31-51). Non-transaction events reach it through the same `EventAggregator.add` → `addEvent` path: custom (api.js:1330), error (lib/errors/error-collector.js:318), log (lib/aggregators/log-aggregator.js:79 → lib/aggregators/event-aggregator.js:48-51). Supportability metrics for dropped events are recorded at lib/aggregators/event-aggregator.js:53-57.

### Implementation — Notes

#### ✅ REQ-010 — If the inserted event is the lowest priority, it MUST be dropped and the pool left unchanged

lib/priority-queue.js:44-51:

```js
PriorityQueue.prototype._replace = function _replace(value, priority) {
  if (priority > this._data.findMinimum().key) {
    ...
  }
  return false
}
```

When the incoming priority is ≤ the pool minimum, nothing is inserted or extracted and `false` is returned; the pool is unchanged (only `seen` is incremented, consistent with "events seen" accounting). The span pool short-circuits the same case before building the event (lib/spans/span-event-aggregator.js:92-97). Ties go to the existing event, consistent with dropping the event being inserted.

#### ✅ REQ-011 — Agents MUST NOT truncate the priority field of a received payload

Searched for truncation/rounding operations (`toFixed`, `1e6`, `Math.round`, `Math.floor`, `| 0`, `parseInt`) applied to inbound priority values and all writes to `transaction.priority`. Traced data flow:

- W3C tracestate: lib/w3c/tracestate.js:105 `intrinsics.priority = values[7]` → lib/w3c/tracestate-intrinsics.js:64-66 `parseFloat(value)` (full precision) → lib/w3c/tracestate.js:204-206 getter → lib/transaction/index.js:437 `applyDTSamplingDecision` → lib/samplers/index.js:144-157 → lib/samplers/adaptive-sampler.js:111-123 (`let initPriority = tracestate.priority ... transaction.priority = initPriority`, stored as-is; only a locally generated fallback is truncated at lib/samplers/adaptive-sampler.js:118-119).
- Legacy `newrelic` header: lib/transaction/distributed-trace/payload.js:45, lib/transaction/distributed-trace/payload.js:108-114 (`pr` copied verbatim to `priority`) → lib/transaction/distributed-trace/incoming-payload.js:100-101 (`this.#transaction.priority = data.priority`, stored as-is).
- Downstream consumers read the stored value unmodified: lib/agent.js:836, lib/transaction/index.js:454, lib/spans/span-event.js:117, lib/spans/span-event-aggregator.js:105, lib/errors/error-collector.js:316.

Test coverage: test/unit/transaction/distributed-trace/incoming-payload.test.js:197-220 (`pr: 1.9999999`, asserts "Should not truncate accepted priority").

Files checked: lib/w3c/tracestate.js, lib/w3c/tracestate-intrinsics.js, lib/transaction/tracecontext.js, lib/transaction/distributed-trace/{payload,incoming-payload,outgoing-payload}.js, lib/transaction/index.js, lib/samplers/*.js. No violation found.

Observations (not violations of the receive-side rule):
- Outbound tracestate rounds the priority to 6 places when propagating: lib/transaction/tracecontext.js:103 (`this.transaction.priority.toFixed(6)`). An inbound `0.1234567` is stored intact but propagated downstream as `0.123457` (rounded, not truncated). The outbound `newrelic` header (lib/transaction/distributed-trace/payload.js:132) is not rounded.
- When the remote-parent sampler is non-adaptive (always_on / always_off / trace_id_ratio_based), the inbound priority is replaced rather than truncated: lib/samplers/index.js:155-157 (W3C) and lib/samplers/index.js:191-197 (legacy, overwriting the value set at lib/transaction/distributed-trace/incoming-payload.js:101). This is sampler-configuration behavior defined elsewhere.

### Data Structure

#### ✅ REQ-012 — Agents SHOULD store events using a Heap or a Priority Queue

lib/priority-queue.js:8, lib/priority-queue.js:13:

```js
const Heap = require('@tyriar/fibonacci-heap').FibonacciHeap
...
  this._data = new Heap()
```

Dependency: package.json:216 (`"@tyriar/fibonacci-heap": "^2.0.7"`). Used by every event pool via lib/aggregators/event-aggregator.js:23, lib/aggregators/event-aggregator.js:92. `findMinimum()` is O(1) and `extractMinimum()` is O(log n) amortized (lib/priority-queue.js:28, lib/priority-queue.js:45-47).

### Example

#### ⚠️ REQ-013 — Events created in the presence of a transaction MUST use the transaction's priority

Same evidence as REQ-004 (restates Transaction Flow step 3).

Implemented: transaction events (lib/agent.js:836), error events (lib/errors/error-collector.js:316), span events (lib/spans/span-event-aggregator.js:105, lib/transaction/trace/partial-trace.js:294), log events (lib/transaction/index.js:631 → lib/aggregators/log-aggregator.js:83-86).

Missing:
- Custom events from `recordCustomEvent` generate a new random priority whenever the transaction's priority has not yet been lazily computed (api.js:1329 with lib/transaction/index.js:143).
- LLM custom events never use the transaction priority (lib/subscribers/ai-monitoring/base.js:99-102, lib/subscribers/aws-sdk/middleware/bedrock/utils.js:65-68).
- A transaction priority of 0 (always_off) is replaced by a new random priority for every event type (lib/agent.js:836, lib/errors/error-collector.js:316, api.js:1329, lib/priority-queue.js:36).

#### ✅ REQ-014 — Events created outside a transaction MUST get a newly generated priority

Same evidence as REQ-007: api.js:1329 (custom), lib/errors/error-collector.js:241 and lib/errors/error-collector.js:316 (errors), lib/aggregators/log-aggregator.js:79 → lib/priority-queue.js:36 (logs), lib/subscribers/ai-monitoring/base.js:99 → lib/priority-queue.js:36 (LLM). Each call produces a new `Math.random()` per event. The truncation gap is tracked under REQ-008.

#### ✅ REQ-015 — Event sampling pools MUST sort events by priority in decreasing order

lib/priority-queue.js:8, lib/priority-queue.js:13, lib/priority-queue.js:27-29, lib/priority-queue.js:44-51: events are keyed by priority in a min-heap, giving priority ordering with O(1) access to the lowest. Per the requirement context, heap / priority-queue storage satisfies the "sorted priority order" intent. Serialization (`toArray`, lib/priority-queue.js:78-96; `getRawEvents`, lib/priority-queue.js:53-76) emits heap traversal order rather than strictly descending order; no collector requirement for payload ordering was identified, so this does not affect sampling.

#### ✅ REQ-016 — A full pool MUST remove the lowest priority event before inserting the new event

lib/priority-queue.js:37-38, lib/priority-queue.js:44-51. When full and the new priority exceeds the minimum, the new event is inserted and the minimum extracted in the same synchronous call (`insert` then `extractMinimum`). Since the new key is strictly greater than the old minimum, the extracted node is always the previous lowest-priority event; the net effect equals "remove lowest, then insert", and the pool never observably exceeds `limit`. Applies to all pools (see REQ-006 for consumers).

### What To Do When Things Go Wrong

#### ✅ REQ-017 — Agents SHOULD NOT simply drop event data after a failed post

lib/aggregators/base-aggregator.js:269-286, lib/aggregators/base-aggregator.js:311-325:

```js
  send() {
    ...
    const data = this._getMergeData()
    ...
      this._runSend(data, this._toPayloadSync())
    ...
    this.clear()
  }
  _runSend(data, payload) {
    ...
    this.collector.send(this.method, payload, (_, response) => {
      if (response && response.retainData) {
        this._merge(data)
      }
```

- `_merge` → `mergeEvents` for all event pools: lib/aggregators/event-aggregator.js:44-46, lib/aggregators/event-aggregator.js:120-149.
- Split transaction-event payloads also merge on failure: lib/transaction/transaction-event-aggregator.js:137-141.
- `retainData` is set true for runtime/network errors (lib/collector/api.js:521-546) and per response-code tables (lib/collector/api.js:38-41 retain: 408, 429, 500, 503; lib/collector/api.js:50 discard: 413). Data is intentionally dropped only on `NR_REMOTE_METHOD_MAX_PAYLOAD_SIZE_EXCEEDED` (lib/collector/api.js:523-543) and in serverless mode (lib/collector/serverless.js:105), both governed by other specs.

## Implementation Index

### Motivation / Event Pools
- lib/aggregators/event-aggregator.js:10, lib/aggregators/event-aggregator.js:18-26, lib/aggregators/event-aggregator.js:108-110
- lib/priority-queue.js:31-51
- lib/transaction/transaction-event-aggregator.js:15, lib/transaction/transaction-event-aggregator.js:36
- lib/custom-events/custom-event-aggregator.js:11
- lib/errors/error-event-aggregator.js:13
- lib/aggregators/log-aggregator.js:20
- lib/spans/span-event-aggregator.js:17
- lib/spans/streaming-span-event-aggregator.js:33
- lib/agent.js:232-240, lib/agent.js:242-251, lib/agent.js:264-272, lib/agent.js:274-282
- lib/spans/create-span-event-aggregator.js:86-95

### Implementation — Transaction Flow
- Priority generation/truncation: lib/samplers/sampler.js:40-44, lib/samplers/sampler.js:53-57
- Samplers storing priority: lib/samplers/adaptive-sampler.js:118-119, lib/samplers/adaptive-sampler.js:127-129, lib/samplers/ratio-based-sampler.js:27-29, lib/samplers/index.js:85-89, lib/samplers/always-on-sampler.js:12, lib/samplers/always-off-sampler.js:11
- Lazy priority on transaction: lib/transaction/index.js:142-143
- `applySamplingDecision` call sites: lib/transaction/index.js:450, lib/transaction/index.js:614, lib/transaction/index.js:1034, lib/transaction/index.js:1074
- Transaction event: lib/agent.js:350, lib/agent.js:816-818, lib/agent.js:836, lib/agent.js:845-866; lib/transaction/index.js:448-454, lib/transaction/index.js:634
- Error events: lib/agent.js:857, lib/errors/error-collector.js:158, lib/errors/error-collector.js:238-242, lib/errors/error-collector.js:275-279, lib/errors/error-collector.js:314-318
- Span events: lib/spans/span-event-aggregator.js:92-97, lib/spans/span-event-aggregator.js:105, lib/transaction/trace/partial-trace.js:294, lib/spans/span-event.js:117, lib/spans/streaming-span-event.js:148
- Log events: lib/aggregators/log-aggregator.js:74-78, lib/aggregators/log-aggregator.js:83-86, lib/transaction/logs.js:27-33, lib/transaction/logs.js:41-42, lib/transaction/index.js:631
- Custom events: api.js:1327-1330
- LLM custom events: lib/subscribers/ai-monitoring/base.js:99-102, lib/subscribers/aws-sdk/middleware/bedrock/utils.js:65-68
- Pool eviction: lib/priority-queue.js:27-29, lib/priority-queue.js:31-51; lib/aggregators/event-aggregator.js:48-60
- Pool limits: lib/agent.js:235, lib/agent.js:245, lib/agent.js:267, lib/agent.js:277, lib/spans/create-span-event-aggregator.js:90, lib/aggregators/event-aggregator.js:95-106, lib/priority-queue.js:98-103
- Tests: test/unit/samplers/sampler.test.js:25-35

### Implementation — Non-Transaction Flow
- Custom events: api.js:1328-1330
- Error events: lib/errors/error-collector.js:241, lib/errors/error-collector.js:279, lib/errors/error-collector.js:316, lib/errors/error-collector.js:318
- Log events: lib/aggregators/log-aggregator.js:78-79, lib/priority-queue.js:36, lib/priority-queue.js:40
- LLM custom events: lib/subscribers/ai-monitoring/base.js:99
- Dropped-event supportability metrics: lib/aggregators/event-aggregator.js:53-57

### Implementation — Notes
- Lowest-priority insert rejection: lib/priority-queue.js:44-51, lib/spans/span-event-aggregator.js:92-97
- Inbound W3C tracestate priority: lib/w3c/tracestate.js:105, lib/w3c/tracestate.js:204-206, lib/w3c/tracestate-intrinsics.js:64-66, lib/transaction/index.js:437, lib/samplers/index.js:144-157, lib/samplers/adaptive-sampler.js:111-123
- Inbound `newrelic` header priority: lib/transaction/distributed-trace/payload.js:45, lib/transaction/distributed-trace/payload.js:108-114, lib/transaction/distributed-trace/incoming-payload.js:100-108
- Outbound propagation: lib/transaction/tracecontext.js:103, lib/transaction/distributed-trace/payload.js:132
- Non-adaptive remote-parent replacement: lib/samplers/index.js:155-157, lib/samplers/index.js:191-197
- Tests: test/unit/transaction/distributed-trace/incoming-payload.test.js:197-220

### Data Structure
- lib/priority-queue.js:8, lib/priority-queue.js:13, lib/priority-queue.js:28, lib/priority-queue.js:45-47
- package.json:216
- lib/aggregators/event-aggregator.js:23, lib/aggregators/event-aggregator.js:92

### Example
- Ordering/eviction: lib/priority-queue.js:27-29, lib/priority-queue.js:37-38, lib/priority-queue.js:44-51
- Serialization: lib/priority-queue.js:53-76, lib/priority-queue.js:78-96

### What To Do When Things Go Wrong
- lib/aggregators/base-aggregator.js:269-286, lib/aggregators/base-aggregator.js:311-325
- lib/aggregators/event-aggregator.js:44-46, lib/aggregators/event-aggregator.js:89-93, lib/aggregators/event-aggregator.js:120-149
- lib/priority-queue.js:106-121
- lib/transaction/transaction-event-aggregator.js:137-141
- lib/collector/api.js:38-41, lib/collector/api.js:50, lib/collector/api.js:521-546
- lib/collector/serverless.js:105

## Gap Analysis

### Critical Gaps (MUST / MUST NOT)

Approved Deviations: None. Documented Exceptions: None.

- **⚠️ REQ-002 (MUST)** — Transaction priority is not generated at transaction start (lazily `null`, lib/transaction/index.js:142-143); sampled transactions store boosted priorities in [1.0, 3.0) (lib/samplers/sampler.js:53-57, lib/samplers/adaptive-sampler.js:129, lib/samplers/ratio-based-sampler.js:29); always_on/always_off samplers store non-random constants 3.0/2.0 and 0 (lib/samplers/always-on-sampler.js:12, lib/samplers/always-off-sampler.js:11).
- **⚠️ REQ-004 (MUST)** — Custom events recorded via `recordCustomEvent` before the transaction's priority is lazily assigned receive an independent random priority (api.js:1329, lib/transaction/index.js:143); LLM custom events never pass a priority (lib/subscribers/ai-monitoring/base.js:99-102, lib/subscribers/aws-sdk/middleware/bedrock/utils.js:65-68); a transaction priority of 0 is replaced by `Math.random()` via `||` fallbacks (lib/errors/error-collector.js:316, api.js:1329, lib/priority-queue.js:36).
- **⚠️ REQ-005 (MUST)** — When `tx.priority === 0`, the transaction event's pool key is a fresh `Math.random()` instead of the transaction priority (lib/agent.js:836), disagreeing with the event's `priority` intrinsic.
- **⚠️ REQ-013 (MUST)** — Same gaps as REQ-004: custom events before lazy priority assignment (api.js:1329), LLM custom events (lib/subscribers/ai-monitoring/base.js:99-102, lib/subscribers/aws-sdk/middleware/bedrock/utils.js:65-68), and priority-0 replacement (lib/agent.js:836, lib/errors/error-collector.js:316, api.js:1329, lib/priority-queue.js:36).

### Important Gaps (SHOULD / SHOULD NOT)

- **❌ REQ-008 (SHOULD)** — Locally generated non-transaction event priorities are untruncated `Math.random()` values (api.js:1329, lib/errors/error-collector.js:316, lib/priority-queue.js:36).

#### Pre-accepted (non-blocking)

None.

### Optional Gaps (MAY)

None. The spec contains no MAY requirements.

## Compliance Summary Matrix

| REQ-ID | Type | Category | Description | Status | Evidence |
|--------|------|----------|-------------|--------|----------|
| REQ-001 | SHOULD | Motivation | Use Priority Sampling instead of reservoir sampling | ✅ | lib/aggregators/event-aggregator.js:23, lib/priority-queue.js:31-51 |
| REQ-002 | MUST | Implementation — Transaction Flow | Generate random priority 0.0–1.0 and store in transaction | ⚠️ | lib/samplers/sampler.js:40-44, lib/samplers/sampler.js:53-57, lib/transaction/index.js:142-143, lib/samplers/always-on-sampler.js:12, lib/samplers/always-off-sampler.js:11 |
| REQ-003 | SHOULD | Implementation — Transaction Flow | Truncate transaction priority to ≤6 decimal places | ✅ | lib/samplers/sampler.js:40-44, lib/samplers/sampler.js:53-57 |
| REQ-004 | MUST | Implementation — Transaction Flow | Events in transaction store transaction's priority | ⚠️ | lib/errors/error-collector.js:316, lib/spans/span-event-aggregator.js:105, api.js:1329, lib/subscribers/ai-monitoring/base.js:99-102 |
| REQ-005 | MUST | Implementation — Transaction Flow | Transaction event uses the transaction's generated priority | ⚠️ | lib/agent.js:836 |
| REQ-006 | MUST | Implementation — Transaction Flow | Full pool drops lowest priority event (transaction flow) | ✅ | lib/priority-queue.js:31-51 |
| REQ-007 | MUST | Implementation — Non-Transaction Flow | Generate random priority 0.0–1.0 and store in event | ✅ | api.js:1328-1330, lib/errors/error-collector.js:316, lib/priority-queue.js:36 |
| REQ-008 | SHOULD | Implementation — Non-Transaction Flow | Truncate event priority to ≤6 decimal places | ❌ | api.js:1329, lib/errors/error-collector.js:316, lib/priority-queue.js:36 |
| REQ-009 | MUST | Implementation — Non-Transaction Flow | Full pool drops lowest priority event (non-transaction flow) | ✅ | lib/priority-queue.js:31-51 |
| REQ-010 | MUST | Implementation — Notes | Lowest-priority inserted event is dropped, pool unchanged | ✅ | lib/priority-queue.js:44-51, lib/spans/span-event-aggregator.js:92-97 |
| REQ-011 | MUST NOT | Implementation — Notes | Do not truncate received payload priority | ✅ | lib/w3c/tracestate-intrinsics.js:64-66, lib/samplers/adaptive-sampler.js:111-123, lib/transaction/distributed-trace/incoming-payload.js:100-101 |
| REQ-012 | SHOULD | Data Structure | Store events in a Heap or Priority Queue | ✅ | lib/priority-queue.js:8, lib/priority-queue.js:13, package.json:216 |
| REQ-013 | MUST | Example | In-transaction events use transaction's priority | ⚠️ | api.js:1329, lib/subscribers/ai-monitoring/base.js:99-102, lib/agent.js:836 |
| REQ-014 | MUST | Example | Non-transaction events get new priority | ✅ | api.js:1329, lib/errors/error-collector.js:316, lib/priority-queue.js:36 |
| REQ-015 | MUST | Example | Pools sort events by priority, highest first | ✅ | lib/priority-queue.js:13, lib/priority-queue.js:27-29, lib/priority-queue.js:44-51 |
| REQ-016 | MUST | Example | Full pool removes lowest priority before inserting new event | ✅ | lib/priority-queue.js:37-38, lib/priority-queue.js:44-51 |
| REQ-017 | SHOULD NOT | What To Do When Things Go Wrong | Do not simply drop data on failed post | ✅ | lib/aggregators/base-aggregator.js:277-280, lib/aggregators/event-aggregator.js:120-149 |

## Inferred Requirements Review

> The following requirements were inferred from behavioral descriptions in the spec that do not
> use explicit RFC-style keywords. They are **not** counted in the compliance score above.
> Implemented items are candidates for adding MUST/SHOULD keywords to the spec. Unimplemented
> items are candidates for formalization before being tracked as compliance gaps.

### Implemented (candidate for keyword addition)

#### ✅ INF-001 (implied-SHOULD) — Failed-post event data is merged back into the next harvest cycle

**Basis:** "Much like metric data, it needs to be merged back with the subsequent harvest cycle's data." (spec:64)

**Evidence:** lib/aggregators/base-aggregator.js:277-280 (`if (response && response.retainData) this._merge(data)`); lib/aggregators/event-aggregator.js:120-149 (`mergeEvents` re-merges into the next cycle's queue, which `clear()` replaced at lib/aggregators/event-aggregator.js:89-93); lib/transaction/transaction-event-aggregator.js:137-141 (split payloads).

#### ✅ INF-003 (implied-MUST) — Eviction only applies once a pool reaches its maximum size

**Basis:** "This document describes the sampling algorithm used by agents to determine which events to store between harvests when maximum limits have been reached." (spec:7)

**Evidence:** lib/priority-queue.js:37-41 — while `this.length < this.limit`, events are inserted unconditionally; eviction (`_replace`) happens only when `this.length === this.limit`. `getMinimumPriority()` returns 0 while not full (lib/priority-queue.js:27-29), so the span early reject (lib/spans/span-event-aggregator.js:92) never rejects before the pool fills.

#### ✅ INF-004 (implied-MUST) — Each event type is kept in its own discrete pool with its own limit

**Basis:** "Events are sent to discrete event pools within the agent" (spec:26)

**Evidence:** Separate aggregator instances, each with its own `PriorityQueue` and configurable limit: lib/agent.js:232-240 (`analytic_event_data`), lib/agent.js:242-251 (`custom_event_data`), lib/agent.js:264-272 (`error_event_data`), lib/agent.js:274-282 (`log_event_data`), lib/spans/create-span-event-aggregator.js:86-95 (`span_event_data`). Cross-pool coordination comes from sharing `transaction.priority` (see REQ-004 for the gaps).

#### ✅ INF-005 (implied-MUST) — Priority sampling applies to transaction, error, and custom events (not limited to)

**Basis:** "Agents send up multiple types of events to Insights including (but not limited to) [transaction events](Transaction-Events-PORTED.md), [error events](Errors.md#error-events) and [custom events](https://newrelic.atlassian.net/wiki/spaces/eng/pages/86311316/Custom+Events+in+New+Relic+Agents)." (spec:12)

**Evidence:** Transaction events (lib/transaction/transaction-event-aggregator.js:15), error events (lib/errors/error-event-aggregator.js:13), custom events (lib/custom-events/custom-event-aggregator.js:11), log events (lib/aggregators/log-aggregator.js:20) and span events (lib/spans/span-event-aggregator.js:17) all extend `EventAggregator` → `PriorityQueue`. Infinite Tracing span streaming (lib/spans/streaming-span-event-aggregator.js:33) does not pool or sample, by design.

### Not Implemented (candidate for spec formalization)

#### ⚠️ INF-002 (implied-SHOULD) — Merging a failed pool preserves sampling semantics

**Basis:** "Note that merging two sampled event pools incurs overhead: In order to preserve uniform sampling, the events from one event pool cannot simply be added to the other event pool using the normal add mechanism." (spec:64)

**Evidence:** Implemented: the merge is priority-respecting — each retained event is re-added with its original priority key, so the highest-priority events across both pools survive up to the limit. lib/priority-queue.js:106-121:

```js
  if (events instanceof PriorityQueue) {
    while (events.length) {
      const current = events._data.extractMinimum()
      this.add(current.value, current.key)
    }
  }
```

Missing: the failed pool's "events seen" total is not carried over. `merge` calls the normal `add`, which increments `seen` by one per retained event (lib/priority-queue.js:32), and `events.seen` of the failed pool is never read. The next harvest's `events_seen` (e.g. lib/transaction/transaction-event-aggregator.js:35-38) therefore undercounts by the failed pool's overflow (`seen - length`). Supportability `SEEN` is likewise incremented by `events.length` rather than `events.seen` (lib/aggregators/event-aggregator.js:136-140). The logged `toMerge` count (lib/aggregators/event-aggregator.js:128) is an estimate, since higher-priority incoming events can still displace existing ones. The spec does not specify the merge algorithm or the expected seen-count combination.

#### ⚠️ INF-006 (implied-MUST) — Priority is a uniformly random float in 0.0–1.0, unbiased over time

**Basis:** "Agents **MUST** generate a random priority between 0.0 and 1.0 and store it in the transaction." (spec:24)

**Evidence:** Implemented: the base priority comes from `Math.random()` (uniform, not time-based) in every path — lib/samplers/sampler.js:42, api.js:1329, lib/errors/error-collector.js:316, lib/priority-queue.js:36.

Missing / deviations: the final transaction priority is not a pure uniform random number in [0.0, 1.0]:
- Sampled transactions are boosted by +2/+1 (lib/samplers/sampler.js:53-57), so pools are biased toward sampled transactions and their correlated events.
- always_on / always_off samplers store constants 3.0/2.0 and 0 (lib/samplers/always-on-sampler.js:12, lib/samplers/always-off-sampler.js:11).
- The adaptive sampler's sampled/not-sampled decision is time-window dependent (threshold starts at 0 and the first window samples the first `sampling_target` transactions — lib/samplers/adaptive-sampler.js:98-106, lib/samplers/adaptive-sampler.js:147-160), so the +2 boost can concentrate on transactions early in a sampling window, a mild time bias in effective priority.

The spec does not address how sampler priority boosts interact with the 0.0–1.0 range.

#### ❌ INF-007 (implied-MAY, LEGACY) — Legacy reservoir sampling

**Basis:** "This technique assumes that you will set a fixed maximum number of event records to keep in memory at any given point in time. While the number of stored records is less than the maximum, new records are appended unconditionally. Once the number of records stored reaches the maximum, new incoming events either replace previously-chosen events, or are discarded (with low probability)." (spec:71)

**Evidence / searched:** `reservoir`, random-replacement logic, and the Ruby/Go/PHP/C reservoir supportability metric names in lib/. No reservoir-sampling buffer exists; all pools use priority sampling (see REQ-001). Only the `reservoir_size` payload metadata key remains (lib/transaction/transaction-event-aggregator.js:36).

**Note:** Non-implementation is the expected outcome — the spec section is legacy/historical (spec:71) and REQ-001 states Priority Sampling SHOULD be used instead. Node emits `Supportability/AnalyticsEvents/TotalEventsSeen` and `Supportability/AnalyticsEvents/TotalEventsSent` for transaction events (lib/metrics/names.js:43-47, recorded at lib/aggregators/event-aggregator.js:49-56), matching the Go/PHP/C metric names listed in the legacy section, but tied to the priority queue rather than a reservoir.

### Unverified

None identified.
