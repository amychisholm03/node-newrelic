/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
const { RecorderSpec } = require('../../../shim/specs')
const { MCP } = require('../../../metrics/names')

module.exports = function initialize(shim, client) {
  const proto = client?.Client?.prototype
  if (!proto) {
    shim.logger.debug('@modelcontextprotocol/sdk client not found, skipping instrumentation')
    return
  }

  shim.record(proto, 'callTool', function wrapCallTool(shim, callTool, fnName, args) {
    const toolName = args?.[0]?.name
    return new RecorderSpec({
      name: `${MCP.TOOL}/callTool/${toolName}`,
      promise: true,
      after({ segment }) {
        segment.end()
      }
    })
  }
  )

  shim.record(proto, 'readResource', function wrapReadResource(shim, readResource, fnName, args) {
    const uri = args?.[0]?.uri
    return new RecorderSpec({
      name: `${MCP.RESOURCE}/readResource/${uri}`,
      promise: true,
      after({ segment }) {
        segment.end()
      }
    })
  })

  shim.record(proto, 'getPrompt', function wrapGetPrompt(shim, getPrompt, fnName, args) {
    const promptName = args?.[0]?.name
    return new RecorderSpec({
      name: `${MCP.PROMPT}/getPrompt/${promptName}`,
      promise: true,
      after({ segment }) {
        segment.end()
      }
    })
  })
}
