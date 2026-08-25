'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const JSZip = require('jszip')
const {
  copyScriptFolder,
  extractScriptZip,
  migrateScriptPackage,
  removeStoredAsset,
  scanPackage,
} = require('../desktop/services/library-packages.cjs')

test('folder imports retain the entry script and sibling runtime dependencies', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-package-'))
  const source = path.join(root, 'source')
  const target = path.join(root, 'library', 'asset-1')
  mkdirSync(path.join(source, 'runtime'), { recursive: true })
  writeFileSync(path.join(source, 'start.bat'), '@echo off\r\necho OK\r\n', 'utf8')
  writeFileSync(path.join(source, 'runtime', 'launcher.ps1'), 'Write-Output OK', 'utf8')
  try {
    const entry = copyScriptFolder(source, target, path.join(source, 'start.bat'))
    assert.equal(readFileSync(entry, 'utf8').includes('echo OK'), true)
    assert.equal(existsSync(path.join(target, 'runtime', 'launcher.ps1')), true)
    assert.equal(scanPackage(target).scripts.length, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('folder imports materialize directory dependency links but still reject file links', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-package-links-'))
  const source = path.join(root, 'source')
  const target = path.join(root, 'library', 'asset-links')
  const dependencies = path.join(root, 'shared-dependencies')
  mkdirSync(source, { recursive: true })
  mkdirSync(dependencies, { recursive: true })
  writeFileSync(path.join(source, 'START.cmd'), '@echo off\r\npowershell -File run.ps1\r\n', 'utf8')
  writeFileSync(path.join(source, 'run.ps1'), 'Write-Output OK', 'utf8')
  writeFileSync(path.join(dependencies, 'package.js'), 'module.exports = true', 'utf8')
  symlinkSync(dependencies, path.join(source, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  try {
    const entry = copyScriptFolder(source, target, path.join(source, 'START.cmd'))
    assert.equal(existsSync(entry), true)
    assert.equal(existsSync(path.join(target, 'run.ps1')), true)
    assert.equal(existsSync(path.join(target, 'node_modules', 'package.js')), true)
    assert.equal(lstatSync(path.join(target, 'node_modules')).isSymbolicLink(), false)
    assert.equal(readFileSync(path.join(target, 'node_modules', 'package.js'), 'utf8'), 'module.exports = true')
    if (process.platform !== 'win32') {
      symlinkSync(path.join(source, 'run.ps1'), path.join(source, 'linked-run.ps1'), 'file')
      assert.throws(() => scanPackage(source), /文件符号链接/)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('legacy Stable script packages migrate with their dependencies', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-migrate-'))
  const source = path.join(root, 'old', 'data-library', 'cleaning', 'asset-old')
  const entry = path.join(source, 'tool', 'START.cmd')
  const dependency = path.join(source, 'tool', 'runtime', 'launcher.ps1')
  const target = path.join(root, 'current', 'data-library', 'cleaning', 'asset-new')
  mkdirSync(path.dirname(dependency), { recursive: true })
  writeFileSync(entry, '@echo off\r\necho OK\r\n', 'utf8')
  writeFileSync(dependency, 'Write-Output OK', 'utf8')
  try {
    const migratedEntry = migrateScriptPackage(entry, 'cleaning', target)
    assert.equal(readFileSync(migratedEntry, 'utf8').includes('echo OK'), true)
    assert.equal(existsSync(path.join(target, 'tool', 'runtime', 'launcher.ps1')), true)
    assert.equal(existsSync(entry), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('ZIP imports extract complete packages and reject traversal paths', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-zip-'))
  const zipPath = path.join(root, 'package.zip')
  const target = path.join(root, 'library', 'asset-2')
  const archive = new JSZip()
  archive.file('collector/start.cmd', '@echo off\r\necho ZIP_OK\r\n')
  archive.file('collector/runtime/launcher.ps1', 'Write-Output ZIP_OK')
  writeFileSync(zipPath, await archive.generateAsync({ type: 'nodebuffer' }))
  try {
    const result = await extractScriptZip(zipPath, target)
    assert.equal(result.scripts.length, 2)
    assert.equal(existsSync(path.join(target, 'collector', 'runtime', 'launcher.ps1')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }

  const unsafeRoot = mkdtempSync(path.join(os.tmpdir(), 'stable-zip-unsafe-'))
  const unsafeZip = path.join(unsafeRoot, 'unsafe.zip')
  const unsafeArchive = new JSZip()
  unsafeArchive.file('../outside.cmd', '@echo off')
  writeFileSync(unsafeZip, await unsafeArchive.generateAsync({ type: 'nodebuffer' }))
  try {
    await assert.rejects(() => extractScriptZip(unsafeZip, path.join(unsafeRoot, 'target')), /不安全的路径/)
  } finally {
    rmSync(unsafeRoot, { recursive: true, force: true })
  }
})

test('removing a packaged asset deletes its private bundle but not the library root', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-remove-'))
  const bundle = path.join(root, 'asset-3')
  const entry = path.join(bundle, 'start.cmd')
  mkdirSync(bundle, { recursive: true })
  writeFileSync(entry, '@echo off', 'utf8')
  removeStoredAsset(root, entry)
  assert.equal(existsSync(bundle), false)
  assert.equal(existsSync(root), true)
  rmSync(root, { recursive: true, force: true })
})
