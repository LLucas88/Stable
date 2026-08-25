'use strict'

const { readdirSync } = require('node:fs')
const path = require('node:path')

const CATEGORY_LABELS = { collection: '数据采集', cleaning: '数据清洗', processing: '数据加工' }
const RUN_LABELS = { idle: '未运行', running: '运行中', completed: '已完成', failed: '失败', cancelled: '已停止' }

function clean(value) { return String(value || '未命名').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 160) || '未命名' }

function workspaceFiles(root, limit = 100) {
  const files = []
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (files.length >= limit) return
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(fullPath)
      else if (entry.isFile()) files.push(path.relative(root, fullPath))
    }
  }
  try { visit(root) } catch {}
  return files
}

function section(title, items, status) {
  const rows = items.map((item) => `- ${clean(item.name)}（${status(item)}）`)
  return `### ${title}（${items.length}）\n${rows.length ? rows.join('\n') : '- 暂无'}`
}

function buildWorkbenchInventory({ data = [], library = [], knowledge = [], skills = [], workflows = [], reports = [], workspace = '' }) {
  const files = workspaceFiles(workspace)
  return [
    section('数据表', data, (item) => item.enabled ? '已启用' : '未启用'),
    section('数据处理库', library, (item) => `${CATEGORY_LABELS[item.category] || '数据资产'} · ${RUN_LABELS[item.lastStatus] || clean(item.lastStatus)}`),
    section('知识文档', knowledge, (item) => item.enabled ? 'Agent 可调用' : '未启用调用'),
    section('Skills', skills, (item) => item.enabled ? '已启用' : '未启用'),
    section('工作流', workflows, (item) => RUN_LABELS[item.lastStatus] || clean(item.lastStatus || '未运行')),
    section('HTML 报告', reports, (item) => item.mode === 'source' ? 'HTML 源码' : '组件编辑'),
    section('工作区文件', files.map((name) => ({ name })), () => '文件'),
  ].join('\n\n')
}

function asksForWorkbenchInventory(query) {
  const text = String(query || '').replace(/\s+/g, '')
  return /(本地|工作台|工作区).{0,20}(内容|有什么|有哪些|清单|有没有|是否有)|(列出|盘点).{0,20}(本地|工作台|工作区)/.test(text)
}

function requestedWorkbenchAction(query, { library = [], workflows = [], skills = [] } = {}) {
  const text = String(query || '').replace(/\s+/g, '').toLowerCase()
  if (!/(调用|运行|执行|启动|使用|用一下|处理)/.test(text)) return null
  const named = [
    ...library.filter((item) => item.kind === 'script').map((item) => ({ type: 'script', item })),
    ...workflows.map((item) => ({ type: 'workflow', item })),
    ...skills.filter((item) => item.enabled).map((item) => ({ type: 'skill', item })),
  ].sort((left, right) => String(right.item.name).length - String(left.item.name).length)
  const exact = named.find(({ item }) => text.includes(String(item.name || '').replace(/\s+/g, '').toLowerCase()))
  if (exact) return exact
  const category = text.includes('数据清洗') ? 'cleaning' : text.includes('数据采集') ? 'collection' : text.includes('数据加工') ? 'processing' : ''
  if (category) {
    const candidates = named.filter(({ type, item }) => type === 'script' && item.category === category)
    if (candidates.length === 1) return candidates[0]
  }
  if (text.includes('工作流')) {
    const candidates = named.filter(({ type }) => type === 'workflow')
    if (candidates.length === 1) return candidates[0]
  }
  if (text.includes('skill')) {
    const candidates = named.filter(({ type }) => type === 'skill')
    if (candidates.length === 1) return candidates[0]
  }
  return null
}

function workbenchInventoryAnswer(inventory) {
  return `Stable 当前的本地工作台内容如下。以下是名称与状态清单，不包含文件正文或内部存储路径。\n\n${inventory}`
}

module.exports = { asksForWorkbenchInventory, buildWorkbenchInventory, requestedWorkbenchAction, workbenchInventoryAnswer, workspaceFiles }
