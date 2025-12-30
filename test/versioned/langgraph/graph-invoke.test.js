/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const test = require('node:test')
const assert = require('node:assert')

const { removeModules } = require('../../lib/cache-buster')
const { assertSegments, match } = require('../../lib/custom-assertions')
const { version: pkgVersion } = require('@langchain/langgraph/package.json')
const helper = require('../../lib/agent_helper')

const config = {
  ai_monitoring: {
    enabled: true
  }
}
const { DESTINATIONS } = require('../../../lib/config/attribute-filter')

test.beforeEach((ctx) => {
  ctx.nr = {}
  ctx.nr.agent = helper.instrumentMockedAgent(config)
})

test.afterEach((ctx) => {
  helper.unloadAgent(ctx.nr.agent)
  // bust the require-cache so it can re-instrument
  removeModules(['@langchain/langgraph'])
})

test('should create span on successful graph invoke', (t, end) => {
  const { agent } = t.nr
  const { StateGraph, START, END, Annotation } = require('@langchain/langgraph')

  helper.runInTransaction(agent, async (tx) => {
    const StateAnnotation = Annotation.Root({
      input: Annotation(),
      results: Annotation()
    })

    const graph = new StateGraph(StateAnnotation)
      .addNode('agent', async (state) => {
        return { results: `processed: ${state.input}` }
      })
      .addEdge(START, 'agent')
      .addEdge('agent', END)

    const app = graph.compile()
    const result = await app.invoke({ input: 'test input' }, { recursionLimit: 25 })
    assert.ok(result)
    assert.equal(result.results, 'processed: test input')
    tx.end()

    assertSegments(tx.trace, tx.trace.root, [
      'Llm/agent/LangGraph/invoke/agent'
    ], {
      exact: false
    })

    end()
  })
})

test('should increment tracking metric for each invoke event', (t, end) => {
  const { agent } = t.nr
  const { StateGraph, START, END } = require('@langchain/langgraph')

  helper.runInTransaction(agent, async (tx) => {
    const StateAnnotation = require('@langchain/langgraph').Annotation.Root({
      input: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y }),
      results: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y })
    })

    const graph = new StateGraph(StateAnnotation)
      .addNode('agent', (state) => {
        return { results: `processed: ${state.input}` }
      })
      .addEdge(START, 'agent')
      .addEdge('agent', END)

    const app = graph.compile()
    await app.invoke({ input: 'test input' })

    const metrics = agent.metrics.getOrCreateMetric(
      `Supportability/Nodejs/ML/LangGraph/${pkgVersion}`
    )
    assert.equal(metrics.callCount > 0, true)

    tx.end()
    end()
  })
})

test('should create LlmAgent event for every graph.invoke', (t, end) => {
  const { agent } = t.nr
  const { StateGraph, START, END } = require('@langchain/langgraph')

  helper.runInTransaction(agent, async (tx) => {
    const StateAnnotation = require('@langchain/langgraph').Annotation.Root({
      input: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y }),
      results: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y })
    })

    const graph = new StateGraph(StateAnnotation)
      .addNode('agent', (state) => {
        return { results: `processed: ${state.input}` }
      })
      .addEdge(START, 'agent')
      .addEdge('agent', END)

    const app = graph.compile()
    await app.invoke({ input: 'test input' })

    const events = agent.customEventAggregator.events.toArray()
    assert.equal(events.length, 1, 'should create a LlmAgent event')

    const [[{ type }, agentEvent]] = events
    assert.equal(type, 'LlmAgent')

    const [segment] = tx.trace.getChildren(tx.trace.root.id)
    match(agentEvent, {
      id: /[a-f0-9]{36}/,
      appName: 'New Relic for Node.js tests',
      span_id: segment.id,
      trace_id: tx.traceId,
      ingest_source: 'Node',
      vendor: 'langgraph',
      name: '__pregel_v2',
      duration: segment.getDurationInMillis(),
      error: false
    })

    tx.end()
    end()
  })
})

test('should create LlmAgent event with custom graph name', (t, end) => {
  const { agent } = t.nr
  const { StateGraph, START, END } = require('@langchain/langgraph')

  helper.runInTransaction(agent, async (tx) => {
    const StateAnnotation = require('@langchain/langgraph').Annotation.Root({
      input: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y }),
      results: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y })
    })

    const graph = new StateGraph(StateAnnotation)
      .addNode('agent', (state) => {
        return { results: `processed: ${state.input}` }
      })
      .addEdge(START, 'agent')
      .addEdge('agent', END)

    const app = graph.compile({ name: 'custom-agent' })
    await app.invoke({ input: 'test input' })

    const events = agent.customEventAggregator.events.toArray()
    assert.equal(events.length, 1, 'should create a LlmAgent event')

    const [[{ type }, agentEvent]] = events
    assert.equal(type, 'LlmAgent')
    assert.equal(agentEvent.name, 'custom-agent')

    assertSegments(tx.trace, tx.trace.root, [
      'Llm/agent/LangGraph/invoke/custom-agent'
    ], {
      exact: false
    })

    tx.end()
    end()
  })
})

test('should not create llm agent events when not in a transaction', async (t) => {
  const { agent } = t.nr
  const { StateGraph, START, END } = require('@langchain/langgraph')

  const StateAnnotation = require('@langchain/langgraph').Annotation.Root({
    input: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y }),
    results: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y })
  })

  const graph = new StateGraph(StateAnnotation)
    .addNode('agent', (state) => {
      return { results: `processed: ${state.input}` }
    })
    .addEdge(START, 'agent')
    .addEdge('agent', END)

  const app = graph.compile()
  await app.invoke({ input: 'test input' })

  const events = agent.customEventAggregator.events.toArray()
  assert.equal(events.length, 0, 'should not create llm events')
})

test('should add llm attribute to transaction', (t, end) => {
  const { agent } = t.nr
  const { StateGraph, START, END } = require('@langchain/langgraph')

  helper.runInTransaction(agent, async (tx) => {
    const StateAnnotation = require('@langchain/langgraph').Annotation.Root({
      input: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y }),
      results: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y })
    })

    const graph = new StateGraph(StateAnnotation)
      .addNode('agent', (state) => {
        return { results: `processed: ${state.input}` }
      })
      .addEdge(START, 'agent')
      .addEdge('agent', END)

    const app = graph.compile()
    await app.invoke({ input: 'test input' })

    const attributes = tx.trace.attributes.get(DESTINATIONS.TRANS_EVENT)
    assert.equal(attributes.llm, true)

    tx.end()
    end()
  })
})

test('should capture error events', (t, end) => {
  const { agent } = t.nr
  const { StateGraph, START, END } = require('@langchain/langgraph')

  helper.runInTransaction(agent, async (tx) => {
    const StateAnnotation = require('@langchain/langgraph').Annotation.Root({
      input: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y }),
      results: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y })
    })

    const graph = new StateGraph(StateAnnotation)
      .addNode('agent', () => {
        throw new Error('Test error')
      })
      .addEdge(START, 'agent')
      .addEdge('agent', END)

    const app = graph.compile()

    try {
      await app.invoke({ input: 'test input' })
    } catch (error) {
      assert.ok(error)
      assert.equal(error.message, 'Test error')
    }

    const events = agent.customEventAggregator.events.toArray()
    assert.equal(events.length, 1)
    const agentEvent = events.find((e) => e[0].type === 'LlmAgent')?.[1]
    assert.equal(agentEvent.error, true)

    const exceptions = tx.exceptions
    assert.equal(exceptions.length, 1)
    const str = Object.prototype.toString.call(exceptions[0].customAttributes)
    assert.equal(str, '[object LlmErrorMessage]')

    tx.end()
    end()
  })
})

test('should not create llm agent events when ai_monitoring is disabled', (t, end) => {
  const { agent } = t.nr
  const { StateGraph, START, END } = require('@langchain/langgraph')
  agent.config.ai_monitoring.enabled = false

  helper.runInTransaction(agent, async (tx) => {
    const StateAnnotation = require('@langchain/langgraph').Annotation.Root({
      input: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y }),
      results: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y })
    })

    const graph = new StateGraph(StateAnnotation)
      .addNode('agent', (state) => {
        return { results: `processed: ${state.input}` }
      })
      .addEdge(START, 'agent')
      .addEdge('agent', END)

    const app = graph.compile()
    await app.invoke({ input: 'test input' })

    const events = agent.customEventAggregator.events.toArray()
    assert.equal(events.length, 0, 'should not create llm events when ai_monitoring is disabled')

    tx.end()
    end()
  })
})

test('should not create segment when ai_monitoring is disabled', (t, end) => {
  const { agent } = t.nr
  const { StateGraph, START, END } = require('@langchain/langgraph')
  agent.config.ai_monitoring.enabled = false

  helper.runInTransaction(agent, async (tx) => {
    const StateAnnotation = require('@langchain/langgraph').Annotation.Root({
      input: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y }),
      results: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y })
    })

    const graph = new StateGraph(StateAnnotation)
      .addNode('agent', (state) => {
        return { results: `processed: ${state.input}` }
      })
      .addEdge(START, 'agent')
      .addEdge('agent', END)

    const app = graph.compile()
    await app.invoke({ input: 'test input' })

    const segments = tx.trace.getChildren(tx.trace.root.id)
    assert.equal(segments.length, 0, 'should not create segment when ai_monitoring is disabled')

    tx.end()
    end()
  })
})

test('should handle graph with multiple nodes', (t, end) => {
  const { agent } = t.nr
  const { StateGraph, START, END } = require('@langchain/langgraph')

  helper.runInTransaction(agent, async (tx) => {
    const StateAnnotation = require('@langchain/langgraph').Annotation.Root({
      input: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y }),
      step1: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y }),
      results: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y })
    })

    const graph = new StateGraph(StateAnnotation)
      .addNode('node1', (state) => {
        return { step1: `step1: ${state.input}` }
      })
      .addNode('node2', (state) => {
        return { results: `step2: ${state.step1}` }
      })
      .addEdge(START, 'node1')
      .addEdge('node1', 'node2')
      .addEdge('node2', END)

    const app = graph.compile()
    const result = await app.invoke({ input: 'multi-step' })

    assert.ok(result)
    assert.equal(result.results, 'step2: step1: multi-step')

    const events = agent.customEventAggregator.events.toArray()
    assert.equal(events.length, 1, 'should create exactly one LlmAgent event for the graph')

    const [[{ type }, agentEvent]] = events
    assert.equal(type, 'LlmAgent')
    assert.equal(agentEvent.name, '__pregel_v2')
    assert.equal(agentEvent.error, false)

    tx.end()
    end()
  })
})

test('should handle conditional edges in graph', (t, end) => {
  const { agent } = t.nr
  const { StateGraph, START, END } = require('@langchain/langgraph')

  helper.runInTransaction(agent, async (tx) => {
    const StateAnnotation = require('@langchain/langgraph').Annotation.Root({
      input: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y }),
      results: require('@langchain/langgraph').Annotation({ reducer: (x, y) => x ?? y })
    })

    const graph = new StateGraph(StateAnnotation)
      .addNode('router', (state) => {
        return { results: state.input === 'route-a' ? 'took-a' : 'took-b' }
      })
      .addNode('nodeA', () => {
        return { results: 'processed-A' }
      })
      .addNode('nodeB', () => {
        return { results: 'processed-B' }
      })
      .addEdge(START, 'router')
      .addConditionalEdges('router', (state) => (
        state.results === 'took-a' ? 'nodeA' : 'nodeB'
      ))
      .addEdge('nodeA', END)
      .addEdge('nodeB', END)

    const app = graph.compile()
    const result = await app.invoke({ input: 'route-a' })

    assert.ok(result)
    assert.equal(result.results, 'processed-A')

    const events = agent.customEventAggregator.events.toArray()
    assert.equal(events.length, 1, 'should create one LlmAgent event')

    tx.end()
    end()
  })
})
