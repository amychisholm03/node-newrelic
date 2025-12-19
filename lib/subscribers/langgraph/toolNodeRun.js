/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const Subscriber = require('../base')
const LangGraphToolEvent = require('#agentlib/llm-events/langgraph/tool.js')
const { extractLlmContext } = require('#agentlib/util/llm-utils.js')
const { AI: { LANGGRAPH } } = require('#agentlib/metrics/names.js')

class LangGraphToolNodeSubscriber extends Subscriber {
  constructor({ agent, logger, channelName }) {
    super({ agent, logger, channelName: 'nr_run', packageName: '@langchain/langgraph' })
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
    // TODO: how to get const agentName (name of the AI agent associated with the tool call)?

    // Create LlmTool event
    const toolEvent = new LangGraphToolEvent({
      agent,
      name, // toolName
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

  /**
   * Helper to enqueue a LLM event into the custom event aggregator. This will also
   * increment the Supportability metric that's used to derive a tag on the APM entity.
   *
   * TODO: This should be moved to a base AIM subscriber class.
   *
   * @param {object} params function params
   * @param {string} params.type type of llm event (LlmTool, LlmChatCompletionMessage, etc.)
   * @param {object} params.msg the llm event getting enqueued
   * @param {string} params.pkgVersion version of langgraph library instrumented
   */
  recordEvent({ type, msg, pkgVersion }) {
    const { agent } = this
    agent.metrics.getOrCreateMetric(`${LANGGRAPH.TRACKING_PREFIX}/${pkgVersion}`).incrementCallCount()
    const llmContext = extractLlmContext(agent)

    agent.customEventAggregator.add([
      { type, timestamp: Date.now() },
      Object.assign({}, msg, llmContext)
    ])
  }
}

module.exports = LangGraphToolNodeSubscriber
