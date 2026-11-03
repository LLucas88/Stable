'use strict'
// Filesystem work only. The main thread owns the real database and checks for concurrent edits.
const { parentPort, workerData } = require('node:worker_threads')
const { CloudSkills } = require('./cloud-skills.cjs')
const updates = new Map()
let meta = workerData.meta
const store = {
  listSkills: () => workerData.records,
  getSetting: () => meta,
  setSetting: (_key, value) => { meta = value },
  upsertSkill: record => updates.set(record.id, record),
  db: { exec: () => {} },
}
const result = new CloudSkills({ store, root: workerData.root, catalog: workerData.catalog }).migrateLocal()
parentPort.postMessage({ result, updates: [...updates.values()], meta })
