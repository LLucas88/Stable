import { useEffect, useMemo, useState } from 'react'
import { BookOpenText, Eye, FileText, FolderInput, Trash2, Search } from 'lucide-react'
import type { KnowledgeDocument, KnowledgeItem } from '../types'
import { DropTarget } from '../components/ResourcePrimitives'
import { MarkdownContent } from '../components/MarkdownContent'
import { formatBytes, formatLocalTime } from '../shared/format'
export function KnowledgePage({ items, update, action }: {
  items: KnowledgeItem[]
  update: (items: KnowledgeItem[]) => void
  action: (label: string, run: () => Promise<void>) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [document, setDocument] = useState<KnowledgeDocument | null>(null)
  const visibleItems = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? items.filter((item) => `${item.name}\n${item.summary}`.toLowerCase().includes(term)) : items
  }, [items, query])

  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId)) { setSelectedId(''); setDocument(null) }
  }, [items, selectedId])

  useEffect(() => {
    if (selectedId || !items[0]) return
    setSelectedId(items[0].id)
    void window.stable.knowledge.get(items[0].id).then(setDocument)
  }, [items, selectedId])

  function openDocument(item: KnowledgeItem) {
    setSelectedId(item.id)
    void action('正在读取知识文档', async () => setDocument(await window.stable.knowledge.get(item.id)))
  }

  function toggleDocument(item: KnowledgeItem, enabled: boolean) {
    void action('正在更新知识调用状态', async () => {
      const next = await window.stable.knowledge.setEnabled(item.id, enabled)
      update(next)
      setDocument((current) => current?.id === item.id ? { ...current, enabled } : current)
    })
  }

  function removeDocument(item: KnowledgeItem) {
    void action('正在删除知识文档', async () => {
      const next = await window.stable.knowledge.remove(item.id)
      update(next)
      if (selectedId === item.id) { setSelectedId(''); setDocument(null) }
    })
  }

  return <DropTarget className="page-drop-target" label="导入知识库 Markdown" onPaths={(paths) => { if (paths.length) void action('正在导入知识库', async () => update((await window.stable.knowledge.importPaths(paths)).items)) }}><section className="knowledge-layout reveal">
    <div className="knowledge-toolbar">
      <div><h2>知识库</h2><p>管理本机 Markdown 文档，库内内容不会作为对话资料发送给模型。</p></div>
      <button className="button primary" onClick={() => void action('正在导入知识库', async () => update((await window.stable.knowledge.importFiles()).items))}><FolderInput size={17} />导入 Markdown</button>
    </div>
    <div className="knowledge-workbench">
      <aside className="knowledge-index">
        <label className="knowledge-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">搜索知识库</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或摘要" />
        </label>
        <div className="knowledge-count"><span>{visibleItems.length} 篇文档</span><span>{items.filter((item) => item.enabled).length} 篇可调用</span></div>
        {visibleItems.length === 0 ? <div className="knowledge-empty"><BookOpenText size={24} /><strong>{items.length ? '没有匹配文档' : '还没有知识文档'}</strong><span>{items.length ? '换一个关键词试试。' : '导入 Markdown 文件或文件夹。'}</span></div> : <div className="knowledge-list">
          {visibleItems.map((item) => <article className="knowledge-item" data-selected={selectedId === item.id || undefined} key={item.id}>
            <button className="knowledge-open" onClick={() => openDocument(item)}>
              <FileText size={18} aria-hidden="true" />
              <span><strong>{item.name}</strong><small>{item.summary}</small></span>
            </button>
            <div className="knowledge-item-actions">
              <label className="switch"><input type="checkbox" checked={item.enabled} onChange={(event) => toggleDocument(item, event.target.checked)} /><span aria-hidden="true" /><em>{item.enabled ? '可调用' : '未启用'}</em></label>
              <button className="icon-button" onClick={() => openDocument(item)} aria-label={`预览 ${item.name}`}><Eye size={16} /></button>
              <button className="icon-button" onClick={() => removeDocument(item)} aria-label={`删除 ${item.name}`}><Trash2 size={16} /></button>
            </div>
          </article>)}
        </div>}
      </aside>
      <article className="knowledge-reader">
        {document ? <>
          <header className="knowledge-reader-head">
            <div><span>MARKDOWN</span><h3>{document.name}</h3><p>{formatBytes(document.size)} · 更新于 {formatLocalTime(document.updatedAt)}</p></div>
            <span className="knowledge-call-state" data-enabled={document.enabled}>{document.enabled ? 'Agent 可调用' : '未启用调用'}</span>
          </header>
          <div className="knowledge-preview"><MarkdownContent content={document.content} /></div>
        </> : <div className="knowledge-reader-empty"><BookOpenText size={28} /><h2>选择一篇文档预览</h2><p>启用后的文档会按问题关键词加载相关片段，供 Agent 回答时使用。</p></div>}
      </article>
    </div>
  </section></DropTarget>
}
