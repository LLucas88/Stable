import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Database, Trash2, UploadCloud } from 'lucide-react'

export function DropTarget({ label, onPaths, className = '', children }: { label: string; onPaths: (paths: string[]) => void | Promise<void>; className?: string; children: ReactNode }) {
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  function pathsFromEvent(event: DragEvent<HTMLDivElement>) {
    return Array.from(event.dataTransfer.files).map((file) => window.stable.files.path(file)).filter(Boolean)
  }
  return <div
    className={`drop-target ${className}`.trim()}
    data-dragging={dragging || undefined}
    onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true) }}
    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
    onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragging(false) }}
    onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); void onPaths(pathsFromEvent(event)) }}
  >
    {children}
    {dragging && <div className="drop-overlay" role="status"><UploadCloud size={24} aria-hidden="true" /><strong>{label}</strong><span>松开即可继续</span></div>}
  </div>
}

export function PageLead({ title, copy, action, headingId }: { title: string; copy: string; action: React.ReactNode; headingId?: string }) {
  return <div className="page-lead"><div><h2 id={headingId}>{title}</h2><p>{copy}</p></div>{action}</div>
}

export function ResourceRow({ title, detail, enabled, onToggle, onRemove }: { title: string; detail: string; enabled: boolean; onToggle: (enabled: boolean) => void; onRemove: () => void }) {
  return <article className="resource-row">
    <div className="resource-main"><strong>{title}</strong><span>{detail}</span></div>
    <label className="switch"><input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} /><span aria-hidden="true" /><em>{enabled ? '已启用' : '未启用'}</em></label>
    <button className="icon-button" onClick={onRemove} aria-label={`移出 ${title}`}><Trash2 size={17} /></button>
  </article>
}

export function Empty({ icon: Icon, title, detail }: { icon: typeof Database; title: string; detail: string }) {
  return <div className="empty-state"><Icon size={26} strokeWidth={1.5} /><h2>{title}</h2><p>{detail}</p></div>
}
