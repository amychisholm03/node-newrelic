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
      CustomSubscriber.prototype[event] = handlers[event]
    }
  }

  return CustomSubscriber
}

module.exports = createCustomSubscriber
