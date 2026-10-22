import { useEffect, useRef, useState } from 'react'
import { Activity, Check, CircleStop, Database, FilePlus2, FolderInput, Library, LoaderCircle, Pencil, Play, Save, SendHorizontal, Sparkles, Trash2, Wrench, X } from 'lucide-react'
import type { DataItem, DataLibraryCategory, DataLibraryItem, LibraryRunStatus } from '../types'
import { DropTarget, PageLead, ResourceRow, Empty } from '../components/ResourcePrimitives'
import { MarkdownContent } from '../components/MarkdownContent'
import { errorMessage, formatBytes, formatLocalTime } from '../shared/format'
type DataSection = 'database' | DataLibraryCategory

const DATA_SECTIONS: Array<{ id: DataSection; label: string; detail: string; icon: typeof Database }> = [
  { id: 'database', label: '数据库', detail: '本地资料', icon: Database },
  { id: 'collection', label: '数据采集', detail: '执行脚本', icon: Activity },
  { id: 'cleaning', label: '数据清洗', detail: '执行脚本', icon: Sparkles },
  { id: 'processing', label: '数据加工', detail: 'Markdown', icon: Library },
]

const RUN_STATUS_LABEL: Record<LibraryRunStatus, string> = {
  idle: '未运行', running: '运行中', completed: '已完成', failed: '失败', cancelled: '已停止',
}

export function DataPage({ dataItems, libraryItems, updateData, updateLibrary, action }: {
  dataItems: DataItem[]
  libraryItems: DataLibraryItem[]
  updateData: (items: DataItem[]) => void
  updateLibrary: (items: DataLibraryItem[]) => void
  action: (label: string, run: () => Promise<void>) => Promise<void>
}) {
  const [section, setSection] = useState<DataSection>('database')
  const [runningId, setRunningId] = useState('')
  const [logId, setLogId] = useState('')
  const [logs, setLogs] = useState<Record<string, string>>({})
  const [markdownId, setMarkdownId] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [scriptInput, setScriptInput] = useState('')
  const [inputState, setInputState] = useState<'idle' | 'sending' | 'error' | 'success'>('idle')
  const [inputMessage, setInputMessage] = useState('输入回答后按 Enter 发送；只按 Enter 可提交空回答。')
  const libraryRef = useRef(libraryItems)
  const logsRef = useRef(logs)
  libraryRef.current = libraryItems
  logsRef.current = logs

  useEffect(() => window.stable.library.onEvent((event) => {
    const decoratedChunk = event.stream === 'stderr'
      ? `[错误] ${event.chunk}`
      : event.stream === 'status'
        ? `${event.status === 'running' ? '' : '\n'}${event.chunk}${event.chunk.endsWith('\n') ? '' : '\n'}`
        : event.chunk
    const nextLog = `${logsRef.current[event.itemId] || ''}${decoratedChunk}`.slice(-120_000)
    logsRef.current = { ...logsRef.current, [event.itemId]: nextLog }
    setLogs(logsRef.current)
    if (libraryRef.current.find((item) => item.id === event.itemId)?.kind === 'script') setLogId(event.itemId)
    if (event.status) {
      updateLibrary(libraryRef.current.map((item) => item.id === event.itemId ? {
        ...item,
        lastStatus: event.status!,
        lastOutput: event.status === 'running' ? '' : nextLog,
        lastRunAt: new Date(event.time).toISOString(),
      } : item))
      if (event.status === 'running') {
        setRunningId(event.itemId)
        setInputState('idle')
        setInputMessage('输入回答后按 Enter 发送；只按 Enter 可提交空回答。')
      } else {
        setRunningId('')
        setInputState(event.status === 'completed' ? 'success' : 'idle')
        setInputMessage(event.status === 'completed' ? '脚本已完成，不再接收输入。' : '脚本已停止，不再接收输入。')
      }
    }
  }), [])

  const selectedMarkdown = libraryItems.find((item) => item.id === markdownId && item.kind === 'markdown')
  useEffect(() => {
    if (!selectedMarkdown) return
    setDraft(selectedMarkdown.content)
    setEditing(false)
  }, [selectedMarkdown?.id])

  const categoryItems = section === 'database' ? [] : libraryItems.filter((item) => item.category === section)
  const logItem = libraryItems.find((item) => item.id === logId)
  const logContent = logId ? (logs[logId] || logItem?.lastOutput || '') : ''
  const sectionConfig = DATA_SECTIONS.find((item) => item.id === section) || DATA_SECTIONS[0]

  function importAssets(category: DataLibraryCategory) {
    void action(`正在导入${sectionConfig.label}`, async () => updateLibrary((await window.stable.library.importFiles(category)).items))
  }

  function removeAsset(item: DataLibraryItem) {
    void action(`正在删除 ${item.name}`, async () => {
      updateLibrary(await window.stable.library.remove(item.id))
      if (markdownId === item.id) setMarkdownId('')
      if (logId === item.id) setLogId('')
    })
  }

  async function runScript(item: DataLibraryItem) {
    setRunningId(item.id)
    setLogId(item.id)
    setLogs((current) => ({ ...current, [item.id]: '' }))
    logsRef.current = { ...logsRef.current, [item.id]: '' }
    setScriptInput('')
    setInputState('idle')
    setInputMessage('输入回答后按 Enter 发送；只按 Enter 可提交空回答。')
    try {
      await action(`正在运行 ${item.name}`, async () => {
        const result = await window.stable.library.run(item.id)
        updateLibrary(result.items)
      })
    } finally {
      setRunningId('')
    }
  }

  async function sendScriptInput(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!logId || runningId !== logId || inputState === 'sending') return
    setInputState('sending')
    setInputMessage('正在发送输入…')
    try {
      await window.stable.library.sendInput(logId, scriptInput)
      setScriptInput('')
      setInputState('success')
      setInputMessage('已发送，等待脚本继续输出。')
    } catch (reason) {
      setInputState('error')
      setInputMessage(errorMessage(reason))
    }
  }

  function importDropped(paths: string[]) {
    if (!paths.length) return
    void action(`正在导入${sectionConfig.label}`, async () => {
      if (section === 'database') updateData((await window.stable.data.importPaths(paths)).items)
      else updateLibrary((await window.stable.library.importPaths(section, paths)).items)
    })
  }

  return <DropTarget className="page-drop-target" label={`导入到${sectionConfig.label}`} onPaths={importDropped}><section className="data-hub reveal">
    <aside className="data-subnav" aria-label="数据分类">
      <div className="data-subnav-heading"><span>DATA HUB</span><strong>数据中心</strong></div>
      <nav>
        {DATA_SECTIONS.map(({ id, label, detail, icon: Icon }) => {
          const count = id === 'database' ? dataItems.length : libraryItems.filter((item) => item.category === id).length
          return <button key={id} data-active={section === id} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>
            <Icon size={18} strokeWidth={1.7} />
            <span><strong>{label}</strong><small>{detail}</small></span>
            <em>{count}</em>
          </button>
        })}
      </nav>
      <p>导入内容会复制到 Stable 私有目录，原始文件保持不变。</p>
    </aside>

    <div className="data-workspace">
      {section === 'database' ? <>
        <PageLead title="数据库" copy="导入文档和表格。Stable 在本机提取可检索文本，可按需启用给 Agent 调用。" action={<button className="button primary" onClick={() => void action('正在导入数据', async () => updateData((await window.stable.data.importFiles()).items))}><FilePlus2 size={17} />导入文件</button>} />
        {dataItems.length === 0 ? <Empty icon={Database} title="还没有本地数据" detail="支持 TXT、Markdown、CSV、JSON、PDF、DOCX、PPTX 和 Excel。" /> : <div className="resource-list">
          {dataItems.map((item) => <ResourceRow key={item.id} title={item.name} detail={`${item.type.toUpperCase()} · ${formatBytes(item.size)}`} enabled={item.enabled}
            onToggle={(enabled) => void action('正在更新数据状态', async () => updateData(await window.stable.data.setEnabled(item.id, enabled)))}
            onRemove={() => void action('正在移出数据', async () => updateData(await window.stable.data.remove(item.id)))} />)}
        </div>}
      </> : <>
        <PageLead
          title={sectionConfig.label}
          copy={section === 'processing' ? '集中保存可复用的数据加工说明、口径和模板，可直接预览与编辑。' : section === 'collection' ? '集中管理数据采集脚本。支持单文件、完整文件夹和 ZIP；运行时可在日志下方直接回答脚本问题。' : '集中管理数据清洗脚本。支持单文件、完整文件夹和 ZIP；切换页面后脚本仍会在后台继续运行。'}
          action={<button className="button primary" onClick={() => importAssets(section)}><FolderInput size={17} />{section === 'processing' ? '导入 Markdown' : '导入脚本或包'}</button>}
        />
        {categoryItems.length === 0 ? <Empty icon={sectionConfig.icon} title={`还没有${sectionConfig.label}资产`} detail={section === 'processing' ? '支持 MD 和 MARKDOWN 文件。' : '支持 Python、PowerShell、CMD 和 BAT 脚本。'} /> : <div className="library-grid">
          {categoryItems.map((item) => item.kind === 'script'
            ? <ScriptCard key={item.id} item={item} running={runningId === item.id} onRun={() => void runScript(item)} onLog={() => setLogId(item.id)} onRename={(name) => void action(`正在重命名 ${item.name}`, async () => updateLibrary(await window.stable.library.rename(item.id, name)))} onRemove={() => removeAsset(item)} />
            : <MarkdownCard key={item.id} item={item} selected={markdownId === item.id} onOpen={() => setMarkdownId(item.id)} onRemove={() => removeAsset(item)} />)}
        </div>}

        {logId && logItem?.kind === 'script' && logItem.category === section && <section className="asset-panel script-console" aria-live="polite">
          <div className="asset-panel-head">
            <div><span>RUN LOG</span><h3>{logItem?.name || '脚本日志'}</h3></div>
            <div className="button-row">{runningId === logId && <button className="button danger" onClick={() => window.stable.library.cancel()}><CircleStop size={16} />停止</button>}<button className="icon-button" onClick={() => setLogId('')} aria-label="关闭日志"><X size={17} /></button></div>
          </div>
          <pre>{logContent || (runningId === logId ? '等待脚本输出…' : '这次运行没有输出。')}</pre>
          {runningId === logId && <form className="script-input" data-state={inputState} onSubmit={(event) => void sendScriptInput(event)}>
            <label htmlFor={`script-input-${logId}`}>脚本输入</label>
            <div className="script-input-row">
              <input
                id={`script-input-${logId}`}
                value={scriptInput}
                onChange={(event) => { setScriptInput(event.target.value); if (inputState !== 'sending') setInputState('idle') }}
                placeholder="输入脚本要求的回答"
                autoComplete="off"
                aria-invalid={inputState === 'error' ? 'true' : undefined}
                aria-describedby={`script-input-help-${logId}`}
                disabled={inputState === 'sending'}
              />
              <button className="button primary" type="submit" data-state={inputState} disabled={inputState === 'sending'}>
                {inputState === 'sending' ? <LoaderCircle className="spin" size={16} /> : inputState === 'success' ? <Check size={16} /> : <SendHorizontal size={16} />}
                {inputState === 'sending' ? '发送中' : '发送'}
              </button>
            </div>
            <p id={`script-input-help-${logId}`} role={inputState === 'error' ? 'alert' : 'status'}>{inputMessage}</p>
          </form>}
        </section>}

        {section === 'processing' && selectedMarkdown && <section className="asset-panel markdown-panel">
          <div className="asset-panel-head">
            <div><span>MARKDOWN</span><h3>{selectedMarkdown.name}</h3></div>
            <div className="button-row">
              {editing ? <button className="button primary" onClick={() => void action('正在保存 Markdown', async () => { updateLibrary(await window.stable.library.saveMarkdown(selectedMarkdown.id, draft)); setEditing(false) })}><Save size={16} />保存</button> : <button className="button" onClick={() => setEditing(true)}><Pencil size={16} />编辑</button>}
              <button className="icon-button" onClick={() => setMarkdownId('')} aria-label="关闭 Markdown"><X size={17} /></button>
            </div>
          </div>
          {editing ? <textarea className="markdown-editor" value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="Markdown 内容" /> : <div className="markdown-preview"><MarkdownContent content={selectedMarkdown.content} /></div>}
        </section>}
      </>}
    </div>
  </section></DropTarget>
}

function ScriptCard({ item, running, onRun, onLog, onRename, onRemove }: { item: DataLibraryItem; running: boolean; onRun: () => void; onLog: () => void; onRename: (name: string) => void; onRemove: () => void }) {
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(item.name)

  useEffect(() => { if (!editingName) setNameDraft(item.name) }, [item.name, editingName])

  function commitName() {
    const name = nameDraft.trim()
    setEditingName(false)
    if (!name || name === item.name) { setNameDraft(item.name); return }
    onRename(name)
  }

  return <article className="library-card" data-status={item.lastStatus}>
    <div className="library-card-top"><span className="asset-type"><Wrench size={16} />{item.extension.toUpperCase()}</span><span className="asset-status">{running ? <LoaderCircle className="spin" size={13} /> : null}{RUN_STATUS_LABEL[running ? 'running' : item.lastStatus]}</span></div>
    <div className="library-card-copy">
      <div className="library-card-title">
        {editingName
          ? <input autoFocus maxLength={100} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onBlur={commitName} onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
            if (event.key === 'Escape') { event.preventDefault(); setNameDraft(item.name); setEditingName(false) }
          }} aria-label="脚本显示名称" />
          : <h3 title={item.name}>{item.name}</h3>}
        {!editingName && <button className="library-card-rename" disabled={running} onClick={() => setEditingName(true)} aria-label={`重命名 ${item.name}`} title="重命名"><Pencil size={15} /></button>}
      </div>
      <p>{item.description}</p>
    </div>
    <div className="library-card-meta"><span>{item.lastRunAt ? `上次 ${formatLocalTime(item.lastRunAt)}` : '尚未执行'}</span></div>
    <div className="library-card-actions"><button className="button primary" disabled={running} onClick={onRun}><Play size={16} />{running ? '运行中' : '运行'}</button>{item.lastRunAt && <button className="button" onClick={onLog}>日志</button>}<button className="icon-button" disabled={running} onClick={onRemove} aria-label={`删除 ${item.name}`}><Trash2 size={16} /></button></div>
  </article>
}

function MarkdownCard({ item, selected, onOpen, onRemove }: { item: DataLibraryItem; selected: boolean; onOpen: () => void; onRemove: () => void }) {
  return <article className="library-card" data-selected={selected || undefined}>
    <div className="library-card-top"><span className="asset-type"><Library size={16} />MD</span><span className="asset-status">本地文档</span></div>
    <button className="library-card-open" onClick={onOpen}><span>{item.name}</span><small>{item.description}</small></button>
    <div className="library-card-meta"><span>更新于 {formatLocalTime(item.updatedAt)}</span></div>
    <div className="library-card-actions"><button className="button primary" onClick={onOpen}>预览</button><button className="icon-button" onClick={onRemove} aria-label={`删除 ${item.name}`}><Trash2 size={16} /></button></div>
  </article>
}
