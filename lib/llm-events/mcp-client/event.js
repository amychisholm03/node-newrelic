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
    this.vendor = 'mcp-sdk' // TODO: Double check if this is the right vendor name
    this.ingest_source = 'Node'
  }
}
module.exports = McpClientEvent
