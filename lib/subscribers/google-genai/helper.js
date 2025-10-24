/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const {
  LlmChatCompletionMessage,
  LlmChatCompletionSummary,
  LlmErrorMessage
} = require('../../../lib/llm-events/google-genai')
const { extractLlmContext } = require('../../util/llm-utils')
const { AI } = require('../../../lib/metrics/names')
const { GEMINI } = AI
const { DESTINATIONS } = require('../../config/attribute-filter')
let TRACKING_METRIC = GEMINI.TRACKING_PREFIX

/**
 * Enqueues a LLM event to the custom event aggregator
 *
 * @param {object} params input params
 * @param {Agent} params.agent NR agent instance
 * @param {string} params.type LLM event type
 * @param {object} params.msg LLM event
 */
function recordEvent({ agent, type, msg }) {
  const llmContext = extractLlmContext(agent)

  agent.customEventAggregator.add([
    { type, timestamp: Date.now() },
    Object.assign({}, msg, llmContext)
  ])
}

/**
 * Generates LlmChatCompletionSummary for a chat completion creation.
 * Also iterates over both input messages and the first response message
 * and creates LlmChatCompletionMessage.
 *
 * Also assigns relevant ids by response id for LlmFeedbackEvent creation
 *
 * @param {object} params input params
 * @param {Agent} params.agent NR agent instance
 * @param {TraceSegment} params.segment active segment from chat completion
 * @param {object} params.request chat completion params
 * @param {object} [params.response] chat completion response
 * @param {boolean} [params.err] err if it exists
 * @param {Transaction} params.transaction active transaction
 */
function recordChatCompletionMessages({
  agent,
  segment,
  request,
  response,
  err,
  transaction
}) {
  if (!response) {
    // If we get an error, it is possible that `response = null`.
    // In that case, we define it to be an empty object.
    response = {}
  }

  // Explicitly end segment to provide consistent duration
  // for both LLM events and the segment
  segment.end()
  const completionSummary = new LlmChatCompletionSummary({
    agent,
    segment,
    transaction,
    request,
    response,
    withError: err != null
  })

  // Only take the first response message and append to input messages
  // request.contents can be a string or an array of strings
  // response.candidates is an array of candidates (choices); we only take the first one
  const inputMessages = Array.isArray(request.contents) ? request.contents : [request.contents]
  const responseMessage = response?.candidates?.[0]?.content
  const messages = responseMessage !== undefined ? [...inputMessages, responseMessage] : inputMessages
  messages.forEach((message, index) => {
    const completionMsg = new LlmChatCompletionMessage({
      agent,
      segment,
      transaction,
      request,
      response,
      index,
      completionId: completionSummary.id,
      message
    })

    recordEvent({ agent, type: 'LlmChatCompletionMessage', msg: completionMsg })
  })

  recordEvent({ agent, type: 'LlmChatCompletionSummary', msg: completionSummary })

  if (err) {
    const llmError = new LlmErrorMessage({ cause: err, summary: completionSummary, response })
    agent.errors.add(transaction, err, llmError)
  }
}

/**
 * Increments the tracking metric and sets the llm attribute on transactions
 *
 * @param {object} params input params
 * @param {Agent} params.agent NR agent instance
 * @param {Transaction} params.transaction active transaction
 * @param {string} params.version package version
 */
function addLlmMeta({ agent, transaction, version }) {
  TRACKING_METRIC = `${TRACKING_METRIC}/${version}`
  agent.metrics.getOrCreateMetric(TRACKING_METRIC).incrementCallCount()
  transaction.trace.attributes.addAttribute(DESTINATIONS.TRANS_EVENT, 'llm', true)
}
module.exports = {
  recordChatCompletionMessages,
  addLlmMeta
}
