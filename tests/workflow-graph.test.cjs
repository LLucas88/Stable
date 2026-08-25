'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { layoutWorkflowGraph, normalizeWorkflowGraph, scheduleWorkflowTasks, topologicalOrder, validateWorkflowGraph } = require('../desktop/services/workflow-graph.cjs')

const graph = {
  nodes: [
    { id: 'data', type: 'data', title: '数据', position: { x: 0, y: 0 } },
    { id: 'knowledge', type: 'knowledge', title: '知识', position: { x: 0, y: 0 } },
    { id: 'ai', type: 'ai', title: '分析', position: { x: 0, y: 0 } },
    { id: 'output', type: 'output', title: '输出', position: { x: 0, y: 0 } },
  ],
  edges: [
    { id: 'e1', source: 'data', target: 'ai' }, { id: 'e2', source: 'knowledge', target: 'ai' },
    { id: 'e3', source: 'ai', target: 'output' },
  ],
}

test('workflow graph validates a fan-in DAG and lays it out by dependency depth', () => {
  const value = validateWorkflowGraph(graph, { requireRunnable: true })
  const order = topologicalOrder(value)
  assert.ok(order.indexOf('data') < order.indexOf('ai'))
  assert.ok(order.indexOf('knowledge') < order.indexOf('ai'))
  assert.ok(order.indexOf('ai') < order.indexOf('output'))
  const laidOut = layoutWorkflowGraph(value)
  assert.ok(laidOut.nodes.find((node) => node.id === 'output').position.x > laidOut.nodes.find((node) => node.id === 'ai').position.x)
})

test('independent workflow branches run concurrently and joins wait for every upstream node', async () => {
  const branchGraph = validateWorkflowGraph({
    nodes: [
      { id: 'left', type: 'ai', title: '左分支', position: { x: 0, y: 0 } },
      { id: 'right', type: 'ai', title: '右分支', position: { x: 0, y: 0 } },
      { id: 'join', type: 'output', title: '汇总', position: { x: 0, y: 0 } },
    ],
    edges: [{ id: 'left-join', source: 'left', target: 'join' }, { id: 'right-join', source: 'right', target: 'join' }],
  }, { requireRunnable: true })
  const events = []
  let releaseLeft
  const leftGate = new Promise((resolve) => { releaseLeft = resolve })
  const tasks = scheduleWorkflowTasks(branchGraph, async (nodeId) => {
    events.push(`start:${nodeId}`)
    if (nodeId === 'left') await leftGate
    events.push(`end:${nodeId}`)
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(events.includes('start:left'))
  assert.ok(events.includes('start:right'))
  assert.ok(events.includes('end:right'))
  assert.ok(!events.includes('start:join'))
  releaseLeft()
  await Promise.all(tasks.values())
  assert.ok(events.indexOf('start:join') > events.indexOf('end:left'))
  assert.ok(events.indexOf('start:join') > events.indexOf('end:right'))
})

test('workflow graph rejects cycles and runnable graphs without an output', () => {
  const cyclic = { nodes: [...graph.nodes, { id: 'ai-2', type: 'ai', title: '复核', position: { x: 0, y: 0 } }], edges: [
    { id: 'loop-1', source: 'ai', target: 'ai-2' }, { id: 'loop-2', source: 'ai-2', target: 'ai' },
  ] }
  assert.throws(() => validateWorkflowGraph(cyclic), /循环连线/)
  assert.throws(() => validateWorkflowGraph({ nodes: graph.nodes.filter((node) => node.type !== 'output'), edges: graph.edges.slice(0, 2) }, { requireRunnable: true }), /至少需要一个输出模块/)
})

test('every module can receive upstream data and pass its result downstream', () => {
  const resourceDownstream = validateWorkflowGraph({ ...graph, edges: [{ id: 'back', source: 'ai', target: 'data' }] })
  const outputDownstream = validateWorkflowGraph({ ...graph, edges: [{ id: 'after', source: 'output', target: 'ai' }] })
  assert.equal(resourceDownstream.edges[0].target, 'data')
  assert.equal(outputDownstream.edges[0].source, 'output')
})

test('legacy step arrays remain readable as a linear graph', () => {
  const value = normalizeWorkflowGraph([{ id: 'one', type: 'prompt', title: '分析', content: '生成结论' }, { id: 'two', type: 'output', title: '保存', content: '结论' }])
  assert.equal(value.nodes[0].type, 'ai')
  assert.equal(value.nodes[0].instruction, '生成结论')
  assert.equal(value.edges[0].source, 'one')
  assert.equal(value.edges[0].target, 'two')
})

test('output format is preserved and unknown formats safely fall back to Markdown', () => {
  const pptx = validateWorkflowGraph({ ...graph, nodes: graph.nodes.map((node) => node.id === 'output' ? { ...node, outputFormat: 'pptx' } : node) })
  const fallback = validateWorkflowGraph({ ...graph, nodes: graph.nodes.map((node) => node.id === 'output' ? { ...node, outputFormat: 'word' } : node) })
  assert.equal(pptx.nodes.find((node) => node.id === 'output').outputFormat, 'pptx')
  assert.equal(fallback.nodes.find((node) => node.id === 'output').outputFormat, 'markdown')
})
