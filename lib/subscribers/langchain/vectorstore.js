/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
const LangchainSubscriber = require('./base')
// const {
//   AI: { LANGCHAIN }
// } = require('../../metrics/names')
class LangchainVectorstoreSubscriber extends LangchainSubscriber {
  constructor({ agent, logger }) {
    super({ agent, logger, packageName: '@langchain/core', channelName: 'nr_similaritySearch' })
    this.events = ['asyncEnd', 'end']
  }

  handler(data, ctx) {
    // const [request, k] = data?.arguments
    // const segmentName = `${LANGCHAIN.VECTORSTORE}/${request?.name}`
  }
}

module.exports = LangchainVectorstoreSubscriber
