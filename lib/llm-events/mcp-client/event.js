/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const BaseEvent = require('../event')

class McpClientEvent extends BaseEvent {
  constructor(params) {
    super(params)
    const { segment } = params

    this.span_id = segment?.id
    this.request_id = params.requestId
    this.trace_id = params.traceId
    this.vendor = 'MCP'
    this.ingest_source = 'Node'
  }
}
module.exports = McpClientEvent
