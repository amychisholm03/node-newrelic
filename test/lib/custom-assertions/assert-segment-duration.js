/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

/**
 * Asserts that a segment has ended and has a duration within a
 * reasonable percentage of the actual measured time.
 *
 * @example
 * assertSegmentDuration({
 *   segment,
 *   actualTime: process.hrtime(start)
 * })
 *
 * @param {object} params function parameters
 * @param {TraceSegment} params.segment segment to check
 * @param {Array} params.actualTime process.hrtime() duration array [seconds, nanoseconds]
 * @param {number} [params.threshold] maximum allowed ratio difference (0.50 = 50%)
 * @param {object} [params.assert] assertion library to use
 */
module.exports = function assertSegmentDuration({
  segment,
  actualTime,
  threshold = 0.50,
  assert = require('node:assert')
}) {
  assert.equal(segment._isEnded(), true, 'segment should have ended')

  const segmentDuration = segment.getDurationInMillis()
  const actualDuration = actualTime[0] * 1e3 + actualTime[1] / 1e6

  assert.ok(
    actualDuration >= segmentDuration,
    `actual duration (${actualDuration}ms) should be >= segment duration (${segmentDuration}ms)`
  )

  const lowerBound = actualDuration * (1 - threshold)
  assert.ok(
    segmentDuration >= lowerBound,
    `segment duration (${segmentDuration}ms) should be within ${threshold * 100}% of actual duration (${actualDuration}ms). Lower bound: ${lowerBound}ms`
  )
}
