/*
 * Copyright 2026 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const LlmErrorMessage = require('../error-message')

/**
 * Google GenAI (Gemini)-specific LLM error message.
 * For `@google/genai`, `cause` does not have the `error` or `status` fields,
 * but it does have `message` with the info we need. Parses the relevant fields
 * from `cause.message` to get `status` and `error`.
 *
 * @augments LlmErrorMessage
 */
module.exports = class GoogleGenAiLlmErrorMessage extends LlmErrorMessage {
  constructor(params = {}) {
    super(params)

    const cause = params.cause
    if (cause?.message) {
      try {
        const jsonStartIndex = cause.message.indexOf('{')
        const jsonString = cause.message.substring(jsonStartIndex)
        const parsedError = JSON.parse(jsonString)?.error

        this['http.statusCode'] = parsedError?.code
        this['error.code'] = parsedError?.code
      } catch { }
    }
  }
}
