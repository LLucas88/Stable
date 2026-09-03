'use strict'

const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')

// Included by desktop/**/* in both the full and update installers (inside app.asar).
const DEFAULT_GLOBAL_INSTRUCTIONS = path.join(__dirname, '..', 'defaults', 'AGENTS.md')

function ensureGlobalInstructions(userData, template = DEFAULT_GLOBAL_INSTRUCTIONS) {
  const filePath = path.join(userData, 'AGENTS.md')
  mkdirSync(userData, { recursive: true })
  try {
    // An existing file, including a deliberately empty one, belongs to the user.
    writeFileSync(filePath, readFileSync(template), { flag: 'wx' })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  return filePath
}

function readGlobalInstructionsFile(userData) {
  const filePath = ensureGlobalInstructions(userData)
  const content = readFileSync(filePath, 'utf8')
  if (Buffer.byteLength(content, 'utf8') > 200_000) throw new Error('全局 AGENTS.md 不能超过 200 KB。')
  return { path: filePath, content, exists: true }
}

function saveGlobalInstructionsFile(userData, value) {
  if (typeof value !== 'string') throw new Error('全局 Agent 对话提醒内容无效。')
  if (Buffer.byteLength(value, 'utf8') > 200_000) throw new Error('全局 AGENTS.md 不能超过 200 KB。')
  const filePath = path.join(userData, 'AGENTS.md')
  mkdirSync(userData, { recursive: true })
  const content = value.replace(/^\uFEFF/, '')
  writeFileSync(filePath, content, 'utf8')
  return { path: filePath, content, exists: true }
}

module.exports = { DEFAULT_GLOBAL_INSTRUCTIONS, ensureGlobalInstructions, readGlobalInstructionsFile, saveGlobalInstructionsFile }
