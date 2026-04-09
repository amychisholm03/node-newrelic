/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const LlmTool = require('../tool')

/**
 * Encapsulates a Google ADK LlmTool event.
 */
module.exports = class GoogleAdkLlmTool extends LlmTool {
  /**
   * @param {object} params constructor parameters
   * @param {Agent} params.agent New Relic agent instance
   * @param {object} params.segment Current segment
   * @param {object} params.transaction Current and active transaction
   * @param {string} params.toolName Name of the tool
   * @param {string} params.aiAgentName Name of the AI agent that invoked the tool
   * @param {string} params.runId Tool call ID
   * @param {string} params.input Tool call arguments (JSON string)
   * @param {string} params.output Tool response (JSON string)
   * @param {boolean} [params.error] Set to `true` if an error occurred
   */
  constructor({ agent, segment, transaction, toolName, aiAgentName, runId, input, output, error }) {
    super({ agent, segment, transaction, vendor: 'google_adk', toolName, aiAgentName, runId, input, output, error })
  }
}
