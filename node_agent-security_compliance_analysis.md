# Agent Security Specification Compliance Analysis — Node.js Agent

| Field | Value |
|-------|-------|
| Date | 2026-10-19 |
| Agent | Node.js |
| Agent Repository | /Users/achisholm/Desktop/amychisholm03-node-newrelic (branch: main, commit: 821848d) |
| Specification | Agent-Security.md |
| Spec Source | /Users/achisholm/Desktop/agent-specs/Agent-Security.md (branch: FY27Q3-nodejs-compliance, commit: 47662ac) |

## Executive Summary

**Overall compliance: 48.6%** (17 of 35 explicit requirements fully compliant)

| Status | Count |
|--------|-------|
| ✅ Compliant | 17 |
| ⚠️ Partial | 10 |
| ❌ Non-compliant | 5 |
| ❓ Unverified | 3 |
| **Total** | **35** |

Approved Deviations applied: none (Deviations.md has no Node rows). Documented Exceptions applied: none. The 7 inferred requirements (INF-001 to INF-007) are not counted.

### Compliance Breakdown by Category

| Category | ✅ | ⚠️ | ❌ | ❓ | Total |
|----------|----|----|----|----|-------|
| Agent Security Settings | 0 | 1 | 0 | 0 | 1 |
| Secure by Default | 1 | 2 | 0 | 0 | 3 |
| Datastore queries (SQL obfuscation) | 2 | 3 | 0 | 2 | 7 |
| Explain Plans | 2 | 0 | 0 | 0 | 2 |
| Datastore Segment API | 1 | 0 | 3 | 0 | 4 |
| Infrastructure Context | 1 | 1 | 0 | 0 | 2 |
| Custom Attributes | 2 | 1 | 0 | 0 | 3 |
| Background jobs | 4 | 0 | 0 | 0 | 4 |
| URI Request Parameters | 1 | 1 | 1 | 0 | 3 |
| Request / Response Headers | 3 | 1 | 1 | 0 | 5 |
| Security Review | 0 | 0 | 0 | 1 | 1 |
| **Total** | **17** | **10** | **5** | **3** | **35** |

**Key findings:**
- When the OpenTelemetry bridge is enabled (`opentelemetry.enabled`, default false), it forwards raw `db.query.text`, `db.statement` and `url.query` span attributes, including under High Security Mode (REQ-001, REQ-005, REQ-007, REQ-021, REQ-027).
- Outbound HTTP query parameters are added as `request.parameters.*` span-event attributes by default, without an explicit include (REQ-029).
- Location and Refresh headers are never stripped of query parameters, and Referer is cut only at `?`, not `;` (REQ-034).
- undici/fetch keeps `;` matrix parameters in the `url` attribute and segment name (REQ-027).
- There is no `collect_slow_queries_from` setting, and the datastore API has no raw-vs-obfuscated flag (REQ-015, REQ-016, REQ-017).
- Defaults are not HSM-equivalent for `strip_exception_messages`, log forwarding, outbound request parameters, or the template's `allow_all_headers: true` (REQ-002).

## Detailed Requirements Analysis

### Agent Security Settings

#### ⚠️ REQ-001 — When configured, agents MUST enforce specific security settings (High Security Mode)

**Implemented:**
- HSM is applied when the config is constructed, and every HSM key is forced to its secure value: lib/config/index.js:124-126 (call) and lib/config/index.js:330-366 (`#applyHighSecurity`, `checkNode('', this, HSM.HIGH_SECURITY_SETTINGS)`). The settings come from lib/config/hsm.js:11-64: `ssl`, `strip_exception_messages.enabled: true`, `allow_all_headers: false`, `attributes.include: []` for all destinations, `transaction_tracer.record_sql: 'obfuscated'`, `slow_sql.enabled: false`, and log forwarding, ai_monitoring and profiling turned off.
- `request.parameters.*` is added to the global exclude list: lib/config/index.js:338.
- The server cannot override HSM keys: lib/config/index.js:589-597. If the local and server HSM settings disagree, the agent is disabled: lib/config/index.js:1649-1653.
- API gates: `addCustomAttribute` at api.js:264-266, `addCustomSpanAttribute` at api.js:372-377, `noticeError` custom attributes at api.js:443-444 and lib/errors/index.js:211, and `recordCustomEvent` at api.js:1264-1266.
- Instrumentation gates: route params at lib/shim/webframework-shim/middleware.js:71 and lib/transaction/index.js:715; message params at lib/subscribers/message-consumer-tools.js:54,63 and lib/shim/message-shim/subscribe-consume.js:193; error messages at lib/errors/helper.js:65 and lib/errors/index.js:231,280; OTel rule attributes flagged `highSecurity` at lib/otel/traces/span-processor.js:263-266.

```js
// lib/config/index.js:124-126
if (this.high_security) {
  this.#applyHighSecurity()
}
```

**Missing:**
- **The OTel bridge bypasses HSM.** lib/otel/traces/attr-reconciler.js:35-47 copies every unmapped OTel span attribute onto the segment with no HSM check. A runtime check with `high_security: true` and `opentelemetry.enabled: true` found `"db.query.text":"select foo from test where ssn = '123-45-6789';"` in the segment's SPAN_EVENT and TRANS_SEGMENT attributes, and `"url.query":"token=secret"` on the server span. Only rule attributes explicitly flagged `highSecurity` are dropped (lib/otel/traces/span-processor.js:263).
- There is no HSM gate on third-party datastore data, because `collect_slow_queries_from` does not exist (see REQ-016).

### Secure by Default

#### ⚠️ REQ-002 — Agents SHOULD be secure on initial installation and follow the same standards as if HSM were enabled

**Defaults that match HSM:**

| Setting | Default | Reference |
|---------|---------|-----------|
| `ssl` | always `true` (`const: true`) | lib/config/schemas/root.js:204-208 |
| `transaction_tracer.record_sql` | `'obfuscated'` | lib/config/schemas/transaction-tracer.js:62-71 |
| `allow_all_headers` | `false` | lib/config/schemas/root.js:52-56 |
| `attributes.include` | `[]` | lib/config/schemas/attributes.js:29 |
| `slow_sql.enabled` | `false` | lib/config/schemas/slow-sql.js:13-16 |
| `ai_monitoring.enabled` | `false` | lib/config/schemas/ai-monitoring.js:15 |
| `profiling.enabled` | `false` | lib/config/schemas/profiling.js:15 |
| Inbound `request.parameters.*` | destination `DESTS.NONE` (needs an explicit include) | lib/transaction/index.js:544-557 |

**Defaults that differ from HSM:**

| Setting | Default | HSM value | Reference |
|---------|---------|-----------|-----------|
| `strip_exception_messages.enabled` | `false` | `true` | lib/config/schemas/strip-exception-messages.js:15 |
| `application_logging.forwarding.enabled` | `true` | `false` | lib/config/schemas/application-logging.js:21-23 |
| Outbound `request.parameters.*` | SPAN_EVENT (via `addSpanAttribute`) | excluded | lib/transaction/trace/segment.js:296-298 |
| `allow_all_headers` in the shipped template | `true` | `false` | newrelic.js:40 |

Verified: `attributeFilter.filterSegment(SPAN_EVENT,'request.parameters.a')` returns 16 (SPAN_EVENT) by default and 0 under HSM. Having custom attributes and events enabled by default is the exception the spec permits (see REQ-003).

#### ✅ REQ-003 — Agents SHOULD allow the user to customize the system through custom APIs or configurations

Outside HSM, customers can customize through APIs and configuration. The custom attribute and event APIs are on by default and can each be switched off: api.js:257-270 (`addCustomAttribute`), api.js:365-381, api.js:1257-1270 (`recordCustomEvent`), and lib/config/schemas/api.js:13-30 (`api.custom_attributes_enabled`, `custom_events_enabled`, `notice_error_enabled`). Attribute include/exclude lists are user-configurable (lib/config/attribute-filter.js:212-237), and so are `record_sql` and `allow_all_headers`.

```js
// api.js:263-269
if (this.agent.config.high_security) {
  ...return false
} else if (!this.agent.config.api.custom_attributes_enabled) {
  ...return false
}
```

#### ⚠️ REQ-004 — Agents SHOULD provide a documented configuration suggestion that sets all HSM settings

**Implemented:** the shipped config template newrelic.js:42-61 documents a suggested `attributes.exclude` list: cookie, authorization, proxyAuthorization, setCookie* and x* for both request and response headers.

**Missing:** the repo has no documented suggestion that sets *all* HSM-equivalent settings individually. Absent items include `strip_exception_messages.enabled: true`, `record_sql: 'obfuscated'`, `attributes.exclude: ['request.parameters.*']`, `application_logging.forwarding.enabled: false`, `slow_sql` and the `api.*` toggles. README.md, documentation/, examples/, newrelic.js and the lib/config/schemas/*.js descriptions were searched for "high security", "high_security" and "secure" config recipes. The only hit was documentation/otel/otel-transformation-rules.md:89. Public docs.newrelic.com content cannot be checked from source.

### Datastore queries (SQL obfuscation)

#### ⚠️ REQ-005 — Agents MUST obfuscate the query parameters by default

**Implemented:** every built-in query-capture path goes through `agent.queries.add()` and so through `obfuscate()`. `record_sql` defaults to `'obfuscated'`.
- lib/metrics/recorders/database.js:62-70 calls `transaction.agent.queries.add({... query: this.raw ...})`.
- lib/db/query-trace-aggregator.js:61-77: with `'obfuscated'`, only `sql_obfuscated` is added to the segment.
- lib/db/slow-query.js:13-14: `this.obfuscated = obfuscate(query, type)`.
- lib/db/query-sample.js:108-117: the slow-SQL payload uses `trace.obfuscated` unless `'raw'` is set.
- lib/spans/span-event.js:517-529: `db.statement` on span events uses `sql_obfuscated`.

Callers: lib/shim/datastore-shim.js:374-397 (shim-based instrumentation), lib/subscribers/db-query.js:44-67 (pg, mysql, mysql2, cassandra-driver and elasticsearch subscribers), lib/instrumentation/@prisma/client.js:104-115 and lib/otel/traces/segments/database.js:24-40.

**Missing:** in the **OTel bridge path**, the raw query also reaches the segment. lib/otel/traces/attr-reconciler.js:35-47 adds `db.query.text` (rules 300/304/311, semconv 1.40) and `db.statement` (rules 305/310, semconv 1.17/1.24) unmodified. Those keys are only referenced as `segment.statement` and are never added to `excludeAttributes` (lib/otel/traces/span-processor.js:248-271, lib/otel/traces/utils.js:123-138). A runtime check found `"db.query.text":"select foo from test where ssn = '123-45-6789';"` in the segment's TRANS_SEGMENT and SPAN_EVENT attributes, both with the default `record_sql` and under HSM. On span events the obfuscated value overwrites `db.statement` (lib/spans/span-event.js:528), but the raw `db.statement` stays on transaction-trace segments and `db.query.text` stays everywhere. The bridge is off by default (lib/config/schemas/opentelemetry.js:15).

#### ⚠️ REQ-006 — Agents SHOULD use the listed standards for reporting datastore information

The spec lists three standards:
- REQ-007 (MUST obfuscate by default): ⚠️ Partial, because of the OTel bridge.
- REQ-008 (don't record unparseable queries): ✅.
- REQ-009 (raw only when HSM is off and raw is configured): ✅.

The partial status comes from the OTel raw-attribute path in lib/otel/traces/attr-reconciler.js:35-47.

#### ⚠️ REQ-007 — Agents MUST default to obfuscate (mask) all datastore query parameters

**Implemented:** `transaction_tracer.record_sql` defaults to `'obfuscated'` (lib/config/schemas/transaction-tracer.js:62-71). Obfuscation lives in lib/util/sql/obfuscate.js:45-85. Dialect regexes replace string, numeric, boolean, hex and UUID literals and comments with `?`, and unknown dialects fall back to mysql (lib/util/sql/obfuscate.js:72, lib/util/sql/obfuscate.js:75-78). The obfuscated value is used at lib/db/slow-query.js:14 and lib/db/query-trace-aggregator.js:66-69. All built-in datastore instrumentation is covered (see REQ-005). Runtime check: `obfuscate("select * from t where a='secret' and b=42",'mssql')` returns `select * from t where a=? and b=?`.

```js
// lib/db/query-trace-aggregator.js:66-69
case 'obfuscated':
  slowQuery = new SlowQuery({ transaction, segment, type, query, trace })
  segment.addAttribute('sql_obfuscated', slowQuery.obfuscated, true)
```

**Missing:** when the OTel bridge is enabled, the raw `db.query.text` and `db.statement` OTel attributes are forwarded unobfuscated (lib/otel/traces/attr-reconciler.js:43-45). They are not removed when `record_sql` is `obfuscated` or `off`, and not under HSM (verified at runtime).

#### ✅ REQ-008 — Agents SHOULD disable query recording entirely if unable to parse the query parameters

lib/util/sql/obfuscate.js:105-113. After literal replacement, every dialect runs an `unmatchedPairs` check (lib/util/sql/obfuscate.js:47, 54, 59, 64, 69). If an unbalanced quote or comment delimiter is left over, the whole query is replaced with `?`, so no query text is recorded.

```js
// lib/util/sql/obfuscate.js:105-113
function unmatchedPairs(regex) {
  function check(sql) {
    return regex.test(sql) ? '?' : sql
  }
```

Runtime check: `obfuscate("select * from t where a='x", 'mysql')` returns `?`. When a parser cannot extract a query (lib/db/query-parsers/mongodb.js returns no `query`), nothing is recorded: `ParsedStatement.raw` stays `''` (lib/db/parsed-statement.js:13-18; lib/metrics/recorders/database.js:62).

#### ✅ REQ-009 — Agents MAY report the raw query if HSM is disabled and raw queries are configured

Raw SQL is reported only when the user explicitly sets `transaction_tracer.record_sql: 'raw'` (lib/db/query-trace-aggregator.js:62-65; lib/db/query-sample.js:110-111). HSM forces `record_sql: 'obfuscated'` (lib/config/hsm.js:20-21, applied at lib/config/index.js:334), and the server cannot set it (lib/config/index.js:1364-1376, plus HSM key blocking at lib/config/index.js:589-597).

```js
// lib/db/query-trace-aggregator.js:62-65
case 'raw':
  slowQuery = new SlowQuery({ segment, transaction, type, query, trace })
  segment.addAttribute('sql', slowQuery.query, true)
```

The OTel raw-attribute leak is a separate failure of default obfuscation, tracked under REQ-005 and REQ-007.

#### ❓ REQ-010 — All built-in datastore capture MUST have its obfuscation reviewed by the security team

This is a process requirement. The search for review records covered CONTRIBUTING.md, .github/PULL_REQUEST_TEMPLATE.md, .github/ISSUE_TEMPLATE and the comments in lib/util/sql/obfuscate.js. The header comment at lib/util/sql/obfuscate.js:10-25 discusses the tradeoffs of the regex approach but does not mention a security review. The code shows that all built-in SQL capture shares one obfuscator (REQ-005), except the OTel bridge raw-attribute path. A security-team review cannot be confirmed from source.

#### ❓ REQ-011 — Documentation SHOULD encourage parameterized queries and warn against sensitive literals

README.md, documentation/, examples/, newrelic.js, the lib/config/schemas/*.js descriptions and the API JSDoc in api.js were searched for "parameterized", "prepared statement" and "literal". No customer guidance was found. Customer documentation lives on docs.newrelic.com, outside this repo, so this cannot be confirmed.

### Explain Plans

#### ✅ REQ-012 — Agents MUST NOT run anything but an explain plan on the customer's database

No violation found.
- **Searched for:** `EXPLAIN` / `explain` (case-insensitive) across lib/ and api.js, and any agent-initiated DB calls (`.query(`, `.execute(`) in lib/subscribers, lib/instrumentation, lib/shim and lib/db.
- **Data flow:** datastore instrumentation only wraps customer calls. Query text flows from ParsedStatement to `queries.add` to SlowQuery/QuerySample (lib/db/*) and is never executed.
- **Files checked:** lib/db/query-trace-aggregator.js, lib/db/query-sample.js, lib/db/slow-query.js, lib/shim/datastore-shim.js, and lib/subscribers/{pg,mysql,mysql2,cassandra-driver,mongodb,elasticsearch}/*.
- **Only "explain" hit:** lib/subscribers/mongodb/cursor.js:25, which instruments the customer's own `cursor.explain()` call rather than an agent-run query. `explain_threshold` (lib/config/schemas/transaction-tracer.js:74-79) only gates backtrace and slow-query capture (lib/db/query-trace-aggregator.js:80).

The Node agent does not run explain plans.

#### ✅ REQ-013 — Agents that prepend EXPLAIN SHOULD NOT run explain plans on queries with a non-trailing `;`

No violation found; the requirement does not apply. The searches and files were the same as for REQ-012, and no code prepends `EXPLAIN` to a query. Because the agent generates no explain plans, it never sends a multi-statement query to the database.

### Datastore Segment API

#### ✅ REQ-014 — Agents SHOULD provide an API for modules to send query information

The public API `newrelic.instrumentDatastore()` at api.js:1410-1425 registers a `DatastoreShim` (lib/shim/index.js:20). The shim exposes `recordQuery`, `recordBatchQuery`, `recordOperation`, `setParser` and `captureInstanceAttributes` (lib/shim/datastore-shim.js:111-117, 205-229, 324-357, 470). Queries are parsed by `parseQuery` (lib/shim/datastore-shim.js:374-397) and feed the same query aggregator. `newrelic.obfuscateSql()` is also public (api.js:1794-1799).

```js
// api.js:1410,1423-1424
API.prototype.instrumentDatastore = function instrumentDatastore(moduleName, onRequire, onError) {
  opts.type = MODULE_TYPE.DATASTORE
  shimmer.registerInstrumentation(opts)
```

#### ❌ REQ-015 — The API MUST allow the ability to distinguish raw query data from obfuscated queries

No flag or field exists that marks caller-supplied query text as already obfuscated or as raw. The search covered lib/shim/datastore-shim.js (the QuerySpec/ParsedQueryData typedefs at lib/shim/datastore-shim.js:122-165, `recordQuery` at lib/shim/datastore-shim.js:324 and `parseQuery` at lib/shim/datastore-shim.js:374-397), lib/db/parsed-statement.js:8-19, and api.js (`instrumentDatastore`, `startSegment`, `obfuscateSql`). `ParsedStatement` has only a single `raw` field, and lib/metrics/recorders/database.js:62-70 always passes it as `query` to `queries.add`.

All query text supplied through the API is treated as raw and run through `obfuscate()` unless `record_sql: 'raw'` is set, so the failure mode is over-obfuscation. The capability the spec requires is still missing.

#### ❌ REQ-016 — In HSM, agents SHOULD ONLY accept custom datastore data if the module is in `collect_slow_queries_from`

lib/, api.js, lib/config/schemas/*.js and lib/config/hsm.js contain no match for `collect_slow_queries_from` or `slow_queries_from`. Neither `API.prototype.instrumentDatastore` (api.js:1410-1425) nor `DatastoreShim.parseQuery` (lib/shim/datastore-shim.js:374-397) checks `high_security`. Third-party datastore modules therefore have their (obfuscated) queries accepted in HSM without any allow-list.

#### ❌ REQ-017 — `collect_slow_queries_from` SHOULD be empty by default

The setting does not exist in lib/config/schemas/ (all files), lib/config/schema.generated.js or lib/config/index.js (see REQ-016), so it has no default.

### Infrastructure Context

#### ✅ REQ-018 — Agents MAY collect the hostname of the target system for datastore calls

The datastore host is collected when `datastore_tracer.instance_reporting.enabled` is set (default true). It is used at lib/shim/datastore-shim.js:685-700 and lib/subscribers/db.js:45,73-75, and localhost names are replaced with the agent hostname (`config.getHostnameSafe()`).

```js
// lib/shim/datastore-shim.js:687-697
if (!dsTracerConf.instance_reporting.enabled) {
  delete parameters.host
  ...
      if (parameters.host && urltils.isLocalhost(parameters.host)) {
        parameters.host = config.getHostnameSafe()
```

#### ⚠️ REQ-019 — Reported datastore host MUST NOT contain anything other than the hostname

**Implemented:** hosts come from connection fields the driver has already parsed, never from raw connection strings.

| Driver | Source of host | Reference |
|--------|---------------|-----------|
| pg | `client.host` | lib/subscribers/pg/query.js:49 |
| mysql | `conf.host`, or `'localhost'` for a socket | lib/subscribers/mysql/connection-query.js:84-88; lib/subscribers/mysql/helper.js:62-66 |
| mongodb | `options.hosts[0].host` | lib/subscribers/mongodb/utils/get-host-details.js:45-73 |
| node-redis | `new URL(clientOpts.url).hostname` (drops `user:pass@`) | lib/subscribers/redis-client/client-propagation.js:89-104 |
| ioredis | `connector.options.host` | lib/subscribers/ioredis/index.js:40 |
| redis | `opts.host` | lib/subscribers/redis/internal-send-command.js:39 |
| elasticsearch | `connectionPool.url.host.split(':')[0]` | lib/subscribers/elasticsearch/elasticsearch.js:30-32 |
| memcached | `location.split(':')[0]` | lib/subscribers/memcached/command.js:52-55 |
| cassandra (execute/eachRow) | `controlConnection.connection.address` | lib/subscribers/cassandra-driver/client-execute.js:31; lib/subscribers/cassandra-driver/client-each-row.js:31 |
| OTel | `server.address` / `net.peer.name` | lib/otel/traces/attr-reconciler.js:24-33 |

No path puts user names, passwords or database options into `host`.

**Missing:** the cassandra-driver connect and batch paths use `options.contactPoints[0]` verbatim (lib/subscribers/cassandra-driver/client-connect.js:30, lib/subscribers/cassandra-driver/client-batch.js:44). cassandra-driver accepts contact points of the form `'host:port'`, so the reported `host` can include `:port`, which is more than "only the hostname".

### Custom Attributes

#### ✅ REQ-020 — Agents MAY provide a public API for collecting custom data

Public custom-attribute APIs:
- `addCustomAttribute` / `addCustomAttributes` (api.js:257-327)
- `addCustomSpanAttribute` / `addCustomSpanAttributes` (api.js:342-405)
- custom attributes on `noticeError` (api.js:426-470)

They are stored on `trace.custom` (lib/transaction/trace/index.js:193-203) and sent with events (lib/agent.js:830, lib/errors/index.js:139-145).

#### ⚠️ REQ-021 — Agents MUST NOT allow collection of custom attributes in HSM

**Implemented:** every New Relic custom-attribute API refuses in HSM:
- `addCustomAttribute`: api.js:263-266
- `addCustomSpanAttribute`: api.js:371-377
- `noticeError` attributes: api.js:441-444, enforced at lib/errors/index.js:211; error copy at lib/errors/index.js:139
- Apollo attribute callbacks route through `addCustomAttributes` → `addCustomAttribute` (api.js:2029-2032, 2075-2078)
- `recordCustomEvent`: api.js:1263-1266

LLM custom attributes cannot be collected in HSM because `ai_monitoring.enabled` is forced to false (lib/config/hsm.js:59-61).

```js
// api.js:263-266
// If high security mode is on, custom attributes are disabled.
if (this.agent.config.high_security) {
  logger.warnOnce('Custom attributes', 'Custom attributes are disabled by high security mode.')
  return false
```

**Missing:** with the OTel bridge enabled, attributes the user sets through the OpenTelemetry API (`span.setAttribute(...)`, or attributes passed to `startActiveSpan`) are copied verbatim onto segments and span events by lib/otel/traces/attr-reconciler.js:35-47, with no HSM check. A runtime check with `high_security: true` found arbitrary OTel attributes such as `url.query` and `db.query.text` in the SPAN_EVENT attributes. In effect these are custom attributes accepted in HSM.

#### ✅ REQ-022 — Agents SHOULD allow disabling custom attributes locally without HSM

`api.custom_attributes_enabled` is defined at lib/config/schemas/api.js:13-18 (env `NEW_RELIC_API_CUSTOM_ATTRIBUTES`). It is checked at api.js:267-269 (`addCustomAttribute`), api.js:378-380 (`addCustomSpanAttribute`), api.js:445-448 (`noticeError`) and lib/errors/index.js:211. `api.custom_events_enabled` is checked at api.js:1267-1269.

```js
// api.js:267-269
} else if (!this.agent.config.api.custom_attributes_enabled) {
  logger.debug('Config.api.custom_attributes_enabled set to false, not collecting value')
  return false
```

### Background jobs

#### ✅ REQ-023 — Agents MAY collect information about background jobs and processes

lib/subscribers/core/child_process.js:14-50 instruments `child_process.exec` and `execFile` and creates segments named `child_process.<method>` (lib/subscribers/core/child_process.js:43, created via lib/subscribers/core/base.js:115-134).

#### ✅ REQ-024 — Agents MUST NOT capture environment or command arguments in HSM

No violation found.
- **Searched for:** attributes added from child_process arguments or options (`args`, `env`, `cwd`, `argv`, `addAttribute`) in lib/subscribers/core/child_process.js and lib/subscribers/core/base.js, plus `process.argv`, `execArgv` and `process.env` collection across lib/.
- **Data flow:** the child_process wrapper passes only `{ name: 'child_process.<method>' }` as channel data (lib/subscribers/core/child_process.js:43). `createSegment` in lib/subscribers/core/base.js:115-134 sets only the name and shimId and adds no attributes.
- **`process.env` reads in lib/:** these are config and env-override lookups (e.g. lib/config/index.js:669, 694, 1476, 1749) or `NEW_RELIC_METADATA_*` filtering (lib/collector/facts.js:52). None captures the env or arguments of a spawned job.
- **Files checked:** lib/subscribers/core/child_process.js, lib/subscribers/core/base.js, lib/collector/facts.js, lib/environment.js and lib/config/index.js.

Command arguments and environment are never captured in any mode, including HSM.

#### ✅ REQ-025 — Job environment MAY be collected if explicitly configured

The job environment is never collected (see REQ-024), and no config exists to enable it. That is allowed, and stricter than the spec requires.

#### ✅ REQ-026 — Command arguments MAY be collected if explicitly enabled through configuration

Command arguments are never collected (see REQ-024), and no config exists to enable it. That is allowed, and stricter than the spec requires.

### URI Request Parameters (URI Search Params)

#### ⚠️ REQ-027 — Request parameters MUST be removed from all New Relic attributes that contain a URI

**Implemented:**
- **Inbound request URI:** lib/transaction/index.js:988-992 runs `urltils.scrubAndParseParameters`, which calls `scrub()` (lib/util/urltils.js:86-100). `scrub()` uses `URL.pathname`, which drops `?query` and `#fragment`, and then `path.split(';')[0]`. `request.uri` is set from the scrubbed path (lib/transaction/index.js:740-747; lib/transaction/trace/segment.js:153; trace payload at lib/transaction/trace/index.js:518-528). Verified: for `/p;jsessionid=XYZ?secret=1&card=4111`, `request.uri` is `/p`.
- **Outbound http/https `url` attribute:** lib/instrumentation/core/http-outbound.js:253-274 uses the scrubbed path. Verified: `url` is `http://localhost:port/p`.
- **http2 client:** lib/subscribers/core/http2.js:256-272 uses `scrub()`, with a fallback split on `[?#;]`.

**Missing:**

| Path | Finding | Reference |
|------|---------|-----------|
| undici / global fetch | Uses `url.pathname` directly without `scrub()`, so `;` parameters stay in the `url` attribute and segment name. Verified: `"url":"http://localhost:59011/p;jsessionid=XYZ"` | lib/subscribers/undici/index.js:93-94, 116-124 |
| http outbound fallback | When `new URL()` throws, the raw `request.path` (which can include `?query`) becomes the `url` path | lib/instrumentation/core/http-outbound.js:259-262 |
| Referer header | Cut only at `?`. Verified: `request.headers.referer` is `http://r/a;sess=1` | lib/header-attributes.js:127-131 |
| Location / Refresh headers | Not stripped (see REQ-034) | lib/header-attributes.js:126-132 |
| OTel bridge (server) | Raw `url.query`, `http.target` and `http.url` are forwarded (verified: `"url.query":"token=secret"`). `transaction.url` uses `requestUrl.pathname`, which keeps `;`, and on a parse failure it uses the raw `httpUrl` including the query | lib/otel/traces/attr-reconciler.js:35-47; lib/otel/traces/span-processor.js:347, 354 |
| OTel bridge (client) | The rule regex `^([^?]+)` keeps `;` in `url` | lib/otel/traces/transformation-rules/312-OtelHttpClient1_23.json |

#### ✅ REQ-028 — Agents MAY collect the fragment id

The agent does not collect the fragment. `scrub()` uses `URL.pathname`, which excludes `#fragment` (lib/util/urltils.js:86-100), and the http2 fallback strips `#` explicitly (lib/subscribers/core/http2.js:262). Not collecting the fragment is permitted.

#### ❌ REQ-029 — Request parameters MAY be collected only if HSM is disabled and the user explicitly included `request.parameters.*`, or a custom event/attribute is used

**Correct for inbound requests:** inbound query parameters are added only with destination `DESTS.NONE` (lib/transaction/index.js:544-557), so they are sent only when the user includes `request.parameters.*`. Route params are also NONE and are skipped in HSM (lib/transaction/index.js:715-728). HSM adds a global exclude for `request.parameters.*` (lib/config/index.js:338).

**Violation for outbound external calls:**

```js
// lib/transaction/trace/segment.js:296-298
for (const key in queryParams) {
  this.addSpanAttribute(`request.parameters.${key}`, queryParams[key])  // DESTINATIONS.SPAN_EVENT (segment.js:100)
}
```

This is called from lib/instrumentation/core/http-outbound.js:266-274, lib/subscribers/undici/index.js:111-124 and lib/subscribers/core/http2.js:91,271. A runtime check with the default config found `"request.parameters.secret":"1","request.parameters.card":"4111"` on the outbound span, and `attributeFilter.filterSegment(SPAN_EVENT,'request.parameters.a')` returned 16 (SPAN_EVENT kept) with no include configured. The unit test test/unit/instrumentation/http/outbound.test.js:121-148 asserts this default behavior.

**Additional violation:** the OTel bridge forwards `url.query` (server spans) and regex-extracted `request.parameters.*` (client rules 312/313) to segments **even in HSM**, because the reconciler does not apply HSM to `url.query` (verified).

**Impact:** by default, outbound request query strings (tokens, API keys, PII) are sent to New Relic on span events without the explicit opt-in the spec requires.

### Request / Response Headers

#### ✅ REQ-030 — Agents MAY collect HTTP headers such as Accept, Content-Length, Host

lib/header-attributes.js:104-140 collects request and response headers through `collectRequestHeaders` and `collectResponseHeaders`, called from lib/transaction/index.js:977 and lib/transaction/index.js:804. The default allowlist is `accept`, `content-length`, `content-type`, `referer`, `user-agent` and `host` (lib/header-attributes.js:10-17). When `allow_all_headers` is true, all headers are collected (lib/header-attributes.js:116-118).

#### ✅ REQ-031 — Sensitive HTTP headers SHOULD NOT be collected

`allow_all_headers` defaults to false (lib/config/schemas/root.js:52-56). By default only the allowlist in lib/header-attributes.js:10-17 and 116-118 is collected, so Cookie, Set-Cookie, Authorization, Proxy-Authorization and X-* are not. HSM forces `allow_all_headers: false` (lib/config/hsm.js:16). The shipped template turns on `allow_all_headers` (newrelic.js:40) but excludes these headers (newrelic.js:50-61). A runtime check with `allow_all_headers` false found none of `cookie`, `authorization` or `x-api-key` collected.

If `allow_all_headers: true` is set through config or env without the template's excludes, the sensitive headers are collected, because the agent has no built-in exclude list (see REQ-032).

#### ⚠️ REQ-032 — Agents SHOULD add sensitive headers to an exclude list

**Implemented:** the shipped config template adds the sensitive headers to `attributes.exclude` (newrelic.js:50-61):

```js
// newrelic.js:50-61
exclude: [
  'request.headers.cookie', 'request.headers.authorization', 'request.headers.proxyAuthorization',
  'request.headers.setCookie*', 'request.headers.x*',
  'response.headers.cookie', 'response.headers.authorization', 'response.headers.proxyAuthorization',
  'response.headers.setCookie*', 'response.headers.x*'
]
```

The exclusion is enforced by lib/config/attribute-filter.js:212-237 and 251-258.

**Missing:** the agent's own default `attributes.exclude` is `[]` (lib/config/schemas/attributes.js:37), so the list exists only in the sample newrelic.js. Customers who configure through environment variables (e.g. `NEW_RELIC_ALLOW_ALL_HEADERS=true`) or their own config file get no sensitive-header excludes. Verified: `new Config({allow_all_headers:true})` collected `request.headers.cookie`, `request.headers.authorization`, `request.headers.xApiKey` and `response.headers.setCookie`.

#### ✅ REQ-033 — Referer, Location and Refresh headers MAY be collected

Referer is in the default allowlist (lib/header-attributes.js:14). Location and Refresh are collected when `allow_all_headers: true` (lib/header-attributes.js:116-118; names at lib/header-attributes.js:45, 50). The obligation to strip query parameters from these headers is assessed separately under REQ-034.

#### ❌ REQ-034 — Referer, Location and Refresh MUST be stripped of query parameters before being sent

```js
// lib/header-attributes.js:126-132
// If any more processing of the headers is required consider refactoring this.
if (headerKey === 'referer' && typeof header === 'string') {
  const queryParamIndex = header.indexOf('?')
  if (queryParamIndex !== -1) {
    header = header.substring(0, queryParamIndex)
  }
}
```

**Violations:**
1. **Location** and **Refresh** are never stripped; only `referer` is handled. A runtime check with `allow_all_headers: true` found `"response.headers.location":"http://x/y?tok=abc"` and `"response.headers.refresh":"0; url=http://x/y?tok=r"` in the transaction and span attributes. The shipped template (newrelic.js:40) turns on `allow_all_headers` and does not exclude these headers, so an install based on the template sends them by default.
2. **Referer** is stripped at `?` only, not at `;`. Verified: `"request.headers.referer":"http://r/a;sess=1"`.

**Impact:** redirect targets and referrers that carry tokens or session IDs in query or matrix parameters are sent to New Relic.

### Security Review

#### ❓ REQ-035 — New data collection or additional instrumentation MUST go through a Security Review as part of the MMF process

No security-review or MMF gate on new data collection was found. The search covered CONTRIBUTING.md (only a `security` commit type at CONTRIBUTING.md:74), README.md (security policy and bug bounty at README.md:224-250), .github/PULL_REQUEST_TEMPLATE.md and .github/ISSUE_TEMPLATE. This is an internal process requirement and cannot be verified from source.

## Implementation Index

### Agent Security Settings / High Security Mode
- lib/config/index.js:124-126 — HSM applied at config construction
- lib/config/index.js:330-366 — `#applyHighSecurity`
- lib/config/index.js:338 — global exclude `request.parameters.*`
- lib/config/index.js:589-597 — server cannot override HSM keys
- lib/config/index.js:1649-1653 — local/server HSM mismatch disables the agent
- lib/config/hsm.js:11-64 — `HIGH_SECURITY_SETTINGS`
- lib/otel/traces/span-processor.js:263-266 — `highSecurity` rule-attribute gate
- lib/otel/traces/attr-reconciler.js:35-47 — OTel attribute copy (no HSM check)

### Secure by Default
- lib/config/schemas/root.js:52-56 — `allow_all_headers` default
- lib/config/schemas/root.js:204-208 — `ssl` const true
- lib/config/schemas/transaction-tracer.js:62-71 — `record_sql` default
- lib/config/schemas/attributes.js:29 — `attributes.include` default
- lib/config/schemas/attributes.js:37 — `attributes.exclude` default
- lib/config/schemas/slow-sql.js:13-16 — `slow_sql.enabled` default
- lib/config/schemas/ai-monitoring.js:15 — `ai_monitoring.enabled` default
- lib/config/schemas/profiling.js:15 — `profiling.enabled` default
- lib/config/schemas/strip-exception-messages.js:15 — `strip_exception_messages.enabled` default
- lib/config/schemas/application-logging.js:21-23 — `application_logging.forwarding.enabled` default
- lib/config/schemas/api.js:13-30 — `api.*` toggles
- newrelic.js:40 — template `allow_all_headers: true`
- newrelic.js:42-61 — template `attributes.exclude` suggestion
- documentation/otel/otel-transformation-rules.md:89 — only "high security" doc hit

### Datastore queries (SQL obfuscation)
- lib/util/sql/obfuscate.js:10-25 — header comment
- lib/util/sql/obfuscate.js:45-85 — dialect obfuscation
- lib/util/sql/obfuscate.js:105-113 — `unmatchedPairs`
- lib/db/slow-query.js:13-14 — `obfuscate()` call
- lib/db/query-trace-aggregator.js:61-80 — `record_sql` switch
- lib/db/query-sample.js:108-117 — slow-SQL payload
- lib/db/parsed-statement.js:8-19 — `ParsedStatement`
- lib/metrics/recorders/database.js:62-70 — `queries.add`
- lib/spans/span-event.js:517-529 — `db.statement` on span events
- lib/subscribers/db-query.js:44-67 — DbQuerySubscriber
- lib/instrumentation/@prisma/client.js:104-115, 179-189 — Prisma
- lib/otel/traces/segments/database.js:24-40 — OTel db segments
- lib/otel/traces/span-processor.js:248-271 — `excludeAttributes`
- lib/otel/traces/utils.js:123-138 — rule attribute mapping
- lib/config/schemas/opentelemetry.js:15 — `opentelemetry.enabled` default
- lib/config/index.js:1364-1376 — server-side `record_sql` handling

### Explain Plans
- lib/subscribers/mongodb/cursor.js:25 — customer `cursor.explain()` instrumentation
- lib/config/schemas/transaction-tracer.js:74-79 — `explain_threshold`

### Datastore Segment API
- api.js:1410-1425 — `instrumentDatastore`
- api.js:1794-1799 — `obfuscateSql`
- lib/shim/index.js:20 — DatastoreShim registration
- lib/shim/datastore-shim.js:111-117, 122-165, 205-229, 324-357, 374-397, 470 — shim API, typedefs, `recordQuery`, `parseQuery`

### Infrastructure Context
- lib/shim/datastore-shim.js:685-700 — instance reporting
- lib/subscribers/db.js:45, 73-75 — host handling
- lib/subscribers/pg/query.js:49
- lib/subscribers/mysql/connection-query.js:84-88
- lib/subscribers/mysql/helper.js:62-66
- lib/subscribers/mongodb/utils/get-host-details.js:45-73
- lib/subscribers/redis-client/client-propagation.js:89-104
- lib/subscribers/ioredis/index.js:40
- lib/subscribers/redis/internal-send-command.js:39
- lib/subscribers/elasticsearch/elasticsearch.js:30-32
- lib/subscribers/memcached/command.js:52-55
- lib/subscribers/cassandra-driver/client-execute.js:31
- lib/subscribers/cassandra-driver/client-each-row.js:31
- lib/subscribers/cassandra-driver/client-connect.js:30
- lib/subscribers/cassandra-driver/client-batch.js:44
- lib/otel/traces/attr-reconciler.js:24-33

### Custom Attributes
- api.js:257-327 — `addCustomAttribute(s)`
- api.js:342-405 — `addCustomSpanAttribute(s)`
- api.js:426-470 — `noticeError`
- api.js:1257-1270 — `recordCustomEvent`
- api.js:2029-2032, 2075-2078 — Apollo attribute callbacks
- lib/errors/index.js:139-145, 211 — error custom attributes
- lib/transaction/trace/index.js:193-203 — `trace.custom`
- lib/agent.js:830

### Background jobs
- lib/subscribers/core/child_process.js:14-50
- lib/subscribers/core/base.js:115-134
- lib/collector/facts.js:52

### URI Request Parameters
- lib/util/urltils.js:86-100 — `scrub()`
- lib/transaction/index.js:544-557 — inbound `request.parameters.*`
- lib/transaction/index.js:715-728 — route params
- lib/transaction/index.js:740-747, 988-992 — `request.uri`
- lib/transaction/trace/segment.js:100, 153, 296-298 — segment URI and outbound `request.parameters.*`
- lib/transaction/trace/index.js:518-528 — trace payload
- lib/instrumentation/core/http-outbound.js:253-274 — http/https outbound
- lib/subscribers/undici/index.js:93-94, 111-124 — undici/fetch
- lib/subscribers/core/http2.js:91, 256-272 — http2 client
- lib/otel/traces/span-processor.js:347, 354 — OTel `transaction.url`
- lib/otel/traces/transformation-rules/312-OtelHttpClient1_23.json — OTel client URL rule
- test/unit/instrumentation/http/outbound.test.js:121-148 — outbound params test

### Request / Response Headers
- lib/header-attributes.js:10-17 — default allowlist
- lib/header-attributes.js:45, 50 — Location / Refresh names
- lib/header-attributes.js:104-140 — header collection
- lib/header-attributes.js:126-132 — Referer stripping
- lib/transaction/index.js:804, 977 — header collection call sites
- lib/config/attribute-filter.js:212-237, 251-268, 280-284 — include/exclude evaluation
- newrelic.js:50-61 — template header excludes

### Security Review
- CONTRIBUTING.md:74
- README.md:224-250

## Gap Analysis

### Critical Gaps (MUST / MUST NOT)

**Approved Deviations:** None. **Documented Exceptions:** None.

| REQ-ID | Type | Status | Gap |
|--------|------|--------|-----|
| REQ-001 | MUST | ⚠️ | The OTel bridge copies unmapped span attributes (raw `db.query.text`, `url.query`) onto segments with no HSM check (lib/otel/traces/attr-reconciler.js:35-47). There is no HSM gate on third-party datastore data. |
| REQ-005 | MUST | ⚠️ | The OTel bridge forwards raw `db.query.text` and `db.statement` outside the obfuscation pipeline (lib/otel/traces/attr-reconciler.js:35-47). |
| REQ-007 | MUST | ⚠️ | The raw OTel `db.query.text` and `db.statement` attributes are not removed under `record_sql: obfuscated`/`off` or under HSM (lib/otel/traces/attr-reconciler.js:43-45). |
| REQ-015 | MUST | ❌ | The datastore API has no way to mark query text as raw or obfuscated (lib/shim/datastore-shim.js:122-165; lib/db/parsed-statement.js:8-19). |
| REQ-019 | MUST NOT | ⚠️ | cassandra-driver connect and batch report `contactPoints[0]` verbatim, which can be `host:port` (lib/subscribers/cassandra-driver/client-connect.js:30, lib/subscribers/cassandra-driver/client-batch.js:44). |
| REQ-021 | MUST NOT | ⚠️ | Attributes set through the OTel API are accepted onto segments and span events in HSM (lib/otel/traces/attr-reconciler.js:35-47). |
| REQ-027 | MUST | ⚠️ | undici/fetch keeps `;` parameters (lib/subscribers/undici/index.js:93-94). The http outbound fallback uses the raw path (lib/instrumentation/core/http-outbound.js:259-262). Referer is cut at `?` only (lib/header-attributes.js:127-131). The OTel bridge forwards `url.query`/`http.url` and keeps `;` (lib/otel/traces/span-processor.js:347, 354). |
| REQ-034 | MUST | ❌ | Location and Refresh are never stripped, and Referer is not cut at `;` (lib/header-attributes.js:126-132). |
| REQ-010 | MUST | ❓ Unverified | A security-team review of obfuscation cannot be confirmed from source. |
| REQ-035 | MUST | ❓ Unverified | A security-review/MMF process gate cannot be confirmed from source. |

### Important Gaps (SHOULD / SHOULD NOT)

| REQ-ID | Type | Status | Gap |
|--------|------|--------|-----|
| REQ-002 | SHOULD | ⚠️ | These defaults differ from HSM: `strip_exception_messages.enabled` (lib/config/schemas/strip-exception-messages.js:15), `application_logging.forwarding.enabled` (lib/config/schemas/application-logging.js:21-23), outbound `request.parameters.*` on span events (lib/transaction/trace/segment.js:296-298), and the template's `allow_all_headers: true` (newrelic.js:40). |
| REQ-004 | SHOULD | ⚠️ | Only the header `attributes.exclude` list is documented (newrelic.js:42-61). There is no complete HSM-equivalent configuration suggestion. |
| REQ-006 | SHOULD | ⚠️ | The default-obfuscation standard (REQ-007) is only partially met, because of the OTel bridge path. |
| REQ-016 | SHOULD | ❌ | There is no `collect_slow_queries_from` allow-list and no HSM check on third-party datastore modules (api.js:1410-1425; lib/shim/datastore-shim.js:374-397). |
| REQ-017 | SHOULD | ❌ | The `collect_slow_queries_from` setting does not exist, so it has no empty default. |
| REQ-032 | SHOULD | ⚠️ | The sensitive-header exclude list exists only in the template (newrelic.js:50-61). The agent's default `attributes.exclude` is `[]` (lib/config/schemas/attributes.js:37). |
| REQ-011 | SHOULD | ❓ Unverified | No in-repo guidance on parameterized queries was found. Customer docs are outside the repo. |

#### Pre-accepted (non-blocking)

None.

### Optional Gaps (MAY)

| REQ-ID | Type | Status | Gap |
|--------|------|--------|-----|
| REQ-029 | MAY | ❌ | Outbound `request.parameters.*` are collected on span events by default, without the user including them (lib/transaction/trace/segment.js:296-298). The OTel bridge forwards `url.query` and the client-rule `request.parameters.*` even in HSM. |

## Compliance Summary Matrix

| REQ-ID | Type | Category | Description | Status | Evidence |
|--------|------|----------|-------------|--------|----------|
| REQ-001 | MUST | Agent Security Settings | Enforce security settings (HSM) when configured | ⚠️ | lib/config/index.js:124-126, 330-366; OTel gap lib/otel/traces/attr-reconciler.js:35-47 |
| REQ-002 | SHOULD | Secure by Default | Defaults secure, HSM-equivalent | ⚠️ | lib/config/schemas/strip-exception-messages.js:15; lib/config/schemas/application-logging.js:21-23; lib/transaction/trace/segment.js:296-298; newrelic.js:40 |
| REQ-003 | SHOULD | Secure by Default | Allow customization via APIs/config | ✅ | api.js:263-269; lib/config/schemas/api.js:13-30; lib/config/attribute-filter.js:212-237 |
| REQ-004 | SHOULD | Secure by Default | Documented config suggestion setting all HSM settings | ⚠️ | newrelic.js:42-61 (headers only) |
| REQ-005 | MUST | Datastore queries | Obfuscate query parameters by default | ⚠️ | lib/metrics/recorders/database.js:62-70; lib/db/slow-query.js:13-14; OTel gap lib/otel/traces/attr-reconciler.js:35-47 |
| REQ-006 | SHOULD | Datastore queries | Follow listed datastore reporting standards | ⚠️ | See REQ-007/008/009; lib/otel/traces/attr-reconciler.js:35-47 |
| REQ-007 | MUST | Datastore queries | Default to obfuscate all query parameters | ⚠️ | lib/config/schemas/transaction-tracer.js:62-71; lib/util/sql/obfuscate.js:45-85; OTel gap lib/otel/traces/attr-reconciler.js:43-45 |
| REQ-008 | SHOULD | Datastore queries | Disable recording if query cannot be parsed | ✅ | lib/util/sql/obfuscate.js:105-113; lib/db/parsed-statement.js:13-18 |
| REQ-009 | MAY | Datastore queries | Raw query only when HSM off and configured | ✅ | lib/db/query-trace-aggregator.js:62-65; lib/config/hsm.js:20-21 |
| REQ-010 | MUST | Datastore queries | Security-team review of built-in obfuscation | ❓ | Process requirement; lib/util/sql/obfuscate.js:10-25 |
| REQ-011 | SHOULD | Datastore queries | Docs encourage parameterized queries | ❓ | No in-repo guidance; external docs |
| REQ-012 | MUST NOT | Explain Plans | Run nothing but an explain plan | ✅ | No explain plans run; lib/subscribers/mongodb/cursor.js:25 (customer call) |
| REQ-013 | SHOULD NOT | Explain Plans | No EXPLAIN on queries with non-trailing `;` | ✅ | Not applicable; no EXPLAIN prepending in lib/ |
| REQ-014 | SHOULD | Datastore Segment API | Provide API for modules to send query info | ✅ | api.js:1410-1425; lib/shim/datastore-shim.js:324-397 |
| REQ-015 | MUST | Datastore Segment API | API distinguishes raw vs obfuscated queries | ❌ | lib/shim/datastore-shim.js:122-165; lib/db/parsed-statement.js:8-19 |
| REQ-016 | SHOULD | Datastore Segment API | In HSM, accept custom datastore data only from `collect_slow_queries_from` | ❌ | Setting absent; api.js:1410-1425 |
| REQ-017 | SHOULD | Datastore Segment API | `collect_slow_queries_from` empty by default | ❌ | Setting absent in lib/config/schemas/ |
| REQ-018 | MAY | Infrastructure Context | Collect datastore target hostname | ✅ | lib/shim/datastore-shim.js:685-700; lib/subscribers/db.js:45, 73-75 |
| REQ-019 | MUST NOT | Infrastructure Context | Reported host contains only the hostname | ⚠️ | lib/subscribers/cassandra-driver/client-connect.js:30; lib/subscribers/cassandra-driver/client-batch.js:44 |
| REQ-020 | MAY | Custom Attributes | Public API for custom data | ✅ | api.js:257-327, 342-405, 426-470 |
| REQ-021 | MUST NOT | Custom Attributes | No custom attributes in HSM | ⚠️ | api.js:263-266; OTel gap lib/otel/traces/attr-reconciler.js:35-47 |
| REQ-022 | SHOULD | Custom Attributes | Local option to disable custom attributes | ✅ | lib/config/schemas/api.js:13-18; api.js:267-269 |
| REQ-023 | MAY | Background jobs | Collect background job/process info | ✅ | lib/subscribers/core/child_process.js:14-50 |
| REQ-024 | MUST NOT | Background jobs | No env/args capture in HSM | ✅ | lib/subscribers/core/child_process.js:43; lib/subscribers/core/base.js:115-134 |
| REQ-025 | MAY | Background jobs | Job environment if explicitly configured | ✅ | Never collected (stricter) |
| REQ-026 | MAY | Background jobs | Command args if explicitly enabled | ✅ | Never collected (stricter) |
| REQ-027 | MUST | URI Request Parameters | Strip request params from all URI attributes | ⚠️ | lib/util/urltils.js:86-100; gaps lib/subscribers/undici/index.js:93-94, lib/header-attributes.js:127-131, lib/otel/traces/span-processor.js:347 |
| REQ-028 | MAY | URI Request Parameters | May collect fragment id | ✅ | Fragment not collected; lib/util/urltils.js:86-100 |
| REQ-029 | MAY | URI Request Parameters | Request params only with HSM off and explicit include / custom attr | ❌ | lib/transaction/trace/segment.js:296-298; lib/instrumentation/core/http-outbound.js:266-274 |
| REQ-030 | MAY | Request / Response Headers | Collect HTTP headers | ✅ | lib/header-attributes.js:10-17, 104-140 |
| REQ-031 | SHOULD NOT | Request / Response Headers | Do not collect sensitive headers | ✅ | lib/config/schemas/root.js:52-56; lib/header-attributes.js:10-17; lib/config/hsm.js:16 |
| REQ-032 | SHOULD | Request / Response Headers | Sensitive headers on an exclude list | ⚠️ | newrelic.js:50-61; lib/config/schemas/attributes.js:37 |
| REQ-033 | MAY | Request / Response Headers | May collect Referer/Location/Refresh | ✅ | lib/header-attributes.js:14, 45, 50, 116-118 |
| REQ-034 | MUST | Request / Response Headers | Strip query params from Referer/Location/Refresh | ❌ | lib/header-attributes.js:126-132 |
| REQ-035 | MUST | Security Review | Security Review for new data collection | ❓ | Process requirement; CONTRIBUTING.md:74 |

## Inferred Requirements Review

> The following requirements were inferred from behavioral descriptions in the spec that do not
> use explicit RFC-style keywords. They are **not** counted in the compliance score above.
> Implemented items are candidates for adding MUST/SHOULD keywords to the spec. Unimplemented
> items are candidates for formalization before being tracked as compliance gaps.

### Implemented (candidate for keyword addition)

#### ✅ INF-005 — Agent parses the datastore connect string and extracts only the host (implied-MUST)

**Basis (spec:50-51):**
> It is important that when reporting the hostname of the target system for New Relic Infrastructure, that the agent correctly parses the connect string and the reported information **MUST NOT** contain anything other than the hostname of the system.

**Evidence:** datastore hosts come from connection objects the driver has already parsed: pg `client.host`, mysql `conf.host`, mongodb `options.hosts[0].host`, ioredis `connector.options.host`. node-redis explicitly parses the connection URL with `new URL(...).hostname` (lib/subscribers/redis-client/client-propagation.js:89-104). Connection strings are never reported verbatim. See REQ-019 for the per-driver file:line references and the cassandra `contactPoints` `host:port` edge case.

### Not Implemented (candidate for spec formalization)

#### ⚠️ INF-001 — Sensitive data is not collected, or is collected only on explicit opt-in (implied-SHOULD)

**Basis (spec:7):**
> However, some of this data may contain sensitive information that should either not be collected, or should only be collected if explicitly requested by the customer.

**Implemented:** many sensitive items are opt-in:
- inbound `request.parameters.*` are NONE by default (lib/transaction/index.js:544-557)
- raw SQL requires `record_sql: 'raw'` (lib/db/query-trace-aggregator.js:62)
- header collection uses an allowlist by default (lib/header-attributes.js:10-17)
- ai_monitoring and profiling are off by default
- child_process args and env are never collected

**Missing:**
- outbound query parameters are collected on span events by default (lib/transaction/trace/segment.js:296-298)
- log forwarding is on by default (lib/config/schemas/application-logging.js:21-23)
- exception messages are kept by default (lib/config/schemas/strip-exception-messages.js:15)
- the OTel bridge forwards all span attributes unfiltered (lib/otel/traces/attr-reconciler.js:35-47)

#### ⚠️ INF-002 — URI request parameters are cut at either `?` or `;` (implied-MUST)

**Basis (spec:64):**
> Request parameters are anything after the "?" or ";" in the URI, except that agents **MAY** collect the 'fragmentid' which may occur after the '?'

**Implemented:** `scrub()` cuts at both `?` (via `URL.pathname`) and `;` (lib/util/urltils.js:89, `path.split(';')[0]`). It is used for inbound URIs (lib/transaction/index.js:990), http/https outbound calls (lib/instrumentation/core/http-outbound.js:256) and http2 (lib/subscribers/core/http2.js:269, with the fallback `split(/[?#;]/)` at lib/subscribers/core/http2.js:262).

**Missing:** `;` is not handled for:
- undici/fetch (lib/subscribers/undici/index.js:93-94; verified that `/p;jsessionid=XYZ` is retained)
- Referer (lib/header-attributes.js:128; `?` only)
- Location/Refresh (not stripped)
- the OTel server `transaction.url` (lib/otel/traces/span-processor.js:347; `pathname` keeps `;`)
- the OTel client rule regex (lib/otel/traces/transformation-rules/312-OtelHttpClient1_23.json, `^([^?]+)`)

#### ⚠️ INF-003 — URI stripping applies to both the inbound request URI and outbound HTTP client calls (implied-MUST)

**Basis (spec:65):**
> This applies to the requested URI, as well as external calls with an HTTP client.

**Implemented:** the inbound `request.uri` is stripped (lib/transaction/index.js:988-992, 740-747), as is the outbound `url` attribute for http/https and http2 (lib/instrumentation/core/http-outbound.js:253-274; lib/subscribers/core/http2.js:256-272).

**Missing:** for outbound calls, query parameters are re-emitted as `request.parameters.*` span attributes by default (lib/transaction/trace/segment.js:296-298), undici keeps `;` parameters in `url` (lib/subscribers/undici/index.js:93-94), and OTel spans forward `url.query`/`http.url` unmodified (lib/otel/traces/attr-reconciler.js:35-47).

#### ⚠️ INF-004 — A sensitive header is collected only if it is added to include AND removed from exclude (implied-MUST)

**Basis (spec:73):**
> In order for the agent to collect these headers, the customer must add the headers to the 'include' list and remove the header from the 'exclude' list.

**Implemented:** an exact exclude beats any include. In lib/config/attribute-filter.js:251-258, `globalExclude === EXACT_MATCH` or `destExclude === EXACT_MATCH` returns false before includes are checked. Verified: `attributes.include:['request.headers.cookie']` together with `exclude:['request.headers.cookie']` gives destinations 0.

**Missing:**
- In Node, a non-allowlisted header is collected by setting `allow_all_headers: true` (lib/header-attributes.js:116-118), not by adding it to the include list. With `allow_all_headers: false`, including `request.headers.cookie` alone does not collect it. With `allow_all_headers: true`, no include is needed at all.
- With wildcard excludes (e.g. the template's `request.headers.x*`), an exact include such as `request.headers.xApiKey` beats the wildcard exclude without being removed from the exclude list (lib/config/attribute-filter.js:261-268, 280-284).

#### ⚠️ INF-006 — Obfuscation applies to every agent-authored datastore module (implied-MUST)

**Basis (spec:30):**
> This also applies to modules that have been written by the agent teams to capture and record datastore queries from any framework or library.

**Implemented:** all agent-authored datastore instrumentation that captures query text goes through `queries.add` and then `obfuscate()`. That covers DatastoreShim (lib/shim/datastore-shim.js:374-397), DbQuerySubscriber (lib/subscribers/db-query.js:44-67; used by pg/query.js, mysql/connection-query.js, cassandra-driver/* and elasticsearch/elasticsearch.js), Prisma (lib/instrumentation/@prisma/client.js:104-115, 179-189) and OTel db segments (lib/otel/traces/segments/database.js:24-40). All of them reach lib/metrics/recorders/database.js:62-70 and then lib/db/slow-query.js:14. Elasticsearch JSON bodies are obfuscated with the default (mysql) dialect, which masks double-quoted strings and numbers.

**Missing:** the OTel bridge also forwards the raw `db.query.text`/`db.statement` span attribute outside the obfuscation pipeline (lib/otel/traces/attr-reconciler.js:43-45; verified).

### Unverified

#### ❓ INF-007 — A query whose only semicolon is at the end stays eligible for an explain plan (implied-MAY)

**Basis (spec:36):**
> For agents that run explain plans by simply prepending a query with the word `EXPLAIN`, the agent **SHOULD NOT** run explain plans on queries with a `;` (semicolon) anywhere but at the end of the query.

**What was searched:** the same `EXPLAIN` searches as for REQ-012 and REQ-013. The Node agent does not run explain plans at all, and lib/ contains no `EXPLAIN` usage, so there is no explain-plan eligibility logic to verify, for a trailing semicolon or otherwise.
