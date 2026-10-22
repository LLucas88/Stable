import { useEffect, useState } from 'react'
import { Braces, Eye, FileText, Trash2, X } from 'lucide-react'
import type { SkillItem } from '../types'
import { PageLead, Empty } from '../components/ResourcePrimitives'
import { formatLocalTime } from '../shared/format'
export function SkillsPage({ items, update, action }: { items: SkillItem[]; update: (items: SkillItem[]) => void; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  const [previewId, setPreviewId] = useState('')
  const preview = items.find((item) => item.id === previewId)
  useEffect(() => {
    if (!previewId) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreviewId('') }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [previewId])
  return <section className="library-page skill-library reveal">
    <PageLead title="Skills" copy="这里仅展示已由 Agent 安装的全局 Skills。发送完整 Skill 文件夹到对话，即可识别并安装。" action={<div className="skill-library-count"><Braces size={16} /><strong>{items.length}</strong><span>个已安装</span></div>} />
    {items.length === 0 ? <Empty icon={Braces} title="还没有已安装的 Skill" detail="前往对话，发送根目录中包含 SKILL.md 的完整文件夹。" /> : <div className="skill-card-grid">
      {items.map((item) => <article className="skill-card" key={item.id}>
        <div className="skill-card-top"><span className="skill-card-mark"><Braces size={18} /></span><span className="skill-scope">GLOBAL SKILL</span></div>
        <div className="skill-card-copy"><h3>{item.name}</h3><p>{item.description}</p></div>
        <div className="skill-card-meta"><FileText size={14} /><span>SKILL.md</span><span>·</span><time dateTime={item.createdAt}>安装于 {formatLocalTime(item.createdAt)}</time></div>
        <div className="skill-card-actions">
          <button className="skill-preview-button" type="button" onClick={() => setPreviewId(item.id)}><Eye size={16} />预览</button>
          <label className="switch"><input type="checkbox" checked={item.enabled} onChange={(event) => void action('正在更新 Skill 状态', async () => update(await window.stable.skills.setEnabled(item.id, event.target.checked)))} /><span aria-hidden="true" /><em>{item.enabled ? '已启用' : '未启用'}</em></label>
          <button className="icon-button" type="button" onClick={() => void action('正在移出 Skill', async () => { update(await window.stable.skills.remove(item.id)); if (previewId === item.id) setPreviewId('') })} aria-label={`移出 ${item.name}`}><Trash2 size={17} /></button>
        </div>
      </article>)}
    </div>}
    {preview && <div className="skill-preview-overlay" role="presentation" onMouseDown={() => setPreviewId('')}>
      <section className="skill-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="skill-preview-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>SKILL.md · RAW</span><h2 id="skill-preview-title">{preview.name}</h2></div><button className="icon-button" type="button" onClick={() => setPreviewId('')} aria-label="关闭 Skill 预览"><X size={18} /></button></header>
        <pre tabIndex={0}><code>{preview.content}</code></pre>
      </section>
    </div>}
  </section>
}
