import { CheckCheck, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import type { ConversationItem, ProjectItem } from './types'

export function activityDateLabel(date: string, now = new Date()) {
  const value = new Date(date), today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = new Date(value.getFullYear(), value.getMonth(), value.getDate())
  const days = Math.round((today.getTime() - day.getTime()) / 86400000)
  if (!Number.isFinite(days)) return '更早'
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][value.getDay()]
  return `${value.getFullYear()}年${value.getMonth()+1}月`
}
export function ConversationActivity({ items, projects, activeId, running, unread, approvals, summaries, onSelect, onReadAll }: { items: ConversationItem[]; projects: ProjectItem[]; activeId: string; running: Record<string, boolean>; unread: ReadonlySet<string>; approvals: ReadonlySet<string>; summaries: Record<string, string>; onSelect: (item: ConversationItem) => void; onReadAll: () => void }) {
  const [onlyUnread, setOnlyUnread] = useState(false)
  const groups = new Map<string, ConversationItem[]>()
  const isPriority = (item: ConversationItem) => running[item.id] || approvals.has(item.id) || item.waitingForInput
  const sorted = items.filter(item=>!item.archivedAt && (!onlyUnread || unread.has(item.id) || isPriority(item))).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))
  for (const item of sorted) { const key = isPriority(item) ? '优先级' : activityDateLabel(item.updatedAt); groups.set(key, [...(groups.get(key)||[]), item]) }
  const ordered = [...groups].sort(([a],[b])=>a==='优先级'?-1:b==='优先级'?1:0)
  return <div className="conversation-activity-feed" aria-label="活动列表">
    <div className="activity-heading"><span>{onlyUnread ? '未读活动' : '所有活动'}</span><details><summary aria-label="活动选项"><MoreHorizontal size={16}/></summary><div className="activity-menu"><button type="button" onClick={()=>setOnlyUnread(v=>!v)}>{onlyUnread?'显示全部':'只看未读'}</button><button type="button" onClick={onReadAll}><CheckCheck size={14}/>全部标为已读</button></div></details></div>
    {!ordered.length && <p className="activity-empty">{onlyUnread?'没有未读活动':'任务活动会显示在这里'}</p>}
    {ordered.map(([label, list])=><section key={label} aria-label={label}><h3>{label}</h3>{list.map(item=>{
      const waiting = approvals.has(item.id) || item.waitingForInput, busy=running[item.id]
      const summary = waiting ? (approvals.has(item.id)?'需要你批准操作':'等待你补充信息') : summaries[item.id] || item.lastMessagePreview || (busy?'任务正在执行…':'暂无回复')
      return <button type="button" className="activity-row" data-active={activeId===item.id||undefined} data-conversation-id={item.id} key={item.id} onClick={()=>onSelect(item)}>
        <span className="activity-title"><span>{item.title}</span><small>{projects.find(p=>p.id===item.projectId)?.name}</small></span><span className="activity-summary">{summary}</span>
        {(busy||waiting||unread.has(item.id))&&<span className="activity-indicator" aria-label={waiting?'需要处理':busy?'任务执行中':'未读'}>{busy&&!waiting?<i className="conversation-spinner spin"/>:<i className={waiting?'conversation-approval-dot':'conversation-unread-dot'}/>}</span>}
      </button>
    })}</section>)}
  </div>
}
