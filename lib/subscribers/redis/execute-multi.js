/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
const ClientPropagationSubscriber = require('./client-propagation')

/**
 * Propagates the context in `RedisClient._executeMulti` and
 * `RedisClient[redisClientOpts]` into `RedisCommandQueue.addCommand`.
 */
module.exports = class ClientExecuteMultiSubscriber extends ClientPropagationSubscriber {
  constructor({ agent, logger }) {
    super({ agent, logger, channelName: 'nr_executeMulti' })
  }
}
