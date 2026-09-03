'use strict'

const { app } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { createHash, randomUUID } = require('node:crypto')

const qaDirectory = path.join(__dirname, '..', 'qa-artifacts', `cloud-package-${randomUUID()}`)
fs.mkdirSync(qaDirectory, { recursive: true })
app.setPath('userData', qaDirectory)
app.disableHardwareAcceleration()

app.whenReady().then(() => {
  const asar = path.resolve(process.env.STABLE_TEST_ASAR || 'release-0.9.40-proxy.1/win-unpacked/resources/app.asar')
  assert.ok(fs.existsSync(asar))
  const packagedRequire = createRequire(path.join(asar, 'package.json'))
  assert.equal(packagedRequire('./package.json').version, '0.9.40-proxy.1')
  for (const dependency of ['electron-updater', 'jszip', 'mammoth', 'pptxgenjs', 'ws', 'xlsx', 'yaml']) packagedRequire(dependency)
  const services = fs.readdirSync(path.join(asar, 'desktop/services')).filter((name) => name.endsWith('.cjs'))
  for (const service of services) packagedRequire(`./desktop/services/${service}`)
  for (const file of ['desktop/main.cjs', 'desktop/services/cloud-account.cjs', 'desktop/services/cloud-gateway-proxy.cjs', 'desktop/services/cloud-transport.cjs']) {
    const hash = (value) => createHash('sha256').update(value).digest('hex')
    assert.equal(hash(fs.readFileSync(path.join(asar, file))), hash(fs.readFileSync(path.join(__dirname, '..', file))))
  }
  const result = { version: '0.9.40-proxy.1', dependencies: 7, services: services.length, sourceHashesMatch: true }
  fs.writeFileSync(path.join(qaDirectory, 'result.json'), JSON.stringify(result, null, 2))
  process.stdout.write(`CLOUD_PACKAGED_DEPS_OK ${JSON.stringify(result)}\n`)
  app.exit(0)
}).catch((error) => { process.stderr.write(`${error.stack}\n`); app.exit(1) })
