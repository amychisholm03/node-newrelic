/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const Subscriber = require('../base')
const { AI } = require('../../metrics/names')
const { GEMINI } = AI
const { recordChatCompletionMessages, addLlmMeta } = require('./helper')

class GoogleGenAIGenerateContentInternalSubscriber extends Subscriber {
  constructor({ agent, logger, packageName = '@google/genai', channelName = 'nr_generateContentInternal' }) {
    super({ agent, logger, packageName, channelName })
    this.events = ['asyncEnd', 'end']
  }

  get enabled() {
    return super.enabled && this.config.ai_monitoring?.enabled
  }

  handler(data, ctx) {
    const segment = this.agent.tracer.createSegment({
      name: GEMINI.COMPLETION,
      parent: ctx.segment,
      transaction: ctx.transaction
    })
    return ctx.enterSegment({ segment })
  }

  asyncEnd(data) {
    const ctx = this.agent.tracer.getContext()
    if (!ctx?.segment || !ctx?.transaction) {
      return
    }
    const { result: response, arguments: args, error: err } = data
    const [request] = args

    recordChatCompletionMessages({
      agent: this.agent,
      logger: this.logger,
      segment: ctx.segment,
      transaction: ctx.transaction,
      request,
      response,
      headers: ctx.extras?.headers,
      err
    })

    addLlmMeta({
      agent: this.agent,
      transaction: ctx.transaction,
      version: data.moduleVersion,
    })
  }
}

module.exports = GoogleGenAIGenerateContentInternalSubscriber
