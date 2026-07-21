/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const Subscriber = require('./base')

const ALLOWED_EVENTS = [
  'asyncEnd',
  'asyncStart',
  'end',
  'error'
]

function createCustomSubscriber({ channelName, handlers, events }) {
  class CustomSubscriber extends Subscriber {
    constructor({ agent, logger, packageName }) {
      super({ agent, logger, packageName, channelName })
      this.events = events
    }
  }

  // Create handlers
  if (handlers.handler) {
    CustomSubscriber.prototype.handler = handlers.handler
  }
  for (const event of events) {
    if (ALLOWED_EVENTS.includes(event)) {
      const userHandler = handlers[event]
      CustomSubscriber.prototype[event] = function (data) {
        const result = userHandler.call(this, data)
        // Touch the segment for the user for accurate duration
        this.agent.tracer.getContext()?.segment?.touch()
        return result
      }
    }
  }

  return CustomSubscriber
}

module.exports = createCustomSubscriber
