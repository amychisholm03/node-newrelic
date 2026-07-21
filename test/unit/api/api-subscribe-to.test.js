/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
const test = require('node:test')
const assert = require('node:assert')
const sinon = require('sinon')
const proxyquire = require('proxyquire')
const loggerMock = require('../mocks/logger')()
const API = proxyquire('../../../api', {
  './lib/logger': {
    child: sinon.stub().callsFake(() => loggerMock)
  }
})
const helper = require('../../lib/agent_helper')
const shimmer = require('../../../lib/shimmer')

test('Agent API - subscribeTo', async (t) => {
  t.beforeEach((ctx) => {
    ctx.nr = {}
    loggerMock.warn.reset()
    const agent = helper.loadMockedAgent()
    ctx.nr.api = new API(agent)
    ctx.nr.agent = agent

    sinon.stub(shimmer, 'setupCustomSubscriber')
  })

  t.afterEach((ctx) => {
    helper.unloadAgent(ctx.nr.agent)
    shimmer.setupCustomSubscriber.restore()
  })

  await t.test('exports a function for subscribing to custom instrumentation', (t, end) => {
    const { api } = t.nr
    assert.ok(api.subscribeTo)
    assert.equal(typeof api.subscribeTo, 'function')

    end()
  })

  function getValidConfig(moduleName) {
    return {
      instrumentations: [
        {
          module: { name: moduleName, versionRange: '>=1.0.0', filePath: 'index.js' },
          functionQuery: { methodName: 'foo', kind: 'Sync' },
          events: ['end'],
          handlers: { end: () => {} }
        }
      ]
    }
  }

  await t.test('should call shimmer.setupCustomSubscriber with the agent and given args', (t, end) => {
    const { api, agent } = t.nr
    const moduleName = 'my-lib'
    const config = getValidConfig(moduleName)

    api.subscribeTo(moduleName, config)

    assert.ok(shimmer.setupCustomSubscriber.calledOnce)
    const args = shimmer.setupCustomSubscriber.getCall(0).args
    assert.equal(args[0], agent)
    assert.equal(args[1], moduleName)
    assert.equal(args[2], config)

    end()
  })

  await t.test('should not subscribe when an instrumentation entry is missing events or handlers', (t, end) => {
    const { api } = t.nr
    const config = {
      instrumentations: [
        {
          module: { name: 'my-lib', versionRange: '>=1.0.0', filePath: 'index.js' },
          functionQuery: { methodName: 'foo', kind: 'Sync' }
        }
      ]
    }

    api.subscribeTo('my-lib', config)

    assert.ok(shimmer.setupCustomSubscriber.notCalled)

    end()
  })

  const invalidCases = [
    {
      name: 'missing module.name',
      instrumentation: {
        module: { versionRange: '>=1.0.0', filePath: 'index.js' },
        functionQuery: { methodName: 'foo', kind: 'Sync' },
        events: ['end'],
        handlers: { end: () => {} }
      },
      reason: 'instrumentations[0].module.name must be a string'
    },
    {
      name: 'missing module.filePath',
      instrumentation: {
        module: { name: 'my-lib', versionRange: '>=1.0.0' },
        functionQuery: { methodName: 'foo', kind: 'Sync' },
        events: ['end'],
        handlers: { end: () => {} }
      },
      reason: 'instrumentations[0].module.filePath must be a string'
    },
    {
      name: 'missing module.versionRange',
      instrumentation: {
        module: { name: 'my-lib', filePath: 'index.js' },
        functionQuery: { methodName: 'foo', kind: 'Sync' },
        events: ['end'],
        handlers: { end: () => {} }
      },
      reason: 'instrumentations[0].module.versionRange must be a string'
    },
    {
      name: 'functionQuery with no identifying field',
      instrumentation: {
        module: { name: 'my-lib', versionRange: '>=1.0.0', filePath: 'index.js' },
        functionQuery: { kind: 'Sync' },
        events: ['end'],
        handlers: { end: () => {} }
      },
      reason: 'instrumentations[0].functionQuery needs one of methodName/privateMethodName/functionName/expressionName'
    },
    {
      name: 'typo\'d functionQuery.kind',
      instrumentation: {
        module: { name: 'my-lib', versionRange: '>=1.0.0', filePath: 'index.js' },
        functionQuery: { methodName: 'foo', kind: 'Ssync' },
        events: ['end'],
        handlers: { end: () => {} }
      },
      reason: "instrumentations[0].functionQuery.kind must be one of Sync/Async/Auto/Callback, got 'Ssync'"
    },
    {
      name: 'typo\'d event name',
      instrumentation: {
        module: { name: 'my-lib', versionRange: '>=1.0.0', filePath: 'index.js' },
        functionQuery: { methodName: 'foo', kind: 'Sync' },
        events: ['edn'],
        handlers: { edn: () => {} }
      },
      reason: "instrumentations[0].events contains unknown event 'edn' - must be one of asyncEnd/asyncStart/end/error"
    },
    {
      name: 'event listed but handler missing',
      instrumentation: {
        module: { name: 'my-lib', versionRange: '>=1.0.0', filePath: 'index.js' },
        functionQuery: { methodName: 'foo', kind: 'Sync' },
        events: ['end'],
        handlers: {}
      },
      reason: 'instrumentations[0].handlers.end must be a function (listed in events but missing/not a function)'
    },
    {
      name: 'handlers key typo\'d off of "handler" (e.g. "hander")',
      instrumentation: {
        module: { name: 'my-lib', versionRange: '>=1.0.0', filePath: 'index.js' },
        functionQuery: { methodName: 'foo', kind: 'Sync' },
        events: ['end'],
        handlers: { hander: () => {}, end: () => {} }
      },
      reason: "instrumentations[0].handlers.hander is not listed in events - either add 'hander' to events, or remove this handler (possible typo?)"
    },
    {
      name: 'stray handlers key never added to events (e.g. "ned" instead of "end")',
      instrumentation: {
        module: { name: 'my-lib', versionRange: '>=1.0.0', filePath: 'index.js' },
        functionQuery: { methodName: 'foo', kind: 'Sync' },
        events: [],
        handlers: { ned: () => {} }
      },
      reason: "instrumentations[0].handlers.ned is not listed in events - either add 'ned' to events, or remove this handler (possible typo?)"
    },
    {
      name: 'handlers.handler present but not a function',
      instrumentation: {
        module: { name: 'my-lib', versionRange: '>=1.0.0', filePath: 'index.js' },
        functionQuery: { methodName: 'foo', kind: 'Sync' },
        events: [],
        handlers: { handler: 'not a function' }
      },
      reason: 'instrumentations[0].handlers.handler must be a function'
    }
  ]

  for (const { name, instrumentation, reason } of invalidCases) {
    await t.test(`should not subscribe and should warn with a specific reason for ${name}`, (t, end) => {
      const { api } = t.nr
      const config = { instrumentations: [instrumentation] }

      api.subscribeTo('my-lib', config)

      assert.ok(shimmer.setupCustomSubscriber.notCalled)
      assert.ok(loggerMock.warn.calledWith(`subscribeTo('my-lib'): ${reason}. Not subscribing.`))

      end()
    })
  }
})
