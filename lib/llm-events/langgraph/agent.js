/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const LangGraphEvent = require('./event')

module.exports = class LangGraphAgentEvent extends LangGraphEvent {
  name = 'agent' // LangGraph agent name

  /**
   *
   * @param {object} params should contain LangGraph agent name, runId, and NR agent
   */
  constructor(params) {
    super(params)
    this.name = params.name
  }
}
