/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const test = require('node:test')
const assert = require('node:assert')
const GoogleAdkLlmTool = require('#agentlib/llm-events/google-adk/tool.js')

test.beforeEach((ctx) => {
  ctx.nr = {}
  ctx.nr.agent = {
    config: {
      ai_monitoring: {
        record_content: {
          enabled: true
        }
      }
    },
    tracer: {
      getTransaction() {
        return ctx.nr.transaction
      }
    }
  }

  ctx.nr.transaction = {
    traceId: 'trace-1',
    trace: {
      custom: {
        get() {
          return {
            'llm.conversation_id': 'test-conversation'
          }
        }
      }
    }
  }

  ctx.nr.segment = {
    id: 'segment-1'
  }

  ctx.nr.toolName = 'get_weather'
  ctx.nr.aiAgentName = 'test-agent'
  ctx.nr.runId = 'call-123'
  ctx.nr.input = '{"location": "NYC"}'
  ctx.nr.output = '{"temp": "72F"}'
})

test('constructs default instance', async (t) => {
  const event = new GoogleAdkLlmTool(t.nr)
  assert.equal(event.name, 'get_weather')
  assert.equal(event.agent_name, 'test-agent')
  assert.equal(event.run_id, 'call-123')
  assert.equal(event.input, '{"location": "NYC"}')
  assert.equal(event.output, '{"temp": "72F"}')
  assert.match(event.id, /[a-z0-9-]{32}/)
  assert.equal(event.span_id, 'segment-1')
  assert.equal(event.trace_id, 'trace-1')
  assert.equal(event.ingest_source, 'Node')
  assert.equal(event.vendor, 'google_adk')
})

test('respects record_content setting', async (t) => {
  t.nr.agent.config.ai_monitoring.record_content.enabled = false
  const event = new GoogleAdkLlmTool(t.nr)
  assert.equal(event.input, undefined)
  assert.equal(event.output, undefined)
})

test('constructs instance with error', async (t) => {
  t.nr.error = true
  const event = new GoogleAdkLlmTool(t.nr)
  assert.equal(event.error, true)
})

test('sets description when provided', async (t) => {
  t.nr.description = 'Gets the current weather'
  const event = new GoogleAdkLlmTool(t.nr)
  assert.equal(event.description, 'Gets the current weather')
})

test('sets toolType when provided', async (t) => {
  t.nr.toolType = 'FunctionTool'
  const event = new GoogleAdkLlmTool(t.nr)
  assert.equal(event.type, 'FunctionTool')
})

test('omits description and type when not provided', async (t) => {
  const event = new GoogleAdkLlmTool(t.nr)
  assert.equal(event.description, undefined)
  assert.equal(event.type, undefined)
})
