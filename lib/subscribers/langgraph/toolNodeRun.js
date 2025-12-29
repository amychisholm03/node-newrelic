/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const LangGraphSubscriber = require('./base')
const LangGraphToolEvent = require('#agentlib/llm-events/langgraph/tool.js')
const { AI: { LANGGRAPH } } = require('#agentlib/metrics/names.js')

class LangGraphToolNodeSubscriber extends LangGraphSubscriber {
  constructor({ agent, logger }) {
    super({ agent, logger, channelName: 'nr_run' })
    this.events = ['asyncEnd']
  }

  handler(data, ctx) {
    if (!this.enabled) {
      this.logger.debug('LangGraph instrumentation is disabled, not creating segment.')
      return ctx
    }

    const runName = data?.arguments?.[1]?.runName

    const segment = this.agent.tracer.createSegment({
      name: `${LANGGRAPH.TOOL}/run/${runName}`,
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
    const { moduleVersion: pkgVersion, result, error: err } = data
    const toolMessage = result?.messages?.[0]
    const name = toolMessage?.name
    const runId = toolMessage?.tool_call_id
    // TODO: this is just the string input from the user, may be too simple
    // LlmTool.input should be:
    // "Argument(s) input to the tool before it is run (including the argument name and value if available)"
    const input = data?.arguments?.[0].messages?.[0].content // This should be HumanMessage.content
    const output = toolMessage?.content
    const metadata = { ...toolMessage?.metadata, ...toolMessage?.response_metadata }
    const config = data?.arguments?.[1]
    // TODO: I can't find the name of the agent, but this run name may be a useful descriptor.
    const agentName = config?.runName ?? 'unknown'

    // Create LlmTool event
    const toolEvent = new LangGraphToolEvent({
      agent,
      name, // toolName
      agentName,
      runId,
      metadata,
      transaction,
      segment,
      error: err != null,
      output,
      input
    })
    this.recordEvent({ type: 'LlmTool', pkgVersion, msg: toolEvent })
  }
}

module.exports = LangGraphToolNodeSubscriber
