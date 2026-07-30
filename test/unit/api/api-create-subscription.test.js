/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
const test = require('node:test')
const assert = require('node:assert')
const API = require('../../../api')
const helper = require('../../lib/agent_helper')
const Subscription = require('../../../lib/subscribers/subscription.js')

test('Agent API - createSubscription', async (t) => {
  t.beforeEach((ctx) => {
    ctx.nr = {}
    const agent = helper.loadMockedAgent()
    ctx.nr.api = new API(agent)
    ctx.nr.agent = agent
  })

  t.afterEach((ctx) => {
    helper.unloadAgent(ctx.nr.agent)
  })

  await t.test('exports a function for creating a subscription', (t, end) => {
    const { api } = t.nr
    assert.ok(api.createSubscription)
    assert.equal(typeof api.createSubscription, 'function')

    end()
  })

  await t.test('should return a Subscription instance for the given agent and moduleName', (t, end) => {
    const { api, agent } = t.nr

    const subscription = api.createSubscription('my-lib')

    assert.ok(subscription instanceof Subscription)
    assert.equal(subscription.agent, agent)
    assert.equal(subscription.moduleName, 'my-lib')

    end()
  })

  await t.test('should throw, not warn-and-return, for a bad moduleName', (t, end) => {
    const { api } = t.nr

    assert.throws(() => api.createSubscription(123), TypeError)
    assert.throws(() => api.createSubscription(), TypeError)

    end()
  })
})
