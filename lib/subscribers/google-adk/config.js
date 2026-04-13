/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// @google/adk bundles everything into a single index.js file.
// Class names are minified, so we use index-based matching.
// BaseAgent.runAsync is the first `runAsync` method in the bundle (index 0).
const agentRunAsync = {
  path: './google-adk/agent-run-async.js',
  instrumentations: [
    // CommonJS
    {
      channelName: 'nr_runAsync',
      module: { name: '@google/adk', versionRange: '>=0.1.0', filePath: 'dist/cjs/index.js' },
      functionQuery: {
        index: 0,
        methodName: 'runAsync',
        kind: 'Async'
      }
    },
    // ESM
    {
      channelName: 'nr_runAsync',
      module: { name: '@google/adk', versionRange: '>=0.1.0', filePath: 'dist/esm/index.js' },
      functionQuery: {
        index: 0,
        methodName: 'runAsync',
        kind: 'Async'
      }
    }
  ]
}

// FunctionTool.runAsync is the second `runAsync` method in the bundle (index 1).
const toolRunAsync = {
  path: './google-adk/tool-run-async.js',
  instrumentations: [
    // CommonJS
    {
      channelName: 'nr_toolRunAsync',
      module: { name: '@google/adk', versionRange: '>=0.1.0', filePath: 'dist/cjs/index.js' },
      functionQuery: {
        index: 1,
        methodName: 'runAsync',
        kind: 'Async'
      }
    },
    // ESM
    {
      channelName: 'nr_toolRunAsync',
      module: { name: '@google/adk', versionRange: '>=0.1.0', filePath: 'dist/esm/index.js' },
      functionQuery: {
        index: 1,
        methodName: 'runAsync',
        kind: 'Async'
      }
    }
  ]
}

module.exports = {
  '@google/adk': [
    agentRunAsync,
    toolRunAsync
  ]
}
