/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { describeInvalidInstrumentation } = require('../../../../lib/subscribers/validate-instrumentation.js')

function validInstrumentation(overrides = {}) {
  return {
    module: { name: 'my-lib', versionRange: '>=1.0.0', filePath: 'index.js' },
    functionQuery: { methodName: 'foo', kind: 'Sync' },
    events: ['end'],
    handlers: { end: () => {} },
    ...overrides
  }
}

test('describeInvalidInstrumentation', async (t) => {
  await t.test('returns null for a fully valid instrumentation', () => {
    assert.equal(describeInvalidInstrumentation(validInstrumentation(), 0), null)
  })

  await t.test('returns a reason when module.name is missing', () => {
    const instrumentation = validInstrumentation({ module: { versionRange: '>=1.0.0', filePath: 'index.js' } })
    assert.equal(
      describeInvalidInstrumentation(instrumentation, 0),
      'instrumentations[0].module.name must be a string'
    )
  })

  await t.test('returns a reason when module.filePath is missing', () => {
    const instrumentation = validInstrumentation({ module: { name: 'my-lib', versionRange: '>=1.0.0' } })
    assert.equal(
      describeInvalidInstrumentation(instrumentation, 0),
      'instrumentations[0].module.filePath must be a string'
    )
  })

  await t.test('returns a reason when module.versionRange is missing', () => {
    const instrumentation = validInstrumentation({ module: { name: 'my-lib', filePath: 'index.js' } })
    assert.equal(
      describeInvalidInstrumentation(instrumentation, 0),
      'instrumentations[0].module.versionRange must be a string'
    )
  })

  await t.test('returns a reason when functionQuery has no identifying field', () => {
    const instrumentation = validInstrumentation({ functionQuery: { kind: 'Sync' } })
    assert.equal(
      describeInvalidInstrumentation(instrumentation, 0),
      'instrumentations[0].functionQuery needs one of methodName/privateMethodName/functionName/expressionName'
    )
  })

  await t.test('returns a reason for an invalid functionQuery.kind (the real amqplib/config.js typo)', () => {
    const instrumentation = validInstrumentation({ functionQuery: { methodName: 'foo', kind: 'Ssync' } })
    assert.equal(
      describeInvalidInstrumentation(instrumentation, 0),
      "instrumentations[0].functionQuery.kind must be one of Sync/Async/Auto/Callback, got 'Ssync'"
    )
  })

  await t.test('allows functionQuery.kind to be omitted', () => {
    const instrumentation = validInstrumentation({ functionQuery: { methodName: 'foo' } })
    assert.equal(describeInvalidInstrumentation(instrumentation, 0), null)
  })

  await t.test('returns a reason for an unknown event name', () => {
    const instrumentation = validInstrumentation({ events: ['edn'], handlers: { edn: () => {} } })
    assert.equal(
      describeInvalidInstrumentation(instrumentation, 0),
      "instrumentations[0].events contains unknown event 'edn' - must be one of asyncEnd/asyncStart/end/error"
    )
  })

  await t.test('returns a reason when an event is listed but its handler is missing', () => {
    const instrumentation = validInstrumentation({ events: ['end'], handlers: {} })
    assert.equal(
      describeInvalidInstrumentation(instrumentation, 0),
      'instrumentations[0].handlers.end must be a function (listed in events but missing/not a function)'
    )
  })

  await t.test('returns a reason when events is not an array', () => {
    const instrumentation = validInstrumentation({ events: 'end' })
    assert.equal(describeInvalidInstrumentation(instrumentation, 0), 'instrumentations[0].events must be an array')
  })

  await t.test('returns a reason when handlers is not an object', () => {
    const instrumentation = validInstrumentation({ handlers: null })
    assert.equal(describeInvalidInstrumentation(instrumentation, 0), 'instrumentations[0].handlers must be an object')
  })

  await t.test('returns a reason when handlers.handler is present but not a function', () => {
    const instrumentation = validInstrumentation({ events: [], handlers: { handler: 'not a function' } })
    assert.equal(
      describeInvalidInstrumentation(instrumentation, 0),
      'instrumentations[0].handlers.handler must be a function'
    )
  })

  await t.test('returns a reason for a handlers key typo\'d off of "handler" (e.g. "hander")', () => {
    const instrumentation = validInstrumentation({ events: ['end'], handlers: { hander: () => {}, end: () => {} } })
    assert.equal(
      describeInvalidInstrumentation(instrumentation, 0),
      "instrumentations[0].handlers.hander is not listed in events - either add 'hander' to events, or remove this handler (possible typo?)"
    )
  })

  await t.test('returns a reason for a stray handlers key never added to events (e.g. "ned" instead of "end")', () => {
    const instrumentation = validInstrumentation({ events: [], handlers: { ned: () => {} } })
    assert.equal(
      describeInvalidInstrumentation(instrumentation, 0),
      "instrumentations[0].handlers.ned is not listed in events - either add 'ned' to events, or remove this handler (possible typo?)"
    )
  })

  await t.test('includes the given index in the reason prefix', () => {
    const instrumentation = validInstrumentation({ module: {} })
    assert.equal(
      describeInvalidInstrumentation(instrumentation, 3),
      'instrumentations[3].module.name must be a string'
    )
  })
})
