'use strict'

const { randomUUID } = require('node:crypto')
const { normalizeOutputFormat } = require('./workflow-output.cjs')

const NODE_TYPES = new Set(['data', 'knowledge', 'script', 'skill', 'ai', 'output'])
const LEGACY_TYPES = { prompt: 'ai', skill: 'skill', data: 'data', output: 'output' }

function text(value, max = 500) { return String(value || '').trim().slice(0, max) }

function legacyStepsToGraph(steps) {
  const nodes = steps.map((step, index) => ({
    id: text(step.id, 100) || randomUUID(), type: LEGACY_TYPES[step.type] || 'ai',
    title: text(step.title, 100) || '未命名模块', position: { x: 80 + index * 280, y: 120 },
    ...(step.type === 'prompt' ? { instruction: text(step.content, 20_000) } : {}),
    ...(step.type === 'output' ? { outputName: text(step.content, 100), outputFormat: 'markdown' } : {}),
    ...(['skill', 'data'].includes(step.type) ? { resourceId: text(step.content, 100), instruction: text(step.content, 500) } : {}),
  }))
  return { nodes, edges: nodes.slice(1).map((node, index) => ({ id: randomUUID(), source: nodes[index].id, target: node.id })) }
}

function normalizeWorkflowGraph(value) {
  if (Array.isArray(value)) return legacyStepsToGraph(value)
  return { nodes: Array.isArray(value?.nodes) ? value.nodes : [], edges: Array.isArray(value?.edges) ? value.edges : [] }
}

function topologicalOrder(graph) {
  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(graph.nodes.map((node) => [node.id, []]))
  for (const edge of graph.edges) {
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1)
    outgoing.get(edge.source)?.push(edge.target)
  }
  const queue = graph.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id)
  const result = []
  while (queue.length) {
    const id = queue.shift(); result.push(id)
    for (const target of outgoing.get(id) || []) {
      incoming.set(target, incoming.get(target) - 1)
      if (incoming.get(target) === 0) queue.push(target)
    }
  }
  if (result.length !== graph.nodes.length) throw new Error('工作流包含循环连线。请删除形成闭环的连线。')
  return result
}

function scheduleWorkflowTasks(graph, executeNode) {
  const tasks = new Map()
  for (const nodeId of topologicalOrder(graph)) {
    const dependencies = graph.edges.filter((edge) => edge.target === nodeId).map((edge) => tasks.get(edge.source))
    tasks.set(nodeId, Promise.all(dependencies).then(() => executeNode(nodeId)))
  }
  return tasks
}

function validateWorkflowGraph(value, { requireRunnable = false } = {}) {
  const source = normalizeWorkflowGraph(value)
  if (source.nodes.length > 60 || source.edges.length > 120) throw new Error('工作流最多包含 60 个模块和 120 条连线。')
  if (requireRunnable && source.nodes.length === 0) throw new Error('工作流还没有模块。')
  const ids = new Set()
  const nodes = source.nodes.map((node) => {
    const id = text(node.id, 100) || randomUUID()
    if (ids.has(id)) throw new Error('工作流包含重复的模块 ID。')
    ids.add(id)
    const type = text(node.type, 30)
    if (!NODE_TYPES.has(type)) throw new Error(`未知的工作流模块类型：${type || '空值'}`)
    const x = Number(node.position?.x); const y = Number(node.position?.y)
    return {
      id, type, title: text(node.title, 100) || '未命名模块',
      position: { x: Number.isFinite(x) ? Math.max(-10_000, Math.min(10_000, x)) : 80, y: Number.isFinite(y) ? Math.max(-10_000, Math.min(10_000, y)) : 120 },
      ...(node.resourceId ? { resourceId: text(node.resourceId, 100) } : {}),
      ...(node.instruction ? { instruction: text(node.instruction, 20_000) } : {}),
      ...(node.outputName ? { outputName: text(node.outputName, 100) } : {}),
      ...(type === 'output' ? { outputFormat: normalizeOutputFormat(node.outputFormat) } : {}),
    }
  })
  const edgeKeys = new Set()
  const edges = source.edges.map((edge) => {
    const sourceId = text(edge.source, 100); const targetId = text(edge.target, 100)
    if (!ids.has(sourceId) || !ids.has(targetId)) throw new Error('工作流连线引用了不存在的模块。')
    if (sourceId === targetId) throw new Error('模块不能连接到自身。')
    const key = `${sourceId}\u0000${targetId}`
    if (edgeKeys.has(key)) throw new Error('工作流包含重复连线。')
    edgeKeys.add(key)
    return { id: text(edge.id, 100) || randomUUID(), source: sourceId, target: targetId }
  })
  const graph = { nodes, edges }
  topologicalOrder(graph)
  if (requireRunnable && !nodes.some((node) => node.type === 'output')) throw new Error('可运行的工作流至少需要一个输出模块。')
  return graph
}

function layoutWorkflowGraph(value) {
  const graph = validateWorkflowGraph(value)
  const order = topologicalOrder(graph)
  const depth = new Map(graph.nodes.map((node) => [node.id, 0]))
  for (const id of order) {
    for (const edge of graph.edges.filter((candidate) => candidate.source === id)) depth.set(edge.target, Math.max(depth.get(edge.target) || 0, (depth.get(id) || 0) + 1))
  }
  const lanes = new Map()
  return { ...graph, nodes: graph.nodes.map((node) => {
    const column = depth.get(node.id) || 0; const lane = lanes.get(column) || 0; lanes.set(column, lane + 1)
    return { ...node, position: { x: 70 + column * 300, y: 70 + lane * 150 } }
  }) }
}

module.exports = { NODE_TYPES, normalizeWorkflowGraph, validateWorkflowGraph, topologicalOrder, scheduleWorkflowTasks, layoutWorkflowGraph }
