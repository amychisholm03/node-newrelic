/*
 * Copyright 2024 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const { MessageSpec } = require('../../shim/specs')
const getByPath = require('../../util/get')

module.exports = function instrumentProducer({ shim, kafkajs }) {
  shim.wrap(kafkajs.Kafka.prototype, 'producer', function nrProducerWrapper(shim, orig) {
    return function nrProducer() {
      const params = shim.argsToArray.apply(shim, arguments)
      const producer = orig.apply(this, params)

      // The `.producer()` method returns an object with `send` and `sendBatch`
      // methods. The `send` method is merely a wrapper around `sendBatch`, but
      // we cannot simply wrap `sendBatch` because the `send` method does not
      // use the object scoped instance (i.e. `this.sendBatch`); it utilizes
      // the closure scoped instance of `sendBatch`. So we must wrap each
      // method.

      shim.recordProduce(producer, 'send', function nrSend(shim, fn, n, args) {
        const data = args[0]
        const firstMessage = getByPath(data, 'messages[0]')

        if (firstMessage) {
          firstMessage.headers = firstMessage.headers ?? {}
        }

        return new MessageSpec({
          promise: true,
          destinationName: data.topic,
          destinationType: shim.TOPIC,
          headers: firstMessage.headers
        })
      })

      shim.recordProduce(producer, 'sendBatch', function nrSendBatch(shim, fn, n, args) {
        const data = args[0]
        const firstMessage = getByPath(data, 'topicMessages[0].messages[0]')

        if (firstMessage) {
          firstMessage.headers = firstMessage.headers ?? {}
        }

        return new MessageSpec({
          promise: true,
          destinationName: data.topicMessages[0].topic,
          destinationType: shim.TOPIC,
          headers: firstMessage.headers
        })
      })

      return producer
    }
  })
}