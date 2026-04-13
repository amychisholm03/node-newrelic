/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const test = require('node:test')
const assert = require('node:assert')

const { removeModules } = require('../../lib/cache-buster')
const { assertSegments } = require('../../lib/custom-assertions')
const helper = require('../../lib/agent_helper')
const { DESTINATIONS } = require('../../../lib/config/attribute-filter')

const config = {
  ai_monitoring: {
    enabled: true,
    streaming: {
      enabled: true
    }
  }
}

test.beforeEach(async (ctx) => {
  ctx.nr = {}
  ctx.nr.agent = helper.instrumentMockedAgent(config)

  const { FunctionTool } = require('@google/adk')
  ctx.nr.FunctionTool = FunctionTool

  ctx.nr.adkVersion = helper.readPackageVersion(__dirname, '@google/adk')
})

test.afterEach((ctx) => {
  helper.unloadAgent(ctx.nr.agent)
  removeModules(['@google/adk'])
})

test('should create LlmTool event for FunctionTool.runAsync', async (t) => {
  const { agent, FunctionTool } = t.nr

  const tool = new FunctionTool({
    name: 'get_weather',
    description: 'Gets the weather for a location',
    execute: async (args) => {
      return { temperature: '72F', unit: 'fahrenheit' }
    }
  })

  await helper.runInTransaction(agent, async (tx) => {
    const result = await tool.runAsync({
      args: { location: 'San Francisco' },
      toolContext: { actions: {}, state: { toRecord: () => { return {} } } }
    })

    assert.deepStrictEqual(result, { temperature: '72F', unit: 'fahrenheit' })

    const events = agent.customEventAggregator.events.toArray()
    const toolEvents = events.filter((e) => e[0].type === 'LlmTool')
    assert.equal(toolEvents.length, 1, 'should have exactly 1 LlmTool event')

    const [[{ type }, toolEvent]] = toolEvents
    assert.equal(type, 'LlmTool')
    assert.equal(toolEvent.name, 'get_weather')
    assert.equal(toolEvent.vendor, 'google_adk')
    assert.equal(toolEvent.input, '{"location":"San Francisco"}')
    assert.equal(toolEvent.output, '{"temperature":"72F","unit":"fahrenheit"}')

    tx.end()
  })
})

test('should create span with APM-AI_TOOL subcomponent', async (t) => {
  const { agent, FunctionTool } = t.nr

  const tool = new FunctionTool({
    name: 'search_docs',
    description: 'Searches documents',
    execute: async () => { return { results: [] } }
  })

  await helper.runInTransaction(agent, async (tx) => {
    await tool.runAsync({
      args: { query: 'test' },
      toolContext: { actions: {}, state: { toRecord: () => { return {} } } }
    })

    assertSegments(tx.trace, tx.trace.root, ['Llm/tool/ADK/runAsync/search_docs'], {
      exact: false
    })

    const [segment] = tx.trace.getChildren(tx.trace.root.id)
    const attribute = segment?.attributes?.attributes?.subcomponent
    assert.equal(attribute?.value, '{"type": "APM-AI_TOOL", "name": "search_docs"}')

    tx.end()
  })
})

test('should add llm attribute to transaction', async (t) => {
  const { agent, FunctionTool } = t.nr

  const tool = new FunctionTool({
    name: 'test_tool',
    description: 'A test tool',
    execute: async () => 'done'
  })

  await helper.runInTransaction(agent, async (tx) => {
    await tool.runAsync({
      args: {},
      toolContext: { actions: {}, state: { toRecord: () => { return {} } } }
    })

    const attributes = tx.trace.attributes.get(DESTINATIONS.TRANS_EVENT)
    assert.equal(attributes.llm, true)

    tx.end()
  })
})

test('should not create events when ai_monitoring.enabled is false', async (t) => {
  const { agent, FunctionTool } = t.nr

  agent.config.ai_monitoring.enabled = false

  const tool = new FunctionTool({
    name: 'disabled_tool',
    description: 'A disabled tool',
    execute: async () => 'done'
  })

  await helper.runInTransaction(agent, async (tx) => {
    await tool.runAsync({
      args: {},
      toolContext: { actions: {}, state: { toRecord: () => { return {} } } }
    })

    const events = agent.customEventAggregator.events.toArray()
    const toolEvents = events.filter((e) => e[0].type === 'LlmTool')
    assert.equal(toolEvents.length, 0, 'should not create LlmTool events')

    tx.end()
  })
})

test('should not create events when not in a transaction', async (t) => {
  const { agent, FunctionTool } = t.nr

  const tool = new FunctionTool({
    name: 'no_tx_tool',
    description: 'A tool with no transaction',
    execute: async () => 'done'
  })

  await tool.runAsync({
    args: {},
    toolContext: { actions: {}, state: { toRecord: () => { return {} } } }
  })

  const events = agent.customEventAggregator.events.toArray()
  const toolEvents = events.filter((e) => e[0].type === 'LlmTool')
  assert.equal(toolEvents.length, 0, 'should not create LlmTool events')
})

test('should record LLM custom attributes on tool events', async (t) => {
  const { agent, FunctionTool } = t.nr
  const api = helper.getAgentApi()

  const tool = new FunctionTool({
    name: 'attrs_tool',
    description: 'A tool for custom attrs test',
    execute: async () => 'result'
  })

  await helper.runInTransaction(agent, async (tx) => {
    await api.withLlmCustomAttributes({ 'llm.foo': 'bar' }, async () => {
      await tool.runAsync({
        args: {},
        toolContext: { actions: {}, state: { toRecord: () => { return {} } } }
      })
    })

    const events = agent.customEventAggregator.events.toArray()
    const toolEvents = events.filter((e) => e[0].type === 'LlmTool')
    assert.ok(toolEvents.length > 0)

    const [[, toolEvent]] = toolEvents
    assert.equal(toolEvent?.['llm.foo'], 'bar')

    tx.end()
  })
})
