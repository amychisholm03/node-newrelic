/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const graphInvoke = {
  // Pregel.invoke (Pregel is the base class of the various StateGraph classes in LangGraph)
  path: './langgraph/graphInvoke.js',
  instrumentations: [
    // CommonJs
    {
      channelName: 'nr_invoke',
      module: { name: '@langchain/langgraph', versionRange: '^0.0.0', filePath: 'dist/pregel/index.cjs' },
      functionQuery: {
        methodName: 'invoke',
        kind: 'Async',
        className: 'Pregel'
      }
    },
    // ESM
    {
      channelName: 'nr_invoke',
      module: { name: '@langchain/langgraph', versionRange: '^0.0.0', filePath: 'dist/pregel/index.js' },
      functionQuery: {
        methodName: 'invoke',
        kind: 'Async',
        className: 'Pregel'
      }
    },
    // CommonJs
    {
      channelName: 'nr_invoke',
      module: { name: '@langchain/langgraph', versionRange: '>=1.0.0', filePath: 'dist/pregel/index.cjs' },
      functionQuery: {
        methodName: 'invoke',
        kind: 'Async'
      }
    },
    // ESM
    {
      channelName: 'nr_invoke',
      module: { name: '@langchain/langgraph', versionRange: '>=1.0.0', filePath: 'dist/pregel/index.js' },
      functionQuery: {
        methodName: 'invoke',
        kind: 'Async'
      }
    },
  ]
}

const graphStream = {
  // Pregel.stream (Pregel is the base class of the various StateGraph classes in LangGraph)
  path: './langgraph/graphStream.js',
  instrumentations: [
    // CommonJs
    {
      channelName: 'nr_stream',
      module: { name: '@langchain/langgraph', versionRange: '^0.0.0', filePath: 'dist/pregel/index.cjs' },
      functionQuery: {
        methodName: 'stream',
        kind: 'Async',
        className: 'Pregel'
      }
    },
    // ESM
    {
      channelName: 'nr_stream',
      module: { name: '@langchain/langgraph', versionRange: '^0.0.0', filePath: 'dist/pregel/index.js' },
      functionQuery: {
        methodName: 'stream',
        kind: 'Async',
        className: 'Pregel'
      }
    },
    // CommonJs
    {
      channelName: 'nr_stream',
      module: { name: '@langchain/langgraph', versionRange: '>=1.0.0', filePath: 'dist/pregel/index.cjs' },
      functionQuery: {
        methodName: 'stream',
        kind: 'Async'
      }
    },
    // ESM
    {
      channelName: 'nr_stream',
      module: { name: '@langchain/langgraph', versionRange: '>=1.0.0', filePath: 'dist/pregel/index.js' },
      functionQuery: {
        methodName: 'stream',
        kind: 'Async'
      }
    },
  ]
}

module.exports = {
  '@langchain/langgraph': [
    graphInvoke,
    graphStream
  ]
}
