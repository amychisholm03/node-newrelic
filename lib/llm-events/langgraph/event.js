/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const BaseLlmEvent = require('../event')
const { makeId } = require('../../util/hashes')

module.exports = class LangGraphEvent extends BaseLlmEvent {
  id = makeId(36)
  span_id
  trace_id
  ingest_source = 'Node'
  vendor = 'langgraph'

  // TODO: make a paramsdef

  /**
   *
   * @param {object} params should have agent, segment, and transaction
   */
  constructor(params) {
    super(params)
    const { agent, segment, transaction } = params

    this.span_id = segment?.id
    this.trace_id = transaction?.traceId
    this.langgraphMeta = params.metadata
    // assigning the metadata will allow BaseLlmEvent
    // to extract the relevant `llm.<user_defined_metadata>`
    this.metadata = agent
    this.error = params.error ?? null
  }
}
