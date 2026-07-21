/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const ALLOWED_EVENTS = ['asyncEnd', 'asyncStart', 'end', 'error']
const ALLOWED_KINDS = ['Sync', 'Async', 'Auto', 'Callback']

function describeInvalidModule(module, prefix) {
  if (typeof module?.name !== 'string') return `${prefix}.module.name must be a string`
  if (typeof module?.filePath !== 'string') return `${prefix}.module.filePath must be a string`
  if (typeof module?.versionRange !== 'string') return `${prefix}.module.versionRange must be a string`
  return null
}

function describeInvalidFunctionQuery(functionQuery, prefix) {
  const { methodName, privateMethodName, functionName, expressionName, kind } = functionQuery || {}
  if (!methodName && !privateMethodName && !functionName && !expressionName) {
    return `${prefix}.functionQuery needs one of methodName/privateMethodName/functionName/expressionName`
  }
  if (kind !== undefined && !ALLOWED_KINDS.includes(kind)) {
    return `${prefix}.functionQuery.kind must be one of ${ALLOWED_KINDS.join('/')}, got '${kind}'`
  }
  return null
}

/**
 * Cross-checks `events` and `handlers` in both directions: every listed event needs a matching
 * handler function, and every handler key (other than the special-cased `handler`) needs to be
 * listed in `events` - the latter is what catches a typo'd handlers key (e.g. `hander` instead of
 * `handler`, or `ned` instead of `end`), which would otherwise silently never fire.
 *
 * @param {*} events The instrumentation entry's `events` field.
 * @param {*} handlers The instrumentation entry's `handlers` field.
 * @param {string} prefix The `instrumentations[i]` prefix to prepend to any reason returned.
 * @returns {string|null} A description of what's wrong, or `null` if valid.
 */
function describeInvalidEventsAndHandlers(events, handlers, prefix) {
  if (!Array.isArray(events)) return `${prefix}.events must be an array`
  if (typeof handlers !== 'object' || handlers === null) return `${prefix}.handlers must be an object`

  for (const event of events) {
    if (!ALLOWED_EVENTS.includes(event)) {
      return `${prefix}.events contains unknown event '${event}' - must be one of ${ALLOWED_EVENTS.join('/')}`
    }
    if (typeof handlers[event] !== 'function') {
      return `${prefix}.handlers.${event} must be a function (listed in events but missing/not a function)`
    }
  }

  if (handlers.handler !== undefined && typeof handlers.handler !== 'function') {
    return `${prefix}.handlers.handler must be a function`
  }

  for (const key of Object.keys(handlers)) {
    if (key !== 'handler' && !events.includes(key)) {
      return `${prefix}.handlers.${key} is not listed in events - either add '${key}' to events, or remove this handler (possible typo?)`
    }
  }

  return null
}

/**
 * Checks a single `subscribeTo` `config.instrumentations` entry for the shape the underlying
 * `ModulePatch`/tracing-hooks mechanism actually requires, returning a specific reason string
 * (naming exactly which field is wrong) rather than a boolean, so the caller can log a precise
 * warning instead of a generic one.
 *
 * @param {object} instrumentation A single entry from `config.instrumentations`.
 * @param {number} index That entry's index, used to build the `instrumentations[i]` prefix.
 * @returns {string|null} A description of what's wrong, or `null` if the entry is valid.
 */
function describeInvalidInstrumentation(instrumentation, index) {
  const { module, functionQuery, events, handlers } = instrumentation || {}
  const prefix = `instrumentations[${index}]`

  return (
    describeInvalidModule(module, prefix) ||
    describeInvalidFunctionQuery(functionQuery, prefix) ||
    describeInvalidEventsAndHandlers(events, handlers, prefix) ||
    null
  )
}

module.exports = { describeInvalidInstrumentation }
