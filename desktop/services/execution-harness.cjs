'use strict'

const { HarnessRunner: DeepSeekHarnessRunner } = require('./harness.cjs')
const { CodexHarnessRunner } = require('./codex-harness.cjs')

// A rollback must be explicit: a failed Codex task must never silently execute
// a second time through a different engine.
class HarnessRunner {
  constructor(options) {
    return process.env.STABLE_HARNESS === 'deepseek'
      ? new DeepSeekHarnessRunner(options)
      : new CodexHarnessRunner(options)
  }
}
module.exports = { HarnessRunner }
