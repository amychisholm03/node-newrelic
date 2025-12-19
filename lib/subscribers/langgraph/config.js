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

module.exports = {
  '@langchain/langgraph': [
    toolNodeRun
  ]
}
