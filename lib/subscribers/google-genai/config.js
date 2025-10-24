/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const generateContentInternal = {
  path: './google-genai/generate-content-internal.js',
  instrumentations: [
    {
      channelName: 'nr_generateContentInternal',
      module: { name: '@google/genai', versionRange: '>=1.1.0 <1.5.0 || >=1.5.1', filePath: 'dist/node/index.cjs' },
      functionQuery: {
        className: 'Models',
        methodName: 'generateContentInternal',
        kind: 'Async'
      }
    },
    {
      channelName: 'nr_generateContentInternal',
      module: { name: '@google/genai', versionRange: '>=1.1.0 <1.5.0 || >=1.5.1', filePath: 'dist/node/index.mjs' },
      functionQuery: {
        className: 'Models',
        methodName: 'generateContentInternal',
        kind: 'Async'
      }
    }
  ]
}

module.exports = {
  '@google/genai': [generateContentInternal]
}
