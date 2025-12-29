/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const LangGraphSubscriber = require('./base')
const LangGraphAgentEvent = require('#agentlib/llm-events/langgraph/agent.js')
const { AI: { LANGGRAPH } } = require('#agentlib/metrics/names.js')

class LangGraphInvokeSubscriber extends LangGraphSubscriber {
  constructor({ agent, logger }) {
    super({ agent, logger, channelName: 'nr_invoke' })
    this.events = ['asyncEnd']
  }

  get enabled() {
    return super.enabled && this.agent.config.ai_monitoring.enabled
  }

  handler(data, ctx) {
    if (!this.enabled) {
      this.logger.debug('LangGraph instrumentation is disabled, not creating segment.')
      return ctx
    }

    const agentName = data?.self?.name ?? 'agent'

    const segment = this.agent.tracer.createSegment({
      name: `${LANGGRAPH.AGENT}/invoke/${agentName}`,
      parent: ctx.segment,
      transaction: ctx.transaction
    })
    return ctx.enterSegment({ segment })
  }

  asyncEnd(data) {
    // Get constants and exit early if need be
    const { agent, logger } = this
    if (!this.enabled) {
      logger.debug('LangGraph instrumentation is disabled, not recording Llm events.')
    }
    const ctx = agent.tracer.getContext()
    const { segment, transaction } = ctx
    if (transaction?.isActive() !== true) {
      return
    }
    segment.end()

    // Get data
    const { moduleVersion: pkgVersion, error: err } = data
    const name = data?.self?.name
    const metadata = {} // TODO: where to get this?

    // Create LlmAgent event
    const agentEvent = new LangGraphAgentEvent({
      agent,
      name,
      metadata,
      transaction,
      segment,
      error: err != null
    })
    this.recordEvent({ type: 'LlmAgent', pkgVersion, msg: agentEvent })
  }
}

module.exports = LangGraphInvokeSubscriber
