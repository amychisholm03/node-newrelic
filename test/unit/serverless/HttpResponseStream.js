/*
 * Copyright 2025 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

// a basic version of AWS's response stream for Lambda, for testing
// see https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/blob/main/src/HttpResponseStream.js 
class HttpResponseStream {
  static from(underlyingStream, prelude) {
    underlyingStream.setContentType('application/vnd.awslambda.http-integration-response')

    const metadataPrelude = JSON.stringify(prelude)
    underlyingStream._onBeforeFirstWrite = (write) => {
      write(metadataPrelude)
      write(new Uint8Array(0))
    }
    return underlyingStream
  }
}

module.exports = { HttpResponseStream }
