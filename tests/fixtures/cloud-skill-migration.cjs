'use strict'
const { app } = require('electron'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { StableStore } = require('../../desktop/services/store.cjs'), { CloudSkills } = require('../../desktop/services/cloud-skills.cjs'), { digest } = require('../../desktop/services/skill-package.cjs')
const output = path.resolve(__dirname, '../../qa-artifacts/cloud-skills'); fs.mkdirSync(output, { recursive: true })
const root = fs.mkdtempSync(path.join(output, 'migration-')); app.setPath('userData', path.join(root, 'electron')); app.disableHardwareAcceleration()
let store
app.whenReady().then(async () => {
  store = new StableStore(root)
  const source = path.join(root, 'legacy'), content = '# Worker migration fixture'; fs.mkdirSync(source); fs.writeFileSync(path.join(source, 'SKILL.md'), content)
  const packageId = 'a'.repeat(64), item = { id: 'worker-fixture', kind: 'skill', name: 'Fixture', directory: '', packageId }
  const catalog = { items: [item], packages: { [packageId]: { sha256: packageId, bytes: 1, files: { 'SKILL.md': digest(content) } } } }
  store.upsertSkill({ id: item.id, name: 'Fixture', description: '', path: source, content })
  let ticks = 0; const timer = setInterval(() => ticks++, 1)
  const result = await new CloudSkills({ store, root, catalog }).migrateLocalInBackground(); clearInterval(timer)
  assert.equal(result.migrated, 1); assert.equal(result.conflicts.length, 0); assert(ticks > 0)
  assert.equal(fs.readFileSync(path.join(store.listSkills()[0].path, 'SKILL.md'), 'utf8'), content)
  console.log('CLOUD_SKILL_ELECTRON_BACKGROUND_MIGRATION_PASS'); store.close(); store = null; app.exit(0)
}).catch(error => { console.error(error.message); store?.close(); app.exit(1) })
