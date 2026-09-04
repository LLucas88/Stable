'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { PINNED_CODEX_VERSION } = require('../desktop/services/codex-harness.cjs')
const project = path.resolve(__dirname, '..')
const sourceArgument = process.argv.indexOf('--source')
const packageRoot = sourceArgument >= 0 ? path.resolve(process.argv[sourceArgument + 1]) : path.join(project, 'node_modules', '@openai', 'codex')
const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
if (pkg.version !== PINNED_CODEX_VERSION) throw new Error(`Codex 版本必须为 ${PINNED_CODEX_VERSION}，当前为 ${pkg.version}`)
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('当前 Stable 安装包仅支持 Windows x64。')
const vendorCandidates = [
  path.join(packageRoot, 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc'),
  path.join(path.dirname(packageRoot), 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc'),
  path.join(packageRoot, 'vendor', 'x86_64-pc-windows-msvc'),
]
const source = vendorCandidates.find((item) => fs.existsSync(path.join(item, 'bin', 'codex.exe')))
if (!source) throw new Error('Codex Windows 二进制缺失，请重新执行 npm ci（包含 optionalDependencies）。')
const target = path.join(project, 'runtime', 'codex')
fs.mkdirSync(target, { recursive: true })
for (const item of ['bin', 'codex-path', 'codex-resources']) fs.cpSync(path.join(source, item), path.join(target, item), { recursive: true })
const checked = spawnSync(path.join(target, 'bin', 'codex.exe'), ['--version'], { encoding: 'utf8', windowsHide: true })
if (checked.status !== 0 || !checked.stdout.includes(PINNED_CODEX_VERSION)) throw new Error(`Codex 运行时校验失败：${checked.stderr || checked.stdout}`)
fs.writeFileSync(path.join(target, 'stable-runtime.json'), JSON.stringify({ version: pkg.version, platform: 'win32-x64', source: 'https://github.com/openai/codex', license: pkg.license }, null, 2))
console.log(`Codex ${pkg.version} runtime ready: ${target}`)
