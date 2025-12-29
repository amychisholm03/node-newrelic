/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const LangGraphEvent = require('./event')

module.exports = class LangGraphToolEvent extends LangGraphEvent {
  name // tool name
  agentName // Llm agent that called this tool
  run_id

  /**
   *
   * @param {object} params should contain name, runId, and agentName
   */
  constructor(params) {
    super(params)

    this.name = params.name
    this.agent_name = params.agentName
    this.run_id = params.runId

    if (params?.agent.config.ai_monitoring.record_content.enabled === true) {
      this.input = params.input
      this.output = params.output
    }
  }
}
