/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
const McpClientEvent = require('./event')

class McpClientTool extends McpClientEvent {
  constructor(params) {
    super(params)
    const { agent } = params

    this.name = params.name
    this.duration = params?.segment?.getDurationInMillis()
    this.run_id = this.request_id

    if (agent.config.ai_monitoring.record_content.enabled === true) {
      this.input = params.input
      this.output = params.output
    }
  }
}

module.exports = McpClientTool
