import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import {
  ArrowLeft, Check, ChevronDown, ChevronUp, Code2, Database, Download, Eye, FileText,
  FolderInput, GripVertical, Pencil, Plus, Save, Sparkles, Table2, Trash2, Type,
} from 'lucide-react'
import reportStudioHtml from './assets/stable-report-studio.txt?raw'
import type { ReportComponent, ReportDraft, ReportIconName, ReportItem, ReportStudioProject, ReportTextVariant } from './types'

type Action = (label: string, run: () => Promise<void>) => Promise<void>

const iconOptions: Array<{ value: ReportIconName; label: string }> = [
  { value: 'chart', label: '图表' },
  { value: 'database', label: '数据' },
  { value: 'sparkles', label: '重点' },
  { value: 'check', label: '完成' },
]

const componentLabels = { text: '文字', table: '表格', icon: '图标', studio: '高级工程' } as const
type BuilderComponentType = Exclude<ReportComponent['type'], 'studio'>

function blankStudioProject(): ReportStudioProject {
  return { sections: [{ id: 'sec_default', name: '首页' }], blocks: [], currentSectionId: 'sec_default' }
}

function blankReport(): ReportDraft {
  return { name: '未命名报告', mode: 'studio', components: [{ id: crypto.randomUUID(), type: 'studio', project: blankStudioProject() }], html: '' }
}

function reportDraft(item: ReportItem): ReportDraft {
  return { id: item.id, name: item.name, mode: item.mode, components: item.components, html: item.html }
}

function studioProject(draft: ReportDraft) {
  const component = draft.components.find((item) => item.type === 'studio')
  return component?.type === 'studio' ? component.project : blankStudioProject()
}

function newComponent(type: BuilderComponentType): ReportComponent {
  if (type === 'text') return { id: crypto.randomUUID(), type, variant: 'body', content: '在这里填写报告内容。' }
  if (type === 'table') return { id: crypto.randomUUID(), type, rows: [['指标', '数值'], ['示例', '—']] }
  return { id: crypto.randomUUID(), type, icon: 'sparkles', title: '重点结论', caption: '在这里补充说明。' }
}

export function ReportPage({ items, update, action }: { items: ReportItem[]; update: (items: ReportItem[]) => void; action: Action }) {
  const [view, setView] = useState<'library' | 'editor'>('library')
  const [draft, setDraft] = useState<ReportDraft>(blankReport)
  const [previewHtml, setPreviewHtml] = useState('')
  const [dragId, setDragId] = useState('')
  const [studioDirty, setStudioDirty] = useState(false)
  const studioFrame = useRef<HTMLIFrameElement>(null)
  const pendingSnapshots = useRef(new Map<string, { resolve: (value: { project: ReportStudioProject; html: string }) => void; reject: (reason: Error) => void; timer: number }>())
  const sortedItems = useMemo(() => [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [items])

  useEffect(() => {
    if (view !== 'editor' || draft.mode === 'studio') return
    const timeout = window.setTimeout(() => {
      void window.stable.reports.render(draft).then(setPreviewHtml)
    }, 220)
    return () => window.clearTimeout(timeout)
  }, [draft, view])

  useEffect(() => {
    function receiveStudioMessage(event: MessageEvent) {
      const target = studioFrame.current?.contentWindow
      if (!target || event.source !== target || !event.data || typeof event.data !== 'object') return
      const message = event.data as { type?: string; requestId?: string; command?: string; project?: ReportStudioProject; html?: string }
      if (message.type === 'stable-report-ready') {
        target.postMessage({ type: 'stable-report-load', project: studioProject(draft) }, '*')
        setStudioDirty(false)
      }
      if (message.type === 'stable-report-dirty') setStudioDirty(true)
      if (message.type === 'stable-report-snapshot-result' && message.requestId) {
        const pending = pendingSnapshots.current.get(message.requestId)
        if (!pending) return
        window.clearTimeout(pending.timer)
        pendingSnapshots.current.delete(message.requestId)
        pending.resolve({ project: message.project || blankStudioProject(), html: String(message.html || '') })
      }
      if (message.type === 'stable-report-command') {
        if (message.command === 'library') setView('library')
        if (message.command === 'save') void persistStudio(false)
        if (message.command === 'export') void persistStudio(true)
      }
    }
    window.addEventListener('message', receiveStudioMessage)
    return () => window.removeEventListener('message', receiveStudioMessage)
  }, [draft])

  function requestStudioSnapshot() {
    const target = studioFrame.current?.contentWindow
    if (!target) return Promise.reject(new Error('报告编辑器尚未就绪。'))
    const requestId = crypto.randomUUID()
    return new Promise<{ project: ReportStudioProject; html: string }>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingSnapshots.current.delete(requestId)
        reject(new Error('读取报告工程超时，请重试。'))
      }, 5000)
      pendingSnapshots.current.set(requestId, { resolve, reject, timer })
      target.postMessage({ type: 'stable-report-snapshot', requestId }, '*')
    })
  }

  async function persistStudio(exportAfter: boolean) {
    const snapshot = await requestStudioSnapshot()
    await action(exportAfter ? '正在保存并导出 HTML 报告' : '正在保存报告工程', async () => {
      const component = draft.components.find((item) => item.type === 'studio')
      const nextDraft: ReportDraft = {
        ...draft,
        mode: 'studio',
        components: [{ id: component?.id || crypto.randomUUID(), type: 'studio', project: snapshot.project }],
        html: snapshot.html,
      }
      const result = await window.stable.reports.save(nextDraft)
      update(result.items)
      setDraft(reportDraft(result.item))
      setPreviewHtml(result.item.html)
      setStudioDirty(false)
      if (exportAfter) await window.stable.reports.export(result.item.id)
    })
  }

  function open(item?: ReportItem) {
    setDraft(item ? reportDraft(item) : blankReport())
    setPreviewHtml(item?.html || '')
    setStudioDirty(false)
    setView('editor')
  }

  function importFiles() {
    void action('正在导入 HTML 报告', async () => update((await window.stable.reports.importFiles()).items))
  }

  function importPaths(paths: string[]) {
    if (!paths.length) return
    void action('正在导入 HTML 报告', async () => update((await window.stable.reports.importPaths(paths)).items))
  }

  function save() {
    if (draft.mode === 'studio') { void persistStudio(false); return }
    void action('正在保存 HTML 报告', async () => {
      const result = await window.stable.reports.save(draft)
      update(result.items)
      setDraft(reportDraft(result.item))
      setPreviewHtml(result.item.html)
    })
  }

  function remove(item: ReportItem) {
    void action('正在删除报告', async () => update(await window.stable.reports.remove(item.id)))
  }

  function exportReport(item: ReportItem) {
    void action('正在导出 HTML 报告', async () => { await window.stable.reports.export(item.id) })
  }

  function add(type: BuilderComponentType) {
    setDraft((current) => ({ ...current, components: [...current.components, newComponent(type)] }))
  }

  function patchComponent(id: string, change: (component: ReportComponent) => ReportComponent) {
    setDraft((current) => ({ ...current, components: current.components.map((component) => component.id === id ? change(component) : component) }))
  }

  function move(id: string, direction: -1 | 1) {
    setDraft((current) => {
      const index = current.components.findIndex((component) => component.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.components.length) return current
      const components = [...current.components]
      ;[components[index], components[target]] = [components[target], components[index]]
      return { ...current, components }
    })
  }

  function dropBefore(targetId: string) {
    if (!dragId || dragId === targetId) return setDragId('')
    setDraft((current) => {
      const source = current.components.find((component) => component.id === dragId)
      if (!source) return current
      const without = current.components.filter((component) => component.id !== dragId)
      const target = without.findIndex((component) => component.id === targetId)
      without.splice(target < 0 ? without.length : target, 0, source)
      return { ...current, components: without }
    })
    setDragId('')
  }

  if (view === 'editor') return <section className="report-editor reveal" data-mode={draft.mode}>
    <header className="report-toolbar">
      <button className="button" type="button" onClick={() => setView('library')}><ArrowLeft size={17} />报告库</button>
      <div className="field grow"><label htmlFor="report-name">报告名称</label><input id="report-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
      {draft.mode === 'studio' && <span className="report-save-state" data-dirty={studioDirty || undefined}>{studioDirty ? '尚未保存' : '已保存'}</span>}
      <button className="button primary" type="button" onClick={save}><Save size={17} />保存 HTML</button>
      {draft.mode === 'studio' ? <button className="button" type="button" onClick={() => void persistStudio(true)}><Download size={17} />导出</button> : draft.id && items.some((item) => item.id === draft.id) && <button className="button" type="button" onClick={() => { const item = items.find((candidate) => candidate.id === draft.id); if (item) exportReport(item) }}><Download size={17} />导出</button>}
    </header>

    {draft.mode === 'studio' ? <div className="report-studio-frame">
      <iframe ref={studioFrame} title="Stable 高级报告编辑器" sandbox="allow-scripts allow-modals allow-downloads" srcDoc={reportStudioHtml} />
    </div> : draft.mode === 'source' ? <div className="report-source-layout">
      <div className="field report-source-field"><label htmlFor="report-source">HTML 源码</label><textarea id="report-source" value={draft.html} onChange={(event) => setDraft({ ...draft, html: event.target.value })} spellCheck={false} /></div>
      <ReportPreview html={previewHtml} />
    </div> : <div className="report-builder">
      <aside className="component-palette" aria-label="报告组件">
        <div><h2>添加组件</h2><p>按内容顺序加入画布，也可以拖动调整位置。</p></div>
        <button type="button" onClick={() => add('text')}><Type size={19} /><span><strong>文字</strong><small>标题或正文</small></span><Plus size={16} /></button>
        <button type="button" onClick={() => add('table')}><Table2 size={19} /><span><strong>表格</strong><small>手动编辑单元格</small></span><Plus size={16} /></button>
        <button type="button" onClick={() => add('icon')}><Sparkles size={19} /><span><strong>图标</strong><small>结论或提示块</small></span><Plus size={16} /></button>
      </aside>

      <div className="report-canvas" aria-label="报告内容画布">
        {draft.components.length === 0 ? <div className="report-canvas-empty"><FileText size={28} /><h2>画布还是空的</h2><p>从左侧添加文字、表格或图标组件。</p></div> : draft.components.map((component, index) => <article
          className="report-component"
          data-dragging={dragId === component.id || undefined}
          key={component.id}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
          onDrop={(event) => { event.preventDefault(); dropBefore(component.id) }}
        >
          <div className="report-component-head">
            <button className="report-grip" type="button" draggable onDragStart={(event: DragEvent<HTMLButtonElement>) => { event.dataTransfer.effectAllowed = 'move'; setDragId(component.id) }} onDragEnd={() => setDragId('')} aria-label={`拖动${componentLabels[component.type]}组件`}><GripVertical size={17} /></button>
            <strong>{String(index + 1).padStart(2, '0')} · {componentLabels[component.type]}</strong>
            <span className="component-spacer" />
            <button className="icon-button" type="button" onClick={() => move(component.id, -1)} disabled={index === 0} aria-label="上移组件"><ChevronUp size={16} /></button>
            <button className="icon-button" type="button" onClick={() => move(component.id, 1)} disabled={index === draft.components.length - 1} aria-label="下移组件"><ChevronDown size={16} /></button>
            <button className="icon-button" type="button" onClick={() => setDraft({ ...draft, components: draft.components.filter((item) => item.id !== component.id) })} aria-label="删除组件"><Trash2 size={16} /></button>
          </div>
          <ComponentEditor component={component} patch={(change) => patchComponent(component.id, change)} />
        </article>)}
      </div>
      <ReportPreview html={previewHtml} />
    </div>}
  </section>

  return <ReportDropTarget onPaths={importPaths}><section className="report-library reveal">
    <div className="report-library-lead">
      <div><h2>HTML 报告库</h2><p>保存、预览和编辑本地 HTML。高级编辑器支持分区、富文本、图表、KPI、表格、图片和分析框架组件。</p></div>
      <div className="button-row"><button className="button" type="button" onClick={importFiles}><FolderInput size={17} />导入 HTML</button><button className="button primary" type="button" onClick={() => open()}><Plus size={17} />新建报告</button></div>
    </div>
    {sortedItems.length === 0 ? <div className="report-empty"><FileText size={28} /><h2>还没有 HTML 报告</h2><p>新建一份组件报告，或把已有 HTML 拖到这里。</p><button className="button primary" type="button" onClick={() => open()}><Plus size={17} />新建报告</button></div> : <div className="report-index" aria-label="本地 HTML 报告">
      {sortedItems.map((item) => <article className="report-index-row" key={item.id}>
        <button className="report-index-open" type="button" onClick={() => open(item)}>
          {item.mode === 'source' ? <Code2 size={19} /> : <FileText size={19} />}
          <span><strong>{item.name}</strong><small>{item.mode === 'source' ? '导入的 HTML 源码' : item.mode === 'studio' ? 'Stable 高级编辑工程' : `${item.components.length} 个组件`} · 更新于 {new Date(item.updatedAt).toLocaleString('zh-CN')}</small></span>
        </button>
        <div className="report-index-actions">
          <button className="button" type="button" onClick={() => open(item)}><Eye size={16} />预览</button>
          <button className="icon-button" type="button" onClick={() => open(item)} aria-label={`编辑 ${item.name}`}><Pencil size={16} /></button>
          <button className="icon-button" type="button" onClick={() => exportReport(item)} aria-label={`导出 ${item.name}`}><Download size={16} /></button>
          <button className="icon-button" type="button" onClick={() => remove(item)} aria-label={`删除 ${item.name}`}><Trash2 size={16} /></button>
        </div>
      </article>)}
    </div>}
  </section></ReportDropTarget>
}

function ComponentEditor({ component, patch }: { component: ReportComponent; patch: (change: (component: ReportComponent) => ReportComponent) => void }) {
  if (component.type === 'studio') return null
  if (component.type === 'text') return <div className="component-editor-grid">
    <div className="field"><label htmlFor={`${component.id}-variant`}>文字样式</label><select id={`${component.id}-variant`} value={component.variant} onChange={(event) => patch((current) => current.type === 'text' ? { ...current, variant: event.target.value as ReportTextVariant } : current)}><option value="title">主标题</option><option value="heading">小节标题</option><option value="body">正文</option></select></div>
    <div className="field component-wide"><label htmlFor={`${component.id}-content`}>内容</label><textarea id={`${component.id}-content`} value={component.content} onChange={(event) => patch((current) => current.type === 'text' ? { ...current, content: event.target.value } : current)} /></div>
  </div>

  if (component.type === 'icon') return <div className="component-editor-grid">
    <div className="field"><label htmlFor={`${component.id}-icon`}>图标</label><select id={`${component.id}-icon`} value={component.icon} onChange={(event) => patch((current) => current.type === 'icon' ? { ...current, icon: event.target.value as ReportIconName } : current)}>{iconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
    <div className="field"><label htmlFor={`${component.id}-title`}>标题</label><input id={`${component.id}-title`} value={component.title} onChange={(event) => patch((current) => current.type === 'icon' ? { ...current, title: event.target.value } : current)} /></div>
    <div className="field component-wide"><label htmlFor={`${component.id}-caption`}>说明</label><textarea id={`${component.id}-caption`} value={component.caption} onChange={(event) => patch((current) => current.type === 'icon' ? { ...current, caption: event.target.value } : current)} /></div>
  </div>

  function setCell(rowIndex: number, columnIndex: number, value: string) {
    patch((current) => {
      if (current.type !== 'table') return current
      const rows = current.rows.map((row) => [...row])
      rows[rowIndex][columnIndex] = value
      return { ...current, rows }
    })
  }

  function resize(kind: 'row' | 'column', direction: 1 | -1) {
    patch((current) => {
      if (current.type !== 'table') return current
      const rows = current.rows.map((row) => [...row])
      if (kind === 'row') direction === 1 ? rows.push(Array(rows[0]?.length || 1).fill('')) : rows.length > 1 && rows.pop()
      else if (direction === 1) rows.forEach((row) => row.push(''))
      else if ((rows[0]?.length || 0) > 1) rows.forEach((row) => row.pop())
      return { ...current, rows }
    })
  }

  return <div className="table-component-editor">
    <div className="table-size-actions"><span>{component.rows.length} 行 · {component.rows[0]?.length || 0} 列</span><button className="button" type="button" onClick={() => resize('row', 1)}><Plus size={15} />行</button><button className="button" type="button" onClick={() => resize('row', -1)} disabled={component.rows.length <= 1}>减行</button><button className="button" type="button" onClick={() => resize('column', 1)}><Plus size={15} />列</button><button className="button" type="button" onClick={() => resize('column', -1)} disabled={(component.rows[0]?.length || 0) <= 1}>减列</button></div>
    <div className="table-cell-grid" style={{ '--report-columns': component.rows[0]?.length || 1 } as CSSProperties}>{component.rows.flatMap((row, rowIndex) => row.map((cell, columnIndex) => <input key={`${rowIndex}-${columnIndex}`} value={cell} onChange={(event) => setCell(rowIndex, columnIndex, event.target.value)} aria-label={`第 ${rowIndex + 1} 行第 ${columnIndex + 1} 列`} />))}</div>
  </div>
}

function ReportPreview({ html }: { html: string }) {
  return <aside className="report-preview-panel"><div className="report-preview-head"><Eye size={17} /><strong>实时预览</strong><span>脚本已禁用</span></div><iframe title="HTML 报告预览" sandbox="" srcDoc={html} /></aside>
}

function ReportDropTarget({ onPaths, children }: { onPaths: (paths: string[]) => void; children: ReactNode }) {
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  function paths(event: DragEvent<HTMLDivElement>) { return Array.from(event.dataTransfer.files).map((file) => window.stable.files.path(file)).filter(Boolean) }
  return <div className="report-drop-target" data-dragging={dragging || undefined} onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true) }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }} onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false) }} onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); onPaths(paths(event)) }}>{children}{dragging && <div className="drop-overlay" role="status"><FolderInput size={24} /><strong>导入 HTML 报告</strong><span>松开即可复制到 Stable</span></div>}</div>
}
