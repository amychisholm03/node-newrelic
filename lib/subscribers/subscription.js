/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const ModulePatch = require('@apm-js-collab/tracing-hooks')
const Subscriber = require('./base')
const logger = require('../logger').child({ component: 'subscription' })

const ALLOWED_EVENTS = ['asyncEnd', 'asyncStart', 'end', 'error']
const ALLOWED_KINDS = ['Sync', 'Async', 'Auto', 'Callback']

function validateModule(moduleName, module) {
  if (typeof module?.name !== 'string') {
    throw new TypeError(`subscription for '${moduleName}': module.name must be a string`)
  }
  if (typeof module?.filePath !== 'string') {
    throw new TypeError(`subscription for '${moduleName}': module.filePath must be a string`)
  }
  if (typeof module?.versionRange !== 'string') {
    throw new TypeError(`subscription for '${moduleName}': module.versionRange must be a string`)
  }
}

function validateFunctionQuery(moduleName, functionQuery) {
  const { methodName, privateMethodName, functionName, expressionName, kind } = functionQuery || {}
  if (!methodName && !privateMethodName && !functionName && !expressionName) {
    throw new TypeError(`subscription for '${moduleName}': functionQuery needs one of methodName/privateMethodName/functionName/expressionName`)
  }
  if (kind !== undefined && !ALLOWED_KINDS.includes(kind)) {
    throw new TypeError(`subscription for '${moduleName}': functionQuery.kind must be one of ${ALLOWED_KINDS.join('/')}, got '${kind}'`)
  }
}

/**
 * A single hooked function within a {@link Subscription} - returned by
 * {@link Subscription#instrument} so its events/handlers can be registered via {@link #on}.
 */
class InstrumentationTarget {
  constructor({ moduleName, module, functionQuery }) {
    this.moduleName = moduleName
    this.module = module
    this.functionQuery = functionQuery
    this.events = []
    this.handlers = {}
  }

  /**
   * Registers a handler for the given lifecycle event, validating both immediately.
   *
   * IMPORTANT: `handler` is called with `this` set to the subscriber instance (e.g. so
   * `this.createSegment(...)` works) - that only works for a `function`. Use an arrow function
   * only if `handler` doesn't need `this`.
   *
   * IMPORTANT for `'handler'` specifically: whatever it returns becomes the active context for
   * the rest of the call (it's bound via `bindStore`, not just read back later like every other
   * event) - forgetting to `return` loses the real segment/transaction for the whole operation,
   * not just this handler. If your function doesn't need to change the context, just don't
   * register a `'handler'` handler at all - the context is left alone by default.
   *
   * @param {string} event One of 'handler' (fires once, at the call itself - where segments
   * typically get created, and whose return value becomes the active context - see above), or
   * 'end'/'asyncEnd'/'asyncStart'/'error' (fire on the named lifecycle event; return value ignored).
   * @param {Function} handler The function to run when `event` fires. Use `function`, not an
   * arrow function, if it needs `this` (e.g. `this.createSegment(...)`, `this.agent`) - arrow
   * functions ignore the `this` this API tries to give them.
   * @returns {InstrumentationTarget} `this`, so calls can be chained.
   */
  on(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`subscription for '${this.moduleName}': handler for '${event}' must be a function`)
    }
    if (event === 'handler') {
      this.handlers.handler = handler
      return this
    }
    if (!ALLOWED_EVENTS.includes(event)) {
      throw new TypeError(`subscription for '${this.moduleName}': unknown event '${event}' - must be one of handler/${ALLOWED_EVENTS.join('/')}`)
    }
    this.events.push(event)
    this.handlers[event] = handler
    return this
  }
}

/**
 * Builds a one-off `Subscriber` subclass for a single {@link InstrumentationTarget} - the same
 * shape as a hand-written `Subscriber` (see lib/subscribers/base.js), just assembled from the
 * events/handlers a caller registered via `.on()`.
 *
 * @param {object} params to function
 * @param {string} params.channelName Diagnostics channel name for this target.
 * @param {string[]} params.events Lifecycle events (other than 'handler') to subscribe to.
 * @param {object} params.handlers Map of event name to handler function, plus optionally
 * `handler` for the 'handler' event.
 * @returns {object} A `Subscriber` subclass ready to be constructed and enabled.
 */
function buildCustomSubscriberClass({ channelName, events, handlers }) {
  class CustomSubscriber extends Subscriber {
    constructor({ agent, packageName }) {
      super({ agent, logger, packageName, channelName })
      this.events = events
    }
  }

  if (handlers.handler) {
    const userHandler = handlers.handler
    CustomSubscriber.prototype.handler = function (data, ctx) {
      // Whatever this returns is bound as the active context for the rest of the call - falling
      // back to the original `ctx` when the user's function returns nothing means forgetting a
      // `return` degrades to a no-op instead of silently losing the segment/transaction for the
      // whole operation (see the `.on()` JSDoc above for why that matters here specifically).
      const result = userHandler.call(this, data, ctx)
      return result ?? ctx
    }
  }

  for (const event of events) {
    const userHandler = handlers[event]
    CustomSubscriber.prototype[event] = function (data) {
      const result = userHandler.call(this, data)
      // Touch the segment for the user for accurate duration
      this.agent.tracer.getContext()?.segment?.touch()
      return result
    }
  }

  return CustomSubscriber
}

class Subscription {
  constructor(agent, moduleName) {
    if (typeof moduleName !== 'string') {
      throw new TypeError('createSubscription requires a moduleName string')
    }
    this.agent = agent
    this.moduleName = moduleName
    this._targets = []
    this._subscribers = {}
    this._modulePatch = null
  }

  /**
   * Declares a function to instrument. Validates `module`/`functionQuery` immediately.
   *
   * @param {object} params to function
   * @param {object} params.module Target module details (`name`, `filePath`, `versionRange`).
   * @param {object} params.functionQuery Identifies the target function (one of
   * `methodName`/`privateMethodName`/`functionName`/`expressionName`, plus optional `kind`).
   * @returns {InstrumentationTarget} The new target, for chaining `.on(event, handler)` calls.
   */
  instrument({ module, functionQuery }) {
    validateModule(this.moduleName, module)
    validateFunctionQuery(this.moduleName, functionQuery)
    const target = new InstrumentationTarget({ moduleName: this.moduleName, module, functionQuery })
    this._targets.push(target)
    return target
  }

  /**
   * Builds and enables a `Subscriber` for every declared target, then patches a `ModulePatch`
   * scoped to just this subscription's targets. Call once, after all `.instrument()`/`.on()`
   * calls are done.
   *
   * @returns {void}
   */
  register() {
    const instrumentations = []

    for (const target of this._targets) {
      const { module, functionQuery, events, handlers } = target
      const targetName = functionQuery.methodName || functionQuery.privateMethodName ||
        functionQuery.functionName || functionQuery.expressionName
      const channelName = `nr_custom_${this.moduleName}_${targetName}`
      instrumentations.push({ module, functionQuery, channelName })

      const CustomSubscriber = buildCustomSubscriberClass({ channelName, events, handlers })
      const subscriber = new CustomSubscriber({ agent: this.agent, packageName: this.moduleName })
      subscriber.enable()
      subscriber.subscribe()
      this._subscribers[subscriber.id] = subscriber
    }

    this._modulePatch = new ModulePatch({ instrumentations })
    this._modulePatch.patch()
  }
}

module.exports = Subscription
