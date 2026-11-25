'use strict'
const fs = require('node:fs')
const path = require('node:path')

const validatorFile = 'lib/core/openai-responses.ts'
const catalogFile = 'lib/server/model-catalog.ts'
const priorEfforts = `export const efforts: Record<string,string[]> = {
  'gpt-6.1-sol':['low','medium','high','xhigh','max'],
  'gpt-6.1-terra':['none','low','medium','high','xhigh','max'],
};`
const priorCatalogFlag = "    responses_supported: row.provider === 'openai' && ['gpt-6.1-sol','gpt-6.1-terra'].includes(String(row.id)),"
const catalogFlag = "    responses_supported: row.provider === 'openai' && supportsOpenAIResponses(row.id),"

function replaceKnown(source, previous, next, relativePath) {
  if (source.includes(next)) return source
  const first = source.indexOf(previous)
  if (first < 0 || source.indexOf(previous, first + previous.length) >= 0) {
    throw Error(`Unexpected source in ${relativePath}`)
  }
  return source.slice(0, first) + next + source.slice(first + previous.length)
}

function patchCatalog(source, { initial = false } = {}) {
  const limitField = '    max_output_tokens: row.max_output_tokens,'
  const previousFlag = initial && !source.includes('responses_supported:') ? limitField : priorCatalogFlag
  const nextFlag = previousFlag === limitField ? `${limitField}\n${catalogFlag}` : catalogFlag
  const importAnchor = "import { createId } from './crypto';"
  const supportsImport = "import { supportsOpenAIResponses } from '../core/openai-responses';"
  const updated = replaceKnown(source, previousFlag, nextFlag, catalogFile)
  return replaceKnown(updated, importAnchor, `${supportsImport}\n${importAnchor}`, catalogFile)
}

function patchValidator(source) {
  const overlay = fs.readFileSync(path.join(__dirname, 'overlay', validatorFile), 'utf8').replace(/\r\n/g, '\n')
  const definition = overlay.slice(overlay.indexOf('\n') + 1, overlay.indexOf('\nfunction invalid('))
  const updated = replaceKnown(source, priorEfforts, definition, validatorFile)
  return replaceKnown(updated, 'if(!Object.hasOwn(efforts,b.model))', 'if(!supportsOpenAIResponses(b.model))', validatorFile)
}

function applyGPT6Responses(target) {
  const updates = [[validatorFile, patchValidator], [catalogFile, patchCatalog]].map(([relativePath, patch]) => {
    const destination = path.join(target, relativePath)
    const original = fs.readFileSync(destination, 'utf8')
    const normalized = original.replace(/\r\n/g, '\n')
    const patched = patch(normalized)
    return { relativePath, destination, original, patched: original === normalized ? patched : patched.replace(/\n/g, '\r\n') }
  }).filter(({ original, patched }) => original !== patched)
  const backup = updates.length ? fs.mkdtempSync(path.join(target, '.gpt6-responses-backup-')) : null
  for (const { relativePath, original } of updates) {
    const copy = path.join(backup, relativePath)
    fs.mkdirSync(path.dirname(copy), { recursive: true })
    fs.writeFileSync(copy, original)
  }
  for (const { destination, patched } of updates) fs.writeFileSync(destination, patched)
  return { files: updates.map(update => update.relativePath), backup }
}

if (require.main === module) {
  if (!process.argv[2]) throw Error('Provide a staged Stable Cloud source directory')
  const target = path.resolve(process.argv[2])
  console.log(JSON.stringify({ target, ...applyGPT6Responses(target), deployed: false }))
}

module.exports = { applyGPT6Responses, patchCatalog }
