/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
const McpClientTool = require('../../../llm-events/mcp-client/tool')
const { RecorderSpec } = require('../../../shim/specs')
const { extractLlmContext } = require('../../../util/llm-utils')
const LlmErrorMessage = require('../../../llm-events/error-message')
const { DESTINATIONS } = require('../../../config/attribute-filter')
const {
  AI: { MCP_CLIENT }
} = require('../../../metrics/names')

/**
 * Helper to enqueue a LLM event into the custom event aggregator.  This will also
 * increment the Supportability metric that's used to derive a tag on the APM entity.
 *
 * @param {object} params function params
 * @param {Agent} params.agent NR agent
 * @param {string} params.type type of llm event(i.e.- LlmChatCompletionMessage, LlmTool, etc)
 * @param {object} params.msg the llm event getting enqueued
 * @param {string} params.pkgVersion version of langchain library instrumented
 */
function recordEvent({ agent, type, msg, pkgVersion }) {
  agent.metrics.getOrCreateMetric(`${MCP_CLIENT.TRACKING_PREFIX}/${pkgVersion}`).incrementCallCount()
  const llmContext = extractLlmContext(agent)

  agent.customEventAggregator.add([
    { type, timestamp: Date.now() },
    Object.assign({}, msg, llmContext)
  ])
}

module.exports = function initialize(shim, client) {
  const proto = client?.Client?.prototype
  if (!proto) {
    shim.logger.debug('@modelcontextprotocol/sdk client not found, skipping instrumentation')
    return
  }

  const { agent, pkgVersion } = shim

  shim.record(proto, 'callTool', function wrapCallTool(shim, call, fnName, args) {
    const tool = args[0]
    return new RecorderSpec({
      name: `${MCP_CLIENT.TOOL}/callTool/${tool.name}`,
      promise: true,
      after({ error: err, result: output, segment, transaction }) {
        segment.end()
        const toolEvent = new McpClientTool({
          agent,
          name: tool.name,
          transaction,
          input: tool.arguments,
          output,
          segment,
          error: err != null
        })
        recordEvent({ agent, shim, type: 'LlmTool', pkgVersion, msg: toolEvent })

        if (err) {
          agent.errors.add(
            transaction,
            err,
            new LlmErrorMessage({
              response: {},
              cause: err,
              tool: {}
            })
          )
        }

        transaction.trace.attributes.addAttribute(DESTINATIONS.TRANS_EVENT, 'llm', true)
      }
    })
  }
  )

  // TODO: readResource
  // TODO: getPrompt
}
