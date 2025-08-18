/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const pgClientQueryConfig = {
  path: './pg/client-query.js',
  instrumenations: [{
    channelName: 'nr_query',
    module: {
      name: 'pg',
      versionRange: '>=8.2.0',
      filePath: 'packages/pg/lib/client.js'
    },
    functionQuery: {
      className: 'Client',
      methodName: 'query',
      kind: 'Async'
    }
  }
  ]
}

module.exports = {
  pg: [pgClientQueryConfig]
}
