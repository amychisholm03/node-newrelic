/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
const DbOperationSubscriber = require('../db-operation')
const { redisClientOpts } = require('../../symbols')

module.exports = class ClientInternalSendCommandSubscriber extends DbOperationSubscriber {
  constructor({ agent, logger }) {
    super({ agent, logger, channelName: 'nr_internalSendCommand', packageName: 'redis' })
    this.events = ['start']
  }

  start(data) {
    const { self: client } = data
    if (!client[redisClientOpts]) {
      client[redisClientOpts] = this.getRedisParams(client.options)
    }
    return super.asyncStart(data)
  }

  /**
   * Extracts the datastore parameters from the client options
   *
   * @param {object} clientOpts client.options
   * @returns {object} { host, port_path_or_id, database_name }
   */
  getRedisParams(clientOpts) {
    // need to replicate logic done in RedisClient
    // to parse the url to assign to socket.host/port
    // see: https://github.com/redis/node-redis/blob/5576a0db492cda2cd88e09881bc330aa956dd0f5/packages/client/lib/client/index.ts#L160
    if (clientOpts?.url) {
      const parsedURL = new URL(clientOpts.url)
      clientOpts.socket = Object.assign({}, clientOpts.socket, { host: parsedURL.hostname })
      if (parsedURL.port) {
        clientOpts.socket.port = parsedURL.port
      }

      if (parsedURL.pathname) {
        clientOpts.database = parsedURL.pathname.substring(1)
      }
    }

    return {
      host: clientOpts?.host || clientOpts?.socket?.host || 'localhost',
      port_path_or_id:
        clientOpts?.port || clientOpts?.socket?.path || clientOpts?.socket?.port || '6379',
      database_name: clientOpts?.database || 0
    }
  }
}
