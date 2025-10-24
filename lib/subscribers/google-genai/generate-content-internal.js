/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const Subscriber = require('../base')
const { AI } = require('../../metrics/names')
const { GEMINI } = AI

class GoogleGenAIGenerateContentInternalSubscriber extends Subscriber {
  constructor({ agent, logger, packageName = '@google/genai', channelName = 'nr_generateContentInternal' }) {
    super({ agent, logger, packageName, channelName })
  }

  handler(data, ctx) {
    const segment = this.agent.tracer.createSegment({
      name: GEMINI.COMPLETION,
      parent: ctx.segment,
      transaction: ctx.transaction
    })
    // TODO: createChatCompletions and addLlmData
    const newCtx = ctx.enterSegment({ segment })
    return newCtx
  }
}

module.exports = GoogleGenAIGenerateContentInternalSubscriber
