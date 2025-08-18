/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const DbQuerySubscriber = require('../db-query')

class PgClientQuerySubscriber extends DbQuerySubscriber {
  constructor({ agent, logger }) {
    super({ agent, logger, packageName: 'pg', channelName: 'nr_query' })
  }
}

module.exports = PgClientQuerySubscriber
