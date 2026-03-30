/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const os = require('node:os')

/**
 * Returns a default threshold based on the number of available CPUs.
 * Machines with fewer CPUs tend to have more timing jitter, so we
 * relax the threshold to avoid flaky tests on constrained CI runners.
 *
 * These thresholds were initially set arbitrally and then fine-tuned
 * based on test outputs.
 *
 * @returns {number} threshold ratio (e.g. 0.50 means 50%)
 */
function getDefaultThreshold() {
  const cpus = os.cpus().length
  if (cpus >= 8) {
    return 0.20
  }
  if (cpus >= 4) {
    return 0.30
  }
  return 0.40
}

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
 * @param {number} [params.threshold] maximum allowed ratio difference (default based on CPU count)
 * @param {object} [params.assert] assertion library to use
 */
module.exports = function assertSegmentDuration({
  segment,
  actualTime,
  threshold = getDefaultThreshold(),
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
