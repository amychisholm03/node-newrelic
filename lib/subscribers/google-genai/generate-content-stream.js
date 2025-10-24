/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const GoogleGenAIGenerateContentInternalSubscriber = require('./generate-content')
const { addLlmMeta, instrumentStream } = require('./helper')

class GoogleGenAIGenerateContentStreamInternalSubscriber extends GoogleGenAIGenerateContentInternalSubscriber {
  constructor({ agent, logger, packageName = '@google/genai', channelName = 'nr_generateContentStreamInternal' }) {
    super({ agent, logger, packageName, channelName })
  }

  asyncEnd(data) {
    const ctx = this.agent.tracer.getContext()
    if (!ctx?.segment || !ctx?.transaction) {
      return
    }
    const { result: response, arguments: args, error: err } = data
    const [request] = args
    instrumentStream({
      agent: this.agent,
      logger: this.logger,
      request,
      headers: ctx.extras?.headers,
      response,
      segment: ctx.segment,
      transaction: ctx.transaction,
      err
    })

    addLlmMeta({
      agent: this.agent,
      transaction: ctx.transaction,
      version: data.moduleVersion,
    })
  }
}

module.exports = GoogleGenAIGenerateContentStreamInternalSubscriber
