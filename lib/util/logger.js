/*
 * Copyright 2020 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

const stringify = require('json-stringify-safe')
const util = require('util')
const Readable = require('readable-stream')
const os = require('os')

/**
 * A logging utility with methods `info`, `warn`, `error`, `fatal`, `debug`,
 * and `trace`. This logger is very similar to Pino.
 *
 * Each method supports the following invocation signatures:
 *
 * @example
 * // Logs a single string.
 * logger.info('hello world')
 *
 * @example
 * // Logs an interpolated string.
 * logger.info('hello %s', 'world')
 *
 * @example
 * // Logs with data properties inlined:
 * logger.info({a: 1, b: 2}, 'logged data')
 * // e.g. `{ a: 1, b: 2, msg: 'logged data', level: 30 }`
 *
 * @example
 * // Recommended for keeping data usable:
 * logger.info({ data: { the: 'data', that: 'is important' }}, 'some message')
 * // ^ only the `data` key will be inlined at the top level. The sub-properties
 * // will still be nested under the data key.
 *
 * @type {Object}
 */
module.exports = Logger

const LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
}

// The maximum string length in V8 was somewhere around 256M characters for a
// long time. Note that is characters, not bytes. This limit was upped to around
// 1G characters sometime during Node 8's lifetime (before 8.3.0 I believe).
// Using 128M characters as limit to keep the logger well away from the limit
// and not balloon host machine's memory.
const MAX_LOG_BUFFER = 1024 * 1024 * 128 // 128M characters

util.inherits(Logger, Readable)

function Logger(options, extra) {
  if (!(this instanceof Logger)) {
    return new Logger(options, extra)
  }

  Readable.call(this)
  const passedInLevel = this.coerce(options.level)
  this.options = {
    _level: passedInLevel,
    enabled: options.enabled === undefined ? true : options.enabled,
    configured: options.configured === undefined ? true : !!options.configured
  }
  this._nestedLog = false
  this.name = options.name
  this.hostname = options.hostname || os.hostname()
  this.extra = extra || Object.create(null)
  this.buffer = ''
  this.reading = false
  this.logQueue = []
  if (options.stream) {
    this.pipe(options.stream)
  }
}
Logger.MAX_LOG_BUFFER = MAX_LOG_BUFFER

Logger.prototype.configure = function configure(options) {
  if (options.name !== undefined) {
    this.name = options.name
  }

  if (options.enabled !== undefined) {
    this.options.enabled = options.enabled
  }

  if (options.level !== undefined) {
    this.options._level = this.coerce(options.level)
  }

  this.options.configured = true
  this._flushQueuedLogs()
}

Logger.prototype.coerce = function coerce(value) {
  if (!isNaN(parseInt(value, 10)) && isFinite(value)) {
    // value is numeric
    if (value < 10) {
      value = 10
    }
    if (value > 60) {
      value = 60
    }

    return value
  }
  return LEVELS[value] || 50
}

const loggingFunctions = Object.create(null)

Object.keys(LEVELS).forEach(function buildLevel(_level) {
  const level = Logger.prototype.coerce(LEVELS[_level])

  function log(extra) {
    if (!this.options.configured) {
      // queue a log line with level, args passed to logger and their respective extras
      this.logQueue.unshift({ level: _level, args: arguments, extra: this.extra })
      return
    }

    if (!this.options.enabled) {
      return false
    }
    if (level < this.options._level) {
      return false
    }

    const hasExtra = typeof extra === 'object'
    const args = Array.prototype.slice.call(arguments, hasExtra ? 1 : 0)
    return this.write(level, args, hasExtra ? extra : null)
  }

  loggingFunctions[_level] = function checkLevel() {
    log.apply(this, arguments)
  }

  const seenMessages = Object.create(null)
  loggingFunctions[_level + 'Once'] = function logOnce(key) {
    if (typeof key !== 'string') {
      this.debug('Attempted to key on a non-string in ' + _level + 'Once: ' + key)
      return
    }

    if (!this.options.enabled) {
      return false
    }
    if (level < this.options._level) {
      return false
    }

    if (seenMessages[key] !== true) {
      const args = Array.prototype.slice.call(arguments, 1)
      const writeSuccessful = log.apply(this, args)

      if (writeSuccessful) {
        seenMessages[key] = true
      }
    }
  }

  const seenPerInterval = Object.create(null)
  loggingFunctions[_level + 'OncePer'] = function logOncePer(key, interval) {
    if (typeof key !== 'string') {
      this.debug('Attempted to key on a non-string in ' + _level + 'Once: ' + key)
      return
    }

    if (!this.options.enabled) {
      return false
    }
    if (level < this.options._level) {
      return false
    }

    if (seenPerInterval[key] !== true) {
      const args = Array.prototype.slice.call(arguments, 2)
      const writeSuccessful = log.apply(this, args)

      if (writeSuccessful) {
        seenPerInterval[key] = true

        const clearSeen = setTimeout(function clearKey() {
          delete seenPerInterval[key]
        }, interval)

        clearSeen.unref()
      }
    }
  }

  loggingFunctions[_level + 'Enabled'] = function levelEnabled() {
    return level >= this.options._level
  }
})

Logger.prototype._flushQueuedLogs = function _flushQueuedLogs() {
  while (this.logQueue.length) {
    const { level, args, extra } = this.logQueue.shift()
    // log an entry now that the logger has been configured
    this[level](extra, ...args)
  }
}

Object.assign(Logger.prototype, loggingFunctions)

Logger.prototype.child = function child(extra) {
  const childLogger = Object.create(loggingFunctions)

  childLogger.extra = Object.assign(Object.create(null), this.extra, extra)

  const parent = this
  childLogger.logQueue = parent.logQueue
  childLogger.options = parent.options

  childLogger.write = function write(level, args, _extra) {
    _extra = getPropertiesToLog(_extra)
    _extra = Object.assign(Object.create(null), this.extra, _extra)

    return parent.write(level, args, _extra)
  }

  childLogger.setEnabled = Logger.prototype.setEnabled
  childLogger.child = Logger.prototype.child

  return childLogger
}

Logger.prototype.level = function level(lvl) {
  this.options._level = this.coerce(lvl)
}

Logger.prototype.setEnabled = function setEnabled(enabled) {
  if (typeof enabled === 'boolean') {
    this.options.enabled = enabled
  }
}

Logger.prototype._read = function _read() {
  if (this.buffer.length !== 0) {
    this.reading = this.push(this.buffer)
    this.buffer = ''
  } else {
    this.reading = true
  }
}

/**
 * For performance reasons we do not support %j because we will have
 * already converted the objects to strings.
 * Returns a boolean representing the status of the write
 * (success/failure)
 *
 * @param level
 * @param args
 * @param extra
 */
Logger.prototype.write = function write(level, args, extra) {
  if (this._nestedLog) {
    // This log is downstream of another log call and should be ignored
    return
  }
  this._nestedLog = true
  for (let i = 0, l = args.length; i < l; ++i) {
    if (typeof args[i] === 'function') {
      args[i] = args[i].valueOf()
    } else if (typeof args[i] === 'object') {
      try {
        args[i] = stringify(args[i])
      } catch {
        this.debug('Failed to stringfy object for log')
        args[i] = '[UNPARSABLE OBJECT]'
      }
    }
  }

  const entry = new Entry(this, level, util.format.apply(util, args))

  Object.assign(entry, this.extra, getPropertiesToLog(extra))

  let data = ''
  try {
    data = stringify(entry) + '\n'
  } catch {
    this.debug('Unable to stringify log message')
  }

  if (this.reading) {
    this.reading = this.push(data)
  } else if (this.buffer.length + data.length < MAX_LOG_BUFFER) {
    this.buffer += data
  } else if (process.emitWarning) {
    process.emitWarning(
      'Dropping log message, buffer would overflow.',
      'NewRelicWarning',
      'NRWARN001'
    )
  }
  this._nestedLog = false
  return true
}

function Entry(logger, level, msg) {
  this.v = 0
  this.level = level
  this.name = logger.name
  this.hostname = logger.hostname
  this.pid = process.pid
  this.time = new Date().toISOString()
  this.msg = msg
}

function getPropertiesToLog(extra) {
  const obj = Object.assign(Object.create(null), extra)
  // Error properties (message, stack) are not enumerable, so getting them directly
  if (extra instanceof Error) {
    decorateFromErrorInstance(obj, extra)
  } else if (extra?.error != null) {
    obj.error = {}
    decorateFromErrorInstance(obj.error, extra.error)
  }
  return obj
}

function decorateFromErrorInstance(toDecorate, errorInstance) {
  const names = Object.getOwnPropertyNames(errorInstance)
  for (const name of names) {
    toDecorate[name] = errorInstance[name]
  }
}
