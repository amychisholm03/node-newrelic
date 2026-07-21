/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

/**
 * Creates a segment, enters it into the given context, and returns the new context.
 *
 * This holds the mechanics shared by `Subscriber.prototype.createSegment`
 * (lib/subscribers/base.js) and the public `API.prototype.createSegment` (api.js), so
 * segment creation only has one implementation.
 *
 * @param {object} params The parameters for creating the segment.
 * @param {Agent} params.agent A New Relic Node.js agent instance.
 * @param {Context} params.ctx The context to create the segment in.
 * @param {string} params.name The name of the segment.
 * @param {Function} [params.recorder] Optional recorder for the segment.
 * @param {object} [params.attributes] Optional key/value attributes to add to the segment.
 * @param {boolean} [params.opaque] Whether the segment should be marked opaque.
 * @param {string} [params.shimId] Identifier used to detect same-package nesting.
 * @returns {Context} The new context with the segment entered, or the original context
 * unchanged (the exact same reference) if the segment could not be created.
 */
function createSegmentInContext({
  agent,
  ctx,
  name,
  recorder,
  attributes,
  opaque = false,
  shimId = null
}) {
  const segment = agent.tracer.createSegment({
    name,
    recorder,
    parent: ctx?.segment,
    transaction: ctx?.transaction
  })

  if (!segment) {
    return ctx
  }

  segment.opaque = opaque
  segment.shimId = shimId
  segment.start()

  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      segment.addAttribute(key, value)
    }
  }

  return ctx.enterSegment({ segment })
}

module.exports = createSegmentInContext
