/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const ModulePatch = require('@apm-js-collab/tracing-hooks')
const Subscriber = require('./base')
const logger = require('../logger').child({ component: 'subscription' })

const ALLOWED_KINDS = ['Sync', 'Async', 'Auto', 'Callback']
const ALLOWED_EVENTS = ['asyncEnd', 'asyncStart', 'end', 'error']

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
 * Applies a `{handler, end, asyncEnd, asyncStart, error}`-shaped object to `subscriber` in one
 * shot: assigns `.handler` (if given), derives `.events` from whichever of the other keys are
 * present, validates event names/handler types, and wraps each lifecycle handler to touch the
 * active segment afterward.
 *
 * @param {string} moduleName Used only for error messages.
 * @param {Subscriber} subscriber The subscriber to configure.
 * @param {object} handlers `{handler, end, asyncEnd, asyncStart, error}` - all optional, but at
 * least one should be present.
 * @returns {void}
 */
function applyHandlers(moduleName, subscriber, handlers) {
  if (handlers.handler !== undefined) {
    if (typeof handlers.handler !== 'function') {
      throw new TypeError(`subscription for '${moduleName}': handler for 'handler' must be a function`)
    }
    const userHandler = handlers.handler
    subscriber.handler = function (data, ctx) {
      const result = userHandler.call(this, data, ctx)
      return result ?? ctx
    }
  }

  const events = Object.keys(handlers).filter((key) => key !== 'handler')
  for (const event of events) {
    if (!ALLOWED_EVENTS.includes(event)) {
      throw new TypeError(`subscription for '${moduleName}': unknown event '${event}' - must be one of handler/${ALLOWED_EVENTS.join('/')}`)
    }
    if (typeof handlers[event] !== 'function') {
      throw new TypeError(`subscription for '${moduleName}': handler for '${event}' must be a function`)
    }
    const userHandler = handlers[event]
    subscriber[event] = function (data) {
      const result = userHandler.call(this, data)
      this.agent.tracer.getContext()?.segment?.touch()
      return result
    }
  }
  subscriber.events = events
}

/**
 * Validates a subscriber's final configuration before it's enabled: `.events` must be an array,
 * and any lifecycle handler assigned directly on the instance must also be listed in `.events`.
 *
 * @param {string} moduleName Used only for error messages.
 * @param {Subscriber} subscriber The subscriber to validate.
 * @returns {void}
 */
function validateSubscriberConfig(moduleName, subscriber) {
  if (!Array.isArray(subscriber.events)) {
    throw new TypeError(`subscription for '${moduleName}': subscriber.events must be an array, got ${typeof subscriber.events}`)
  }
  for (const event of ALLOWED_EVENTS) {
    const hasOwnHandler = Object.prototype.hasOwnProperty.call(subscriber, event)
    if (hasOwnHandler && !subscriber.events.includes(event)) {
      throw new TypeError(`subscription for '${moduleName}': '${event}' is defined but not listed in subscriber.events - it will never fire. Add '${event}' to subscriber.events.`)
    }
  }
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
   * Declares a function to instrument and returns a real `Subscriber` instance for it. Validates
   * `module`/`functionQuery` immediately.
   *
   * Pass `handlers` for the common case - `{handler, end, asyncEnd, asyncStart, error}` (all
   * optional) - and `.events`/the auto-touch wrapping are handled for you. Or omit it and
   * configure the returned subscriber directly (set `.events`, assign `.handler`/`.end`/etc.
   * yourself), the same way you'd write a hand-authored subscriber (see
   * lib/subscribers/README.md) - more steps, but full control (e.g. touching the segment
   * yourself, or deciding whether to attach a handler at all based on some runtime condition).
   *
   * @param {object} params to function
   * @param {object} params.module Target module details (`name`, `filePath`, `versionRange`).
   * @param {object} params.functionQuery Identifies the target function (one of
   * `methodName`/`privateMethodName`/`functionName`/`expressionName`, plus optional `kind`).
   * @param {object} [handlers] `{handler, end, asyncEnd, asyncStart, error}` - all optional.
   * `handler` fires once per call, at the call itself. Whichever others are given get added to
   * `.events` automatically.
   * @returns {Subscriber} A new subscriber instance for this target - configure it further if
   * needed, then call `.register()` on this subscription once every target is configured.
   */
  instrument({ module, functionQuery }, handlers) {
    validateModule(this.moduleName, module)
    validateFunctionQuery(this.moduleName, functionQuery)

    const targetName = functionQuery.methodName || functionQuery.privateMethodName ||
      functionQuery.functionName || functionQuery.expressionName
    const channelName = `nr_custom_${this.moduleName}_${targetName}`

    const subscriber = new Subscriber({ agent: this.agent, logger, packageName: this.moduleName, channelName })
    if (handlers) {
      applyHandlers(this.moduleName, subscriber, handlers)
    }
    this._targets.push({ module, functionQuery, channelName, subscriber })
    return subscriber
  }

  /**
   * Enables and subscribes every declared target's subscriber, then patches a `ModulePatch`
   * scoped to just this subscription's targets. Call once, after every target returned by
   * `.instrument()` has been configured.
   *
   * @returns {void}
   */
  register() {
    const instrumentations = []

    for (const { module, functionQuery, channelName, subscriber } of this._targets) {
      validateSubscriberConfig(this.moduleName, subscriber)
      instrumentations.push({ module, functionQuery, channelName })
      subscriber.enable()
      subscriber.subscribe()
      this._subscribers[subscriber.id] = subscriber
    }

    this._modulePatch = new ModulePatch({ instrumentations })
    this._modulePatch.patch()
  }
}

module.exports = Subscription
