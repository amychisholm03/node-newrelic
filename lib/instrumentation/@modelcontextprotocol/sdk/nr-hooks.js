/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'
const clientInstrumentation = require('./client')
const InstrumentationDescriptor = require('../../../instrumentation-descriptor')

module.exports = [
  {
    type: InstrumentationDescriptor.TYPE_GENERIC,
    moduleName: '@modelcontextprotocol/sdk/client/index.js',
    onRequire: clientInstrumentation
  },
]
