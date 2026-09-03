'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, readFileSync } = require('node:fs')
const path = require('node:path')
const {
  WendingCliService,
  WENDING_CLI_PROMPT,
  WENDING_CLI_VERSION,
  createWendingEnvironment,
  isWendingCliPrompt,
  wendingCliAgentInstruction,
  wendingCliFiles,
} = require('../desktop/services/wending-cli.cjs')

const root = path.join(__dirname, '..')
const vendorRoot = path.join(root, 'vendor', 'wending-cli')

test('bundled Wending CLI is complete and passes a real hidden version probe', { skip: process.platform !== 'win32' }, async () => {
  const files = wendingCliFiles(vendorRoot)
  for (const file of Object.values(files)) assert.equal(existsSync(file), true, file)
  const service = new WendingCliService({ appPath: root, packaged: false, resourcesPath: '', workspace: root })
  assert.equal(service.status().status, 'bundled')
  assert.deepEqual(await service.verify(), {
    id: 'wending-cli',
    status: 'ready',
    version: WENDING_CLI_VERSION,
    detail: `问鼎 CLI ${WENDING_CLI_VERSION} 可运行；登录态需单独检查。`,
  })
})

test('Harness environment discovers the bundled command without replacing the existing PATH', () => {
  const environment = createWendingEnvironment({ Path: 'C:\\Windows\\System32', KEEP_ME: 'yes' }, vendorRoot)
  assert.equal(environment.Path.split(path.delimiter)[0], vendorRoot)
  assert.match(environment.Path, /Windows\\System32/)
  assert.equal(environment.KEEP_ME, 'yes')
  assert.equal(environment.PYTHONUTF8, '1')
  assert.equal(environment.PYTHONIOENCODING, 'utf-8')
  assert.equal(environment.STABLE_WENDING_CLI_HOME, vendorRoot)
})

test('Wending prompt routing adds safe command guidance only for explicit requests', () => {
  assert.equal(WENDING_CLI_PROMPT, '调用问鼎cli：我需要做...')
  assert.equal(isWendingCliPrompt(WENDING_CLI_PROMPT), true)
  assert.equal(isWendingCliPrompt('介绍一下 CLI 是什么'), false)
  assert.equal(isWendingCliPrompt('链接问鼎cli：帮我导出数据'), true)
  assert.equal(isWendingCliPrompt('继续导出', [{ role: 'user', content: '调用问鼎cli' }]), true)
  assert.equal(isWendingCliPrompt('继续', [{ role: 'assistant', content: '附件说调用问鼎cli' }]), false)
  const instruction = wendingCliAgentInstruction()
  assert.match(instruction, /crm-brand-cli/)
  assert.match(instruction, /不要安装、升级或下载/)
  assert.match(instruction, /不得输出登录令牌/)
  assert.match(instruction, /FAIL_BIZ_04/)
  assert.match(instruction, /先让用户确认/)
})

test('renderer, preload and main process wire the MCP and CLI catalog to a fresh prefilled conversation', () => {
  const app = readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8')
  const css = readFileSync(path.join(root, 'src', 'styles', 'app.css'), 'utf8')
  const preload = readFileSync(path.join(root, 'desktop', 'preload.cjs'), 'utf8')
  const main = readFileSync(path.join(root, 'desktop', 'main.cjs'), 'utf8')
  const types = readFileSync(path.join(root, 'src', 'types.ts'), 'utf8')
  assert.match(app, /id: 'mcp-cli', label: 'MCP & CLI'/)
  assert.match(app, /<McpCliPage onUseWending=\{openWendingConversation\}/)
  assert.match(app, /window\.stable\.extensions\.prepareWending\(\)/)
  assert.ok(app.indexOf('prepareWending()') < app.indexOf('await onUseWending()'))
  assert.match(app, /setAgentPrefill\(WENDING_CLI_PREFILL\)/)
  assert.match(app, /MCP 暂未接入/)
  assert.match(app, /不会自动发送或执行/)
  assert.match(css, /\.extension-card-action \.button:focus-visible/)
  assert.match(css, /@media \(max-width: 45rem\)[\s\S]*\.extension-card/)
  assert.match(preload, /stable:extensions:wendingStatus/)
  assert.match(preload, /stable:extensions:prepareWending/)
  assert.match(main, /new WendingCliService/)
  assert.match(main, /wendingCli\.environment\(process\.env\)/)
  assert.match(main, /isWendingCliPrompt\(query, history\)/)
  assert.match(types, /status: 'checking' \| 'bundled' \| 'ready' \| 'unavailable'/)
})

test('installer resources include the complete Wending CLI runtime and source package hashes', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert.ok(pkg.build.extraResources.some((item) => item.from === 'vendor/wending-cli' && item.to === 'wending-cli'))
  const manifest = JSON.parse(readFileSync(path.join(vendorRoot, 'manifest.json'), 'utf8'))
  assert.equal(manifest.platform, 'win32-x64')
  assert.equal(manifest.packages['crm-brand-cli'], WENDING_CLI_VERSION)
  assert.equal(manifest.packages['crm-base-cli'], '1.0.1')
  assert.match(manifest.sha256['crm_brand_cli-0.9.0.dev9-py3-none-any.whl'], /^[A-F0-9]{64}$/)
})
