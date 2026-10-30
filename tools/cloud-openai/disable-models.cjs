'use strict'
// Rollback admission gate only: preserve prices, requests, account balances and history.
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[2])
try {
  db.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE')
  const update = db.prepare("UPDATE models SET status='disabled', updated_at=? WHERE id=? AND provider='openai'")
  for (const id of ['gpt-6.1-sol','gpt-6.1-terra','gpt-image-2.5-sunburst','gpt-image-2.5-flare']) update.run(Date.now(), id)
  db.exec('COMMIT')
  console.log('OPENAI_ADMISSION_DISABLED=OK')
} finally { if (db.isTransaction) db.exec('ROLLBACK'); db.close() }
