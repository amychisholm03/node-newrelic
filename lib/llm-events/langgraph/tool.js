/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const LangGraphEvent = require('./event')

module.exports = class LangGraphToolEvent extends LangGraphEvent {
  run_id
  name // tool name
  agentName // Llm agent that called this tool

  /**
   *
   * @param {object} params should contain name, runId, and agentName
   */
  constructor(params) {
    super(params)
    const { agent } = params

    this.name = params.name
    this.duration = params?.segment?.getDurationInMillis() // TODO: do i need this?
    this.run_id = params.runId
    this.agent_name = params.agentName

    if (agent.config.ai_monitoring.record_content.enabled === true) {
      this.input = params.input
      this.output = params.output
    }
  }
}
