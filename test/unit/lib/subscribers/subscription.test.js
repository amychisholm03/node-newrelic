/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const assert = require('node:assert')
const test = require('node:test')
const sinon = require('sinon')
const proxyquire = require('proxyquire')
const helper = require('#testlib/agent_helper.js')

const VALID_MODULE = { name: 'my-lib', versionRange: '>=1.0.0', filePath: 'index.js' }
const VALID_FUNCTION_QUERY = { methodName: 'foo', kind: 'Sync' }

function loadSubscription({ patchStub, unpatchStub, captureOpts } = {}) {
  class FakeModulePatch {
    constructor(opts) {
      if (captureOpts) {
        captureOpts(opts)
      }
    }

    patch(...args) {
      return patchStub ? patchStub(...args) : undefined
    }

    unpatch(...args) {
      return unpatchStub ? unpatchStub(...args) : undefined
    }
  }

  return proxyquire('../../../../lib/subscribers/subscription.js', {
    '@apm-js-collab/tracing-hooks': FakeModulePatch
  })
}

test('Subscription constructor', async (t) => {
  await t.test('should throw for a non-string moduleName', () => {
    const Subscription = loadSubscription()
    assert.throws(() => new Subscription({}, undefined), TypeError)
    assert.throws(() => new Subscription({}, 123), TypeError)
  })

  await t.test('should not throw for a valid moduleName', () => {
    const Subscription = loadSubscription()
    assert.doesNotThrow(() => new Subscription({}, 'my-lib'))
  })
})

test('Subscription#instrument', async (t) => {
  t.beforeEach((ctx) => {
    const Subscription = loadSubscription()
    ctx.nr = { subscription: new Subscription({}, 'my-lib') }
  })

  await t.test('should throw when module.name is missing', (t) => {
    const { subscription } = t.nr
    assert.throws(
      () => subscription.instrument({ module: { versionRange: '>=1.0.0', filePath: 'index.js' }, functionQuery: VALID_FUNCTION_QUERY }),
      /module\.name must be a string/
    )
  })

  await t.test('should throw when module.filePath is missing', (t) => {
    const { subscription } = t.nr
    assert.throws(
      () => subscription.instrument({ module: { name: 'my-lib', versionRange: '>=1.0.0' }, functionQuery: VALID_FUNCTION_QUERY }),
      /module\.filePath must be a string/
    )
  })

  await t.test('should throw when module.versionRange is missing', (t) => {
    const { subscription } = t.nr
    assert.throws(
      () => subscription.instrument({ module: { name: 'my-lib', filePath: 'index.js' }, functionQuery: VALID_FUNCTION_QUERY }),
      /module\.versionRange must be a string/
    )
  })

  await t.test('should throw when functionQuery has no identifying field', (t) => {
    const { subscription } = t.nr
    assert.throws(
      () => subscription.instrument({ module: VALID_MODULE, functionQuery: { kind: 'Sync' } }),
      /functionQuery needs one of methodName\/privateMethodName\/functionName\/expressionName/
    )
  })

  await t.test('should throw for an invalid kind (regression: the real "Ssync" typo)', (t) => {
    const { subscription } = t.nr
    assert.throws(
      () => subscription.instrument({ module: VALID_MODULE, functionQuery: { methodName: 'foo', kind: 'Ssync' } }),
      /functionQuery\.kind must be one of Sync\/Async\/Auto\/Callback, got 'Ssync'/
    )
  })

  await t.test('should succeed and return a chainable target for valid input', (t) => {
    const { subscription } = t.nr
    const target = subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY })
    assert.ok(target)
    assert.equal(typeof target.on, 'function')
    assert.deepEqual(target.events, [])
    assert.deepEqual(target.handlers, {})
  })
})

test('InstrumentationTarget#on', async (t) => {
  t.beforeEach((ctx) => {
    const Subscription = loadSubscription()
    const subscription = new Subscription({}, 'my-lib')
    const target = subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY })
    ctx.nr = { target }
  })

  await t.test('should throw when handler is not a function', (t) => {
    const { target } = t.nr
    assert.throws(() => target.on('end', 'not-a-function'), /handler for 'end' must be a function/)
  })

  await t.test('should throw for an unknown event (regression: the "edn" typo)', (t) => {
    const { target } = t.nr
    assert.throws(() => target.on('edn', () => {}), /unknown event 'edn'/)
  })

  await t.test('should not throw for "handler", assigning to handlers.handler', (t) => {
    const { target } = t.nr
    const handler = () => {}
    target.on('handler', handler)
    assert.equal(target.handlers.handler, handler)
    assert.deepEqual(target.events, [])
  })

  await t.test('should return `this` for chaining, accumulating events/handlers', (t) => {
    const { target } = t.nr
    const endHandler = () => {}
    const asyncEndHandler = () => {}
    const result = target.on('end', endHandler).on('asyncEnd', asyncEndHandler)
    assert.equal(result, target)
    assert.deepEqual(target.events, ['end', 'asyncEnd'])
    assert.equal(target.handlers.end, endHandler)
    assert.equal(target.handlers.asyncEnd, asyncEndHandler)
  })
})

test('Subscription#register', async (t) => {
  t.beforeEach((ctx) => {
    ctx.nr = { agent: helper.loadMockedAgent() }
  })

  t.afterEach((ctx) => {
    helper.unloadAgent(ctx.nr.agent)
  })

  await t.test('should patch a ModulePatch scoped to the declared instrumentations', (t) => {
    const { agent } = t.nr
    const patchStub = sinon.stub()
    let capturedOpts = null
    const Subscription = loadSubscription({ patchStub, captureOpts: (opts) => { capturedOpts = opts } })

    const subscription = new Subscription(agent, 'my-lib')
    subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY })
      .on('end', () => {})

    subscription.register()

    assert.ok(patchStub.calledOnce)
    assert.equal(capturedOpts.instrumentations.length, 1)
    assert.equal(capturedOpts.instrumentations[0].module.name, 'my-lib')
    assert.equal(capturedOpts.instrumentations[0].channelName, 'nr_custom_my-lib_foo')
  })

  await t.test('should create one subscriber per instrumented target', (t) => {
    const { agent } = t.nr
    const Subscription = loadSubscription({ patchStub: sinon.stub() })

    const subscription = new Subscription(agent, 'my-lib')
    subscription.instrument({ module: VALID_MODULE, functionQuery: { methodName: 'foo', kind: 'Sync' } }).on('end', () => {})
    subscription.instrument({ module: VALID_MODULE, functionQuery: { methodName: 'bar', kind: 'Sync' } }).on('end', () => {})

    subscription.register()

    assert.equal(Object.keys(subscription._subscribers).length, 2)
  })

  await t.test('the "handler" event fires and can return a new context', (t) => {
    const { agent } = t.nr
    const Subscription = loadSubscription({ patchStub: sinon.stub() })

    const subscription = new Subscription(agent, 'my-lib')
    let sawData
    subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY })
      .on('handler', (data, ctx) => {
        sawData = data
        return ctx
      })
    subscription.register()

    const [subscriber] = Object.values(subscription._subscribers)
    const fakeCtx = { fake: true }
    const result = subscriber.handler({ some: 'data' }, fakeCtx)

    assert.equal(result, fakeCtx)
    assert.deepEqual(sawData, { some: 'data' })
  })

  await t.test('falls back to the original ctx if the "handler" event forgets to return one', (t) => {
    const { agent } = t.nr
    const Subscription = loadSubscription({ patchStub: sinon.stub() })

    const subscription = new Subscription(agent, 'my-lib')
    subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY })
      .on('handler', () => { /* forgot to return anything */ })
    subscription.register()

    const [subscriber] = Object.values(subscription._subscribers)
    const fakeCtx = { fake: true }
    const result = subscriber.handler({}, fakeCtx)

    assert.equal(result, fakeCtx)
  })

  await t.test('a listed event handler runs and touches the active segment', (t) => {
    const { agent } = t.nr
    const Subscription = loadSubscription({ patchStub: sinon.stub() })

    const subscription = new Subscription(agent, 'my-lib')
    let handlerCalled = false
    subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY })
      .on('end', () => { handlerCalled = true })
    subscription.register()

    const [subscriber] = Object.values(subscription._subscribers)

    helper.runInTransaction(agent, (tx) => {
      const segment = tx.trace.root
      const touchSpy = sinon.spy(segment, 'touch')
      sinon.stub(agent.tracer, 'getContext').returns({ segment })

      subscriber.end({})

      assert.ok(handlerCalled)
      assert.ok(touchSpy.called)
      agent.tracer.getContext.restore()
    })
  })
})
