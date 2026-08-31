import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Background, BaseEdge, getBezierPath, Handle, Position, ReactFlow,
  type Connection, type Edge, type EdgeProps, type Node, type NodeChange, type NodeProps, type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  ArrowUp, BookOpenText, Bot, Box, Braces, ChevronRight, CircleHelp, CircleStop, Clock3, Database, FileOutput,
  ExternalLink, FolderOpen, Glasses, Keyboard, Library, LogOut, Maximize2, Minimize2, Network, Play, Plus, Save, Sparkles, TerminalSquare, Trash2, WandSparkles, X,
} from 'lucide-react'
import type { BootstrapData, WorkflowArtifact, WorkflowItem, WorkflowNode, WorkflowNodeType, WorkflowRunEvent } from './types'

const META: Record<WorkflowNodeType, { label: string; placeholder: string; icon: typeof Database }> = {
  data: { label: '数据', placeholder: '选择数据资源', icon: Database },
  knowledge: { label: '知识库', placeholder: '选择知识文档', icon: BookOpenText },
  script: { label: '脚本', placeholder: '选择本地脚本', icon: TerminalSquare },
  skill: { label: 'Skill', placeholder: '选择 Skill', icon: Braces },
  ai: { label: 'AI 运算', placeholder: '点击模块，用 AI 补充指令', icon: Bot },
  output: { label: '输出', placeholder: '选择输出格式', icon: FileOutput },
}

type ResourceItem = { id: string; name: string }
type FlowData = {
  item: WorkflowNode
  status?: WorkflowRunEvent
  enhancing?: boolean
  promptError?: string
  resources: Partial<Record<WorkflowNodeType, ResourceItem[]>>
  onUpdate: (id: string, changes: Partial<WorkflowNode>) => void
  onRemove: (id: string) => void
}
type ExitData = { artifact: WorkflowArtifact }
type ModuleFlowNode = Node<FlowData, 'module'>
type ExitFlowNode = Node<ExitData, 'exit'>
type WorkflowFlowNode = ModuleFlowNode | ExitFlowNode

function ModuleNode({ data, selected }: NodeProps<ModuleFlowNode>) {
  const { item, status, enhancing, promptError, resources, onUpdate, onRemove } = data
  const meta = META[item.type]
  const Icon = meta.icon
  const options = resources[item.type] || []
  const selectResource = (resourceId: string) => {
    const resource = options.find((candidate) => candidate.id === resourceId)
    onUpdate(item.id, { resourceId, ...(resource ? { title: resource.name } : {}) })
  }
  return <div className="workflow-module" data-type={item.type} data-status={status?.status} data-selected={selected || undefined}>
    <Handle type="target" position={Position.Left} />
    <div className="workflow-module-head">
      <span className="workflow-module-icon"><Icon size={20} /></span>
      <span>{meta.label}</span>
      <button className="nodrag" aria-label={`删除 ${item.title}`} onClick={(event) => { event.stopPropagation(); onRemove(item.id) }}><Trash2 size={15} /></button>
    </div>
    <input className="workflow-module-title nodrag nopan" value={item.title} aria-label="模块名称" onChange={(event) => onUpdate(item.id, { title: event.target.value })} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} />
    {['data', 'knowledge', 'script', 'skill'].includes(item.type) && <select className="workflow-module-control nodrag nowheel" value={item.resourceId || ''} aria-label={meta.placeholder} onChange={(event) => selectResource(event.target.value)} onPointerDown={(event) => event.stopPropagation()}>
      <option value="">{meta.placeholder}</option>
      {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
    </select>}
    {item.type === 'output' && <select className="workflow-module-control nodrag nopan nowheel" value={item.outputFormat || 'markdown'} aria-label="输出格式" onChange={(event) => onUpdate(item.id, { outputFormat: event.target.value as WorkflowNode['outputFormat'] })} onPointerDown={(event) => event.stopPropagation()}><option value="markdown">Markdown 文档 (.md)</option><option value="pptx">PowerPoint 演示文稿 (.pptx)</option><option value="html">HTML 网页 (.html)</option><option value="xlsx">Excel 工作簿 (.xlsx)</option></select>}
    {['ai', 'output'].includes(item.type) && <div className="workflow-module-copy nodrag nopan nowheel" data-empty={!enhancing && !promptError && !item.instruction || undefined} data-enhancing={enhancing || undefined}>
      {enhancing ? 'AI提示词创作中' : promptError || item.instruction || '点击模块，输入关键词让 AI 生成可执行指令'}
    </div>}
    <span className="workflow-module-status" data-status={status?.status}>{status?.detail || '等待运行'}</span>
    <Handle type="source" position={Position.Right} />
  </div>
}

function ExitNode({ data }: NodeProps<ExitFlowNode>) {
  const { artifact } = data
  return <div className="workflow-exit-module">
    <Handle type="target" position={Position.Left} isConnectable={false} />
    <div className="workflow-exit-head"><span><LogOut size={18} /></span><small>出口</small></div>
    <strong>结果已就绪</strong>
    <span className="workflow-exit-name" title={artifact.name}>{artifact.name}</span>
    <div className="workflow-exit-actions nodrag nopan">
      <button type="button" onClick={() => void window.stable.system.openPath(artifact.path)}><ExternalLink size={16} />打开文件</button>
      <button type="button" onClick={() => void window.stable.system.showItemInFolder(artifact.path)}><FolderOpen size={16} />打开所在文件夹</button>
    </div>
  </div>
}

const NODE_TYPES = { module: ModuleNode, exit: ExitNode }

function edgeMotion(id: string) {
  let hash = 2166136261
  for (const character of id) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  hash ^= hash >>> 16
  const seed = hash >>> 0
  const duration = 820 + seed % 781
  return { duration, delay: -(seed >>> 8) % duration }
}

function WorkflowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, animated }: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const [measuredLength, setMeasuredLength] = useState(0)
  const measureRef = useRef<SVGPathElement>(null)
  const motion = edgeMotion(id)
  const segmentLength = measuredLength * 0.7
  const motionStyle = {
    '--workflow-flow-duration': `${motion.duration}ms`, '--workflow-flow-delay': `${motion.delay}ms`,
    '--workflow-flow-start': `${segmentLength}px`, '--workflow-flow-end': `${-measuredLength}px`,
    '--workflow-flow-dash': `${segmentLength}px ${measuredLength}px`,
  } as CSSProperties
  useEffect(() => {
    const next = measureRef.current?.getTotalLength() || 0
    setMeasuredLength((current) => Math.abs(current - next) < 0.5 ? current : next)
  }, [path, animated])
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} />
    {animated && <g className="workflow-flow-streaks" data-ready={measuredLength > 0 || undefined} style={motionStyle}>
      <path ref={measureRef} className="workflow-flow-streak workflow-flow-streak-aura" d={path} />
      <path className="workflow-flow-streak workflow-flow-streak-core" d={path} />
    </g>}
  </>
}

const EDGE_TYPES = { workflow: WorkflowEdge }
const emptyWorkflow = (): WorkflowItem => ({ id: '', name: '未命名工作流', description: '', nodes: [], edges: [], updatedAt: '' })

function cloneWorkflow(item: WorkflowItem): WorkflowItem {
  return { ...item, nodes: item.nodes.map((node) => ({ ...node, position: { ...node.position } })), edges: item.edges.map((edge) => ({ ...edge })) }
}

function createsCycle(source: string, target: string, edges: WorkflowItem['edges']) {
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target])
  const stack = [target]; const seen = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (id === source) return true
    if (seen.has(id)) continue
    seen.add(id); stack.push(...(outgoing.get(id) || []))
  }
  return false
}

export function WorkflowStudio({ state, update, action, busy }: {
  state: BootstrapData
  update: (items: WorkflowItem[]) => void
  action: (label: string, run: () => Promise<void>) => Promise<void>
  busy: string
}) {
  const [selectedId, setSelectedId] = useState(state.workflows[0]?.id || '')
  const [draft, setDraft] = useState<WorkflowItem>(() => cloneWorkflow(state.workflows[0] || emptyWorkflow()))
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [selectedEdgeId, setSelectedEdgeId] = useState('')
  const [edgeMenu, setEdgeMenu] = useState<{ id: string; left: number; top: number } | null>(null)
  const [editorPrompt, setEditorPrompt] = useState('')
  const [editorPosition, setEditorPosition] = useState<{ left: number; top: number } | null>(null)
  const [editorExpanded, setEditorExpanded] = useState(false)
  const [editorEffort, setEditorEffort] = useState<'fast' | 'standard' | 'deep'>('standard')
  const [enhancingNodeIds, setEnhancingNodeIds] = useState<Set<string>>(() => new Set())
  const [promptErrors, setPromptErrors] = useState<Record<string, string>>({})
  const [goal, setGoal] = useState('')
  const [dock, setDock] = useState<'modules' | 'ai' | 'workflows' | ''>('')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, WorkflowRunEvent>>({})
  const [artifacts, setArtifacts] = useState<WorkflowArtifact[]>([])
  const canvasRef = useRef<HTMLDivElement>(null)
  const flowRef = useRef<ReactFlowInstance<WorkflowFlowNode, Edge> | null>(null)
  const enhancementRunsRef = useRef(new Set<string>())

  const resources = useMemo<FlowData['resources']>(() => ({
    data: state.data.filter((item) => item.enabled),
    knowledge: state.knowledge.filter((item) => item.enabled),
    script: state.library.filter((item) => item.kind === 'script'),
    skill: state.skills.filter((item) => item.enabled),
  }), [state.data, state.knowledge, state.library, state.skills])

  const positionEditor = useCallback((nodeId: string) => {
    if (!nodeId) return setEditorPosition(null)
    window.requestAnimationFrame(() => {
      const canvas = canvasRef.current
      const node = Array.from(canvas?.querySelectorAll<HTMLElement>('.react-flow__node') || []).find((candidate) => candidate.dataset.id === nodeId)
      if (!canvas || !node) return setEditorPosition(null)
      const canvasRect = canvas.getBoundingClientRect()
      const nodeRect = node.getBoundingClientRect()
      const width = Math.min(576, canvasRect.width - 24)
      const left = nodeRect.left - canvasRect.left + (nodeRect.width - width) / 2
      setEditorPosition({ left, top: nodeRect.bottom - canvasRect.top + 10 })
    })
  }, [])

  const selectedTextNode = draft.nodes.find((node) => node.id === selectedNodeId && ['ai', 'output'].includes(node.type))
  const selectedEditorNodeId = selectedTextNode?.id || ''

  useEffect(() => window.stable.workflows.onEvent((event) => {
    if (event.workflowId !== selectedId) return
    setStatuses((current) => ({ ...current, [event.nodeId]: event }))
  }), [selectedId])

  useEffect(() => {
    setEditorPrompt('')
    setEditorExpanded(false)
    positionEditor(selectedEditorNodeId)
  }, [selectedNodeId, selectedEditorNodeId, positionEditor])

  useEffect(() => {
    if (selectedEditorNodeId && !editorExpanded) positionEditor(selectedEditorNodeId)
  }, [draft.nodes, selectedEditorNodeId, editorExpanded, positionEditor])

  useEffect(() => {
    if (!artifacts.length) return
    window.requestAnimationFrame(() => {
      const ids = new Set(artifacts.flatMap((artifact) => [artifact.nodeId, `exit-${artifact.nodeId}`]))
      const nodes = flowRef.current?.getNodes().filter((node) => ids.has(node.id)) || []
      if (nodes.length) void flowRef.current?.fitView({ nodes, padding: 0.35, duration: 420, maxZoom: 1 })
    })
  }, [artifacts])

  function selectWorkflow(item: WorkflowItem) {
    setSelectedId(item.id); setDraft(cloneWorkflow(item)); setSelectedNodeId(''); setSelectedEdgeId(''); setStatuses({}); setArtifacts([]); setDock(''); setLibraryOpen(false)
  }
  function updateNode(id: string, changes: Partial<WorkflowNode>) {
    setDraft((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === id ? { ...node, ...changes } : node) }))
  }
  function removeNodes(ids: string[]) {
    const removed = new Set(ids)
    setDraft((current) => ({ ...current, nodes: current.nodes.filter((node) => !removed.has(node.id)), edges: current.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)) }))
    if (removed.has(selectedNodeId)) setSelectedNodeId('')
  }
  function removeEdges(ids: string[]) {
    const removed = new Set(ids)
    setDraft((current) => ({ ...current, edges: current.edges.filter((edge) => !removed.has(edge.id)) }))
    if (removed.has(selectedEdgeId)) setSelectedEdgeId('')
    setEdgeMenu(null)
  }
  function addNode(type: WorkflowNodeType) {
    const id = crypto.randomUUID()
    const node: WorkflowNode = { id, type, title: META[type].label, position: { x: 100 + (draft.nodes.length % 3) * 390, y: 100 + Math.floor(draft.nodes.length / 3) * 250 }, ...(type === 'output' ? { outputFormat: 'markdown' } : {}) }
    setDraft((current) => ({ ...current, nodes: [...current.nodes, node] })); setSelectedNodeId(id); setDock('')
  }
  function changeNodes(changes: NodeChange<WorkflowFlowNode>[]) {
    const removed = changes.filter((change) => change.type === 'remove').map((change) => change.id)
    if (removed.length) removeNodes(removed)
    const positions = new Map<string, { x: number; y: number }>()
    for (const change of changes) if (change.type === 'position' && change.position) positions.set(change.id, change.position)
    if (positions.size) setDraft((current) => ({ ...current, nodes: current.nodes.map((node) => positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node) }))
  }
  function connect(connection: Connection) {
    if (!connection.source || !connection.target || connection.source === connection.target || createsCycle(connection.source, connection.target, draft.edges)) return
    if (draft.edges.some((edge) => edge.source === connection.source && edge.target === connection.target)) return
    setDraft((current) => ({ ...current, edges: [...current.edges, { id: crypto.randomUUID(), source: connection.source!, target: connection.target! }] }))
  }
  async function save(runAfter = false) {
    let savedId = draft.id
    const items = await window.stable.workflows.save(draft)
    update(items)
    const saved = (savedId ? items.find((item) => item.id === savedId) : items.find((item) => item.name === draft.name)) || items[0]
    if (!saved) return
    savedId = saved.id; setSelectedId(saved.id); setDraft(cloneWorkflow(saved))
    if (runAfter) {
      setStatuses({}); setArtifacts([])
      const result = await window.stable.workflows.run(savedId)
      update(result.workflows)
      if (!result.cancelled) setArtifacts(result.artifacts || [])
    }
  }
  async function generate() {
    const next = await window.stable.workflows.generate(goal)
    setSelectedId(''); setDraft(next); setSelectedNodeId(''); setArtifacts([]); setDock(''); setGoal('')
  }
  async function enhanceSelectedNode() {
    const node = selectedTextNode
    const request = editorPrompt.trim()
    if (!node || !request || enhancementRunsRef.current.has(node.id)) return
    enhancementRunsRef.current.add(node.id)
    setEnhancingNodeIds((current) => new Set(current).add(node.id))
    setPromptErrors((current) => { const next = { ...current }; delete next[node.id]; return next })
    setEditorPrompt('')
    try {
      const instruction = await window.stable.workflows.enhanceInstruction({ type: node.type, title: node.title, instruction: node.instruction }, request, editorEffort)
      updateNode(node.id, { instruction })
    } catch (reason) {
      setPromptErrors((current) => ({ ...current, [node.id]: reason instanceof Error ? reason.message : String(reason) }))
    } finally {
      enhancementRunsRef.current.delete(node.id)
      setEnhancingNodeIds((current) => { const next = new Set(current); next.delete(node.id); return next })
    }
  }
  async function removeWorkflow() {
    if (!draft.id) return
    const items = await window.stable.workflows.remove(draft.id); update(items)
    const next = items[0]; setSelectedId(next?.id || ''); setDraft(cloneWorkflow(next || emptyWorkflow())); setSelectedNodeId(''); setArtifacts([]); setDock(''); setLibraryOpen(false)
  }

  const workflowRunning = busy === '运行工作流' || Object.values(statuses).some((event) => ['running', 'waiting'].includes(event.status))
  useEffect(() => {
    if (!workflowRunning) return
    let elapsedSeconds = 0
    const updateSpeed = () => {
      const rate = Math.min(10, 1 + elapsedSeconds)
      for (const element of canvasRef.current?.querySelectorAll('.workflow-flow-streak') || []) {
        for (const animation of element.getAnimations()) animation.updatePlaybackRate(rate)
      }
    }
    const frame = window.requestAnimationFrame(updateSpeed)
    const timer = window.setInterval(() => { elapsedSeconds += 1; updateSpeed() }, 1000)
    return () => { window.cancelAnimationFrame(frame); window.clearInterval(timer) }
  }, [workflowRunning])
  const flowNodes = useMemo<WorkflowFlowNode[]>(() => {
    const modules: ModuleFlowNode[] = draft.nodes.map((item) => ({
      id: item.id, type: 'module', position: item.position, selected: item.id === selectedNodeId,
      data: { item, status: statuses[item.id], enhancing: enhancingNodeIds.has(item.id), promptError: promptErrors[item.id], resources, onUpdate: updateNode, onRemove: (id: string) => removeNodes([id]) },
    }))
    const exits: ExitFlowNode[] = artifacts.flatMap((artifact) => {
      const output = draft.nodes.find((node) => node.id === artifact.nodeId && node.type === 'output')
      return output ? [{ id: `exit-${artifact.nodeId}`, type: 'exit', position: { x: output.position.x + 416, y: output.position.y }, data: { artifact }, draggable: false, deletable: false, selectable: false }] : []
    })
    return [...modules, ...exits]
  }, [draft.nodes, selectedNodeId, statuses, enhancingNodeIds, promptErrors, resources, artifacts])
  const flowEdges = useMemo<Edge[]>(() => [
    ...draft.edges.map((edge) => ({ ...edge, type: 'workflow', selected: edge.id === selectedEdgeId, animated: workflowRunning, className: 'workflow-connection' })),
    ...artifacts.map((artifact) => ({ id: `exit-edge-${artifact.nodeId}`, source: artifact.nodeId, target: `exit-${artifact.nodeId}`, type: 'workflow', selectable: false, deletable: false, className: 'workflow-connection workflow-exit-connection' })),
  ], [draft.edges, selectedEdgeId, workflowRunning, artifacts])
  const selectedNodeEnhancing = Boolean(selectedTextNode && enhancingNodeIds.has(selectedTextNode.id))
  const defaultModel = state.models.items.find((item) => item.id === state.models.defaultModelId) || state.models.items[0]

  return <section className="workflow-studio reveal">
    <header className="workflow-studio-head">
      <div className="workflow-title-fields"><input value={draft.name} aria-label="工作流名称" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><input value={draft.description} aria-label="工作流说明" placeholder="说明这个流程会完成什么" onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div>
      <div className="button-row"><button className="button" onClick={() => void action('保存工作流', () => save())}><Save size={16} />保存</button>{workflowRunning ? <button className="button danger" onClick={() => void window.stable.workflows.cancel()}><CircleStop size={16} />停止</button> : <button className="button primary" disabled={!draft.nodes.length} onClick={() => void action('运行工作流', () => save(true))}><Play size={16} />运行</button>}</div>
    </header>

    <div className="workflow-canvas" ref={canvasRef}>
      <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES} fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.35} maxZoom={1.6}
        onInit={(instance) => { flowRef.current = instance }}
        onNodeClick={(_event, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(''); setEdgeMenu(null); setEditorExpanded(false); positionEditor(node.id) }} onPaneClick={() => { setSelectedNodeId(''); setSelectedEdgeId(''); setEdgeMenu(null); setEditorExpanded(false); setDock(''); setLibraryOpen(false) }}
        onNodeDrag={(_event, node) => { if (node.id === selectedEditorNodeId && !editorExpanded) positionEditor(node.id) }} onMove={() => { if (selectedEditorNodeId && !editorExpanded) positionEditor(selectedEditorNodeId) }}
        onEdgeClick={(_event, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(''); setEdgeMenu(null) }}
        onEdgeContextMenu={(event, edge) => { event.preventDefault(); const rect = canvasRef.current?.getBoundingClientRect(); if (rect) setEdgeMenu({ id: edge.id, left: event.clientX - rect.left, top: event.clientY - rect.top }); setSelectedEdgeId(edge.id); setSelectedNodeId('') }}
        onNodesChange={changeNodes} onNodesDelete={(nodes) => removeNodes(nodes.map((node) => node.id))}
        onEdgesDelete={(edges) => removeEdges(edges.map((edge) => edge.id))}
        onConnect={connect} deleteKeyCode={['Backspace', 'Delete']}>
        <Background gap={22} size={1} />
      </ReactFlow>
      {selectedTextNode && editorPosition && <div className="workflow-node-editor" data-expanded={editorExpanded || undefined} style={editorExpanded ? undefined : editorPosition} role="dialog" aria-label={`${selectedTextNode.title} AI 指令编辑器`}>
        <button className="workflow-editor-expand" type="button" aria-label={editorExpanded ? '收起输入框' : '放大输入框'} onClick={() => setEditorExpanded((current) => !current)}>{editorExpanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
        <textarea className="nodrag nopan nowheel" value={editorPrompt} autoFocus rows={4} aria-label="模块 AI 输入" placeholder="输入关键词或修改要求，AI 会补充为可执行指令" onChange={(event) => setEditorPrompt(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!selectedNodeEnhancing && editorPrompt.trim()) void enhanceSelectedNode() } }} />
        <div className="workflow-editor-footer"><button className="workflow-editor-model" type="button" title="当前模型可在设置中切换"><Sparkles size={15} /><span>{defaultModel ? `${defaultModel.displayName} · ${defaultModel.model}` : '尚未配置模型'}</span></button><div><select value={editorEffort} aria-label="AI 处理深度" title="AI 处理深度" onChange={(event) => setEditorEffort(event.target.value as typeof editorEffort)}><option value="fast">快速</option><option value="standard">标准</option><option value="deep">深入</option></select><button className="workflow-editor-send" type="button" aria-label="提交给 AI" disabled={selectedNodeEnhancing || !editorPrompt.trim()} onClick={() => void enhanceSelectedNode()}><ArrowUp size={18} /></button></div></div>
      </div>}
      {edgeMenu && <div className="workflow-edge-menu" style={{ left: edgeMenu.left, top: edgeMenu.top }} role="menu"><button type="button" role="menuitem" onClick={() => removeEdges([edgeMenu.id])}><Trash2 size={15} />删除连接</button></div>}
      {!draft.nodes.length && <div className="workflow-canvas-empty"><Bot size={28} /><strong>添加第一个模块</strong><span>从底部工具栏添加模块，或让 AI 生成完整工作流。</span></div>}

      <div className="workflow-dock-wrap">
        {dock === 'modules' && <div className="workflow-dock-popover workflow-module-menu"><strong>添加模块</strong>{(Object.keys(META) as WorkflowNodeType[]).map((type) => { const Icon = META[type].icon; return <button key={type} onClick={() => addNode(type)}><Icon size={17} /><span><b>{META[type].label}</b><small>{META[type].placeholder}</small></span></button> })}</div>}
        {dock === 'ai' && <div className="workflow-dock-popover workflow-ai-popover"><strong>AI 生成工作流</strong><textarea value={goal} rows={4} autoFocus placeholder="描述目标、需要使用的资源和最终输出" onChange={(event) => setGoal(event.target.value)} /><button className="button primary" disabled={Boolean(busy) || !goal.trim()} onClick={() => void action('AI 正在编排工作流', generate)}><Sparkles size={16} />生成工作流</button></div>}
        {dock === 'workflows' && <div className="workflow-dock-popover workflow-library-menu">
          <strong>工作流</strong>
          <button onClick={() => { setSelectedId(''); setDraft(emptyWorkflow()); setSelectedNodeId(''); setArtifacts([]); setDock('') }}><Plus size={17} /><span><b>新建工作流</b><small>创建未保存的空白画布</small></span></button>
          <button data-active={libraryOpen || undefined} onClick={() => setLibraryOpen((current) => !current)}><Library size={17} /><span><b>工作流库</b><small>{state.workflows.length} 个已保存工作流</small></span><ChevronRight size={16} /></button>
          <button disabled={!draft.id} onClick={() => void action('删除工作流', removeWorkflow)}><Trash2 size={17} /><span><b>删除当前工作流</b><small>只删除当前已保存版本</small></span></button>
        </div>}
        {dock === 'workflows' && libraryOpen && <div className="workflow-library-picker"><strong>工作流库</strong><div>{state.workflows.map((item) => <button key={item.id} data-active={selectedId === item.id} onClick={() => selectWorkflow(item)}><span><b>{item.name}</b><small>{item.nodes.length} 个模块 · {item.lastStatus === 'completed' ? '已完成' : item.lastStatus === 'failed' ? '运行失败' : '未运行'}</small></span></button>)}{!state.workflows.length && <p>还没有保存的工作流。</p>}</div></div>}
        <nav className="workflow-dock" aria-label="工作流工具栏">
          <button data-active={dock === 'modules'} aria-label="添加模块" title="添加模块" onClick={() => { setDock((current) => current === 'modules' ? '' : 'modules'); setLibraryOpen(false) }}>{dock === 'modules' ? <X size={23} /> : <Plus size={23} />}</button>
          <button data-active={dock === 'ai'} aria-label="AI 生成工作流" title="AI 生成工作流" onClick={() => { setDock((current) => current === 'ai' ? '' : 'ai'); setLibraryOpen(false) }}><WandSparkles size={20} /></button>
          <button data-active={dock === 'workflows'} aria-label="工作流库" title="工作流库" onClick={() => { setDock((current) => current === 'workflows' ? '' : 'workflows'); setLibraryOpen(false) }}><Network size={20} /></button>
          <button disabled aria-label="资源库（即将开放）" title="资源库（即将开放）"><Box size={20} /></button>
          <button disabled aria-label="检查（即将开放）" title="检查（即将开放）"><Glasses size={20} /></button>
          <button disabled aria-label="历史（即将开放）" title="历史（即将开放）"><Clock3 size={20} /></button>
          <span aria-hidden="true" />
          <button disabled aria-label="快捷键（即将开放）" title="快捷键（即将开放）"><Keyboard size={20} /></button>
          <button disabled aria-label="帮助（即将开放）" title="帮助（即将开放）"><CircleHelp size={20} /></button>
        </nav>
      </div>
    </div>
  </section>
}
