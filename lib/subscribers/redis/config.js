/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const addCommand = {
  path: './redis/add-command',
  instrumentations: [{
    channelName: 'nr_addCommand',
    module: { name: '@redis/client',
      versionRange: '>=4',
      filePath: 'dist/lib/client/commands-queue.js' },
    functionQuery: {
      className: 'RedisCommandsQueue',
      methodName: 'addCommand',
      kind: 'Async'
    }
  }]
}

const sendCommand = {
  path: './redis/send-command',
  instrumentations: [
    {
      channelName: 'nr_sendCommand',
      module: { name: '@redis/client', versionRange: '>=4', filePath: 'dist/lib/client/index.js' },
      functionQuery: {
        className: 'RedisClient',
        methodName: 'sendCommand',
        kind: 'Async'
      }
    }
  ]
}

const executeMulti = {
  path: './redis/execute-multi',
  instrumentations: [
    {
      channelName: 'nr_executeMulti',
      module: { name: '@redis/client', versionRange: '>=4', filePath: 'dist/lib/client/index.js' },
      functionQuery: {
        className: 'RedisClient',
        methodName: '_executeMulti',
        kind: 'Async'
      }
    },
  ]
}

const executePipeline = {
  path: './redis/execute-multi',
  instrumentations: [
    {
      channelName: 'nr_executePipeline',
      module: { name: '@redis/client', versionRange: '>=4', filePath: 'dist/lib/client/index.js' },
      functionQuery: {
        className: 'RedisClient',
        methodName: '_executePipeline',
        kind: 'Async'
      }
    },
  ]
}

const clientSelect = {
  path: './redis/select',
  instrumentations: [
    {
      channelName: 'nr_select',
      module: { name: '@redis/client', versionRange: '>=4', filePath: 'dist/lib/client/index.js' },
      functionQuery: {
        className: 'RedisClient',
        methodName: 'SELECT',
        kind: 'Async'
      }
    }
  ]
}

module.exports = {
  '@redis/client': [
    addCommand,
    sendCommand,
    clientSelect,
    executeMulti,
    executePipeline
  ]
}
