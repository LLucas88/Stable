'use strict'

const { statSync, lstatSync, readdirSync, readFileSync, mkdirSync, cpSync, existsSync } = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.yaml', '.yml', '.html', '.log', '.xml'])
const SUPPORTED_DATA_EXTENSIONS = new Set([...TEXT_EXTENSIONS, '.docx', '.pdf', '.xlsx', '.xls'])
const MAX_FILE_BYTES = 50 * 1024 * 1024
const MAX_TEXT = 500_000
const MAX_SKILL_BYTES = 100 * 1024 * 1024
const MAX_SKILL_FILES = 2_000

function inspectDataFile(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim() || !existsSync(filePath)) throw new Error('找不到要导入的文件。')
  const stat = statSync(filePath)
  if (!stat.isFile()) throw new Error('这里仅支持文件，不能直接导入文件夹。')
  if (stat.size > MAX_FILE_BYTES) throw new Error(`“${path.basename(filePath)}”超过 50 MB，未导入。`)
  const extension = path.extname(filePath).toLowerCase()
  if (!SUPPORTED_DATA_EXTENSIONS.has(extension)) {
    throw new Error(`不支持“${path.basename(filePath)}”的文件格式。支持 TXT、Markdown、CSV、JSON、YAML、HTML、LOG、XML、PDF、DOCX 和 Excel。`)
  }
  return { name: path.basename(filePath), path: filePath, size: stat.size, type: extension.slice(1) }
}

async function extractText(filePath) {
  const inspected = inspectDataFile(filePath)
  const ext = `.${inspected.type}`
  let text = ''
  if (TEXT_EXTENSIONS.has(ext)) text = readFileSync(filePath, 'utf8')
  else if (ext === '.docx') {
    const mammoth = require('mammoth')
    text = (await mammoth.extractRawText({ path: filePath })).value
  } else if (ext === '.pdf') {
    const pdf = require('pdf-parse')
    text = (await pdf(readFileSync(filePath))).text
  } else if (ext === '.xlsx' || ext === '.xls') {
    const XLSX = require('xlsx')
    const workbook = XLSX.readFile(filePath)
    text = workbook.SheetNames.map((name) => `# ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`).join('\n\n')
  }
  return { text: text.slice(0, MAX_TEXT), size: inspected.size, type: inspected.type }
}

function parseFrontmatter(content, fallbackName) {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return { name: fallbackName, description: '本地 Skill' }
  try {
    const meta = require('yaml').parse(match[1]) || {}
    return { name: String(meta.name || fallbackName).trim(), description: String(meta.description || '本地 Skill').trim() }
  } catch {
    return { name: fallbackName, description: '本地 Skill' }
  }
}

function inspectSkillFolder(source) {
  if (typeof source !== 'string' || !source.trim() || !existsSync(source) || !statSync(source).isDirectory()) throw new Error('找不到要安装的 Skill 文件夹。')
  const skillFile = path.join(source, 'SKILL.md')
  if (!existsSync(skillFile) || !statSync(skillFile).isFile()) throw new Error('这个文件夹不是 Skill：根目录中没有 SKILL.md。')
  let size = 0
  let fileCount = 0
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      const info = lstatSync(target)
      if (info.isSymbolicLink()) throw new Error(`Skill 文件夹不能包含符号链接：“${entry.name}”。`)
      if (info.isDirectory()) visit(target)
      else if (info.isFile()) { size += info.size; fileCount += 1 }
      if (size > MAX_SKILL_BYTES) throw new Error('Skill 文件夹不能超过 100 MB。')
      if (fileCount > MAX_SKILL_FILES) throw new Error('Skill 文件夹不能超过 2000 个文件。')
    }
  }
  visit(source)
  const content = readFileSync(skillFile, 'utf8')
  const meta = parseFrontmatter(content, path.basename(source))
  return { ...meta, name: meta.name, path: source, size, type: 'skill', content: content.slice(0, MAX_TEXT) }
}

function importSkillFolder(source, skillsRoot) {
  const inspected = inspectSkillFolder(source)
  const id = randomUUID()
  const destination = path.join(skillsRoot, id)
  mkdirSync(skillsRoot, { recursive: true })
  cpSync(source, destination, { recursive: true, errorOnExist: true })
  return { id, name: inspected.name, description: inspected.description, path: destination, content: inspected.content }
}

module.exports = { SUPPORTED_DATA_EXTENSIONS, extractText, importSkillFolder, inspectDataFile, inspectSkillFolder, parseFrontmatter }
