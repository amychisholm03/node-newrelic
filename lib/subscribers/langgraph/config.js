/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const toolNodeRun = {
  // ToolNode.run
  path: './langgraph/toolNodeRun.js',
  instrumentations: [
    // CommonJs
    {
      channelName: 'nr_run',
      module: { name: '@langchain/langgraph', versionRange: '>=0.0.0', filePath: 'dist/prebuilt/tool_node.cjs' },
      functionQuery: {
        methodName: 'run',
        kind: 'Async',
        className: 'ToolNode'
      }
    },
    // ESM
    {
      channelName: 'nr_run',
      module: { name: '@langchain/langgraph', versionRange: '>=0.0.0', filePath: 'dist/prebuilt/tool_node.js' },
      functionQuery: {
        methodName: 'run',
        kind: 'Async',
        className: 'ToolNode'
      }
    },
  ]
}

const graphInvoke = {
  // Pregel.invoke (Pregel is the base class of the various Graph classes in LangGraph)
  path: './langgraph/graphInvoke.js',
  instrumentations: [
    // CommonJs
    {
      channelName: 'nr_invoke',
      module: { name: '@langchain/langgraph', versionRange: '>=0.0.0', filePath: 'dist/pregel/index.cjs' },
      functionQuery: {
        methodName: 'invoke',
        kind: 'Async',
        className: 'Pregel'
      }
    },
    // ESM
    {
      channelName: 'nr_invoke',
      module: { name: '@langchain/langgraph', versionRange: '>=0.0.0', filePath: 'dist/pregel/index.js' },
      functionQuery: {
        methodName: 'invoke',
        kind: 'Async',
        className: 'Pregel'
      }
    },
  ]
}

module.exports = {
  '@langchain/langgraph': [
    toolNodeRun,
    graphInvoke
  ]
}
