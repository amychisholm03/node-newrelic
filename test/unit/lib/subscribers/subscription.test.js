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
    const agent = helper.loadMockedAgent()
    ctx.nr = { agent, subscription: new Subscription(agent, 'my-lib') }
  })

  t.afterEach((ctx) => {
    helper.unloadAgent(ctx.nr.agent)
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

  await t.test('should throw for an invalid kind', (t) => {
    const { subscription } = t.nr
    assert.throws(
      () => subscription.instrument({ module: VALID_MODULE, functionQuery: { methodName: 'foo', kind: 'Ssync' } }),
      /functionQuery\.kind must be one of Sync\/Async\/Auto\/Callback, got 'Ssync'/
    )
  })

  await t.test('should succeed and return a configurable Subscriber instance for valid input', (t) => {
    const { subscription } = t.nr
    const subscriber = subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY })
    assert.ok(subscriber)
    assert.deepEqual(subscriber.events, [])
    assert.equal(typeof subscriber.handler, 'function')
    assert.equal(typeof subscriber.end, 'function')
    assert.equal(subscriber.packageName, 'my-lib')
    assert.equal(subscriber.channelName, 'nr_custom_my-lib_foo')
  })
})

test('Subscription#instrument with a handlers object', async (t) => {
  t.beforeEach((ctx) => {
    const Subscription = loadSubscription()
    const agent = helper.loadMockedAgent()
    ctx.nr = { agent, subscription: new Subscription(agent, 'my-lib') }
  })

  t.afterEach((ctx) => {
    helper.unloadAgent(ctx.nr.agent)
  })

  await t.test('derives .events from the given keys, excluding "handler"', (t) => {
    const { subscription } = t.nr
    const subscriber = subscription.instrument(
      { module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY },
      { handler: () => {}, end: () => {}, asyncEnd: () => {} }
    )
    assert.deepEqual(subscriber.events.slice().sort(), ['asyncEnd', 'end'])
  })

  await t.test('throws immediately for an unknown event name', (t) => {
    const { subscription } = t.nr
    assert.throws(
      () => subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY }, { edn: () => {} }),
      /unknown event 'edn'/
    )
  })

  await t.test('throws immediately when a handler value is not a function', (t) => {
    const { subscription } = t.nr
    assert.throws(
      () => subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY }, { end: 'not-a-function' }),
      /handler for 'end' must be a function/
    )
  })

  await t.test('the assigned handler is called with `this` set to the subscriber and falls back to ctx', (t) => {
    const { subscription } = t.nr
    let sawThis
    const subscriber = subscription.instrument(
      { module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY },
      { handler: function () { sawThis = this } }
    )
    const fakeCtx = { fake: true }
    const result = subscriber.handler({}, fakeCtx)
    assert.equal(sawThis, subscriber)
    assert.equal(result, fakeCtx, 'falls back to ctx when the user handler returns nothing')
  })

  await t.test('an assigned event handler touches the segment automatically', (t) => {
    const { agent, subscription } = t.nr
    let handlerCalled = false
    const subscriber = subscription.instrument(
      { module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY },
      { end: () => { handlerCalled = true } }
    )

    helper.runInTransaction(agent, (tx) => {
      const segment = tx.trace.root
      const touchSpy = sinon.spy(segment, 'touch')
      sinon.stub(agent.tracer, 'getContext').returns({ segment })

      subscriber.end({})

      assert.ok(handlerCalled)
      assert.ok(touchSpy.called, 'the shortcut auto-touches, unlike a raw assignment')
      agent.tracer.getContext.restore()
    })
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
    const subscriber = subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY })
    subscriber.events = ['end']
    subscriber.end = () => {}

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
    subscription.instrument({ module: VALID_MODULE, functionQuery: { methodName: 'foo', kind: 'Sync' } })
    subscription.instrument({ module: VALID_MODULE, functionQuery: { methodName: 'bar', kind: 'Sync' } })

    subscription.register()

    assert.equal(Object.keys(subscription._subscribers).length, 2)
  })

  await t.test('an assigned handler fires and can return a new context', (t) => {
    const { agent } = t.nr
    const Subscription = loadSubscription({ patchStub: sinon.stub() })

    const subscription = new Subscription(agent, 'my-lib')
    const subscriber = subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY })
    let sawData
    subscriber.handler = function (data, ctx) {
      sawData = data
      return ctx
    }
    subscription.register()

    const fakeCtx = { fake: true }
    const result = subscriber.handler({ some: 'data' }, fakeCtx)

    assert.equal(result, fakeCtx)
    assert.deepEqual(sawData, { some: 'data' })
  })

  await t.test('an assigned event method runs when its event is listed', (t) => {
    const { agent } = t.nr
    const Subscription = loadSubscription({ patchStub: sinon.stub() })

    const subscription = new Subscription(agent, 'my-lib')
    const subscriber = subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY })
    let handlerCalled = false
    subscriber.events = ['end']
    subscriber.end = () => { handlerCalled = true }
    subscription.register()

    subscriber.end({})

    assert.ok(handlerCalled)
  })

  await t.test('the inherited default end() still touches the segment when not overridden', (t) => {
    const { agent } = t.nr
    const Subscription = loadSubscription({ patchStub: sinon.stub() })

    const subscription = new Subscription(agent, 'my-lib')
    const subscriber = subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY })
    subscriber.events = ['end']
    subscription.register()

    helper.runInTransaction(agent, (tx) => {
      const segment = tx.trace.root
      const touchSpy = sinon.spy(segment, 'touch')
      sinon.stub(agent.tracer, 'getContext').returns({ segment })

      subscriber.end({})

      assert.ok(touchSpy.called)
      agent.tracer.getContext.restore()
    })
  })

  await t.test('overriding end() without touching does not touch the segment', (t) => {
    const { agent } = t.nr
    const Subscription = loadSubscription({ patchStub: sinon.stub() })

    const subscription = new Subscription(agent, 'my-lib')
    const subscriber = subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY })
    subscriber.events = ['end']
    subscriber.end = () => {}
    subscription.register()

    helper.runInTransaction(agent, (tx) => {
      const segment = tx.trace.root
      const touchSpy = sinon.spy(segment, 'touch')
      sinon.stub(agent.tracer, 'getContext').returns({ segment })

      subscriber.end({})

      assert.ok(touchSpy.notCalled)
      agent.tracer.getContext.restore()
    })
  })

  await t.test('throws when a handler is assigned but its event was never added to .events', (t) => {
    const { agent } = t.nr
    const Subscription = loadSubscription({ patchStub: sinon.stub() })

    const subscription = new Subscription(agent, 'my-lib')
    const subscriber = subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY })
    subscriber.end = () => {}

    assert.throws(
      () => subscription.register(),
      /'end' is defined but not listed in subscriber\.events/
    )
  })

  await t.test('throws a clear error, not a native TypeError, when .events is not an array', (t) => {
    const { agent } = t.nr
    const Subscription = loadSubscription({ patchStub: sinon.stub() })

    const subscription = new Subscription(agent, 'my-lib')
    const subscriber = subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY })
    subscriber.events = undefined

    assert.throws(
      () => subscription.register(),
      /subscriber\.events must be an array, got undefined/
    )
  })

  await t.test('does not throw when handlers were assigned via the .instrument() shortcut', (t) => {
    const { agent } = t.nr
    const Subscription = loadSubscription({ patchStub: sinon.stub() })

    const subscription = new Subscription(agent, 'my-lib')
    subscription.instrument({ module: VALID_MODULE, functionQuery: VALID_FUNCTION_QUERY }, { end: () => {} })

    assert.doesNotThrow(() => subscription.register())
  })
})
