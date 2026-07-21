/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
const test = require('node:test')
const assert = require('node:assert')
const API = require('../../../api')
const helper = require('../../lib/agent_helper')
const sinon = require('sinon')
const shimmer = require('../../../lib/shimmer')

test('Agent API - subscribeTo', async (t) => {
  t.beforeEach((ctx) => {
    ctx.nr = {}
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

  await t.test('should call shimmer.setupCustomSubscriber with the agent and given args', (t, end) => {
    const { api, agent } = t.nr
    const moduleName = 'my-lib'
    const config = { instrumentations: [] }
    const events = []
    const handlers = []

    api.subscribeTo(moduleName, config, events, handlers)

    assert.ok(shimmer.setupCustomSubscriber.calledOnce)
    const args = shimmer.setupCustomSubscriber.getCall(0).args
    assert.equal(args[0], agent)
    assert.equal(args[1], moduleName)
    assert.equal(args[2], config)
    assert.equal(args[3], events)
    assert.equal(args[4], handlers)

    end()
  })
})
