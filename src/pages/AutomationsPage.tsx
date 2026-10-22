import { useState } from 'react'
import { Activity, Clock3, MessageSquareText, Pencil, Play, Plus, Save, Sparkles, Trash2, X } from 'lucide-react'
import type { AutomationDraft, AutomationItem, AutomationSchedule, AutomationState } from '../types'
import { formatAutomationSchedule, formatLocalTime } from '../shared/format'
export function AutomationsPage({ state, update, goChat, action }: { state: AutomationState; update: (value: AutomationState) => void; goChat: () => void; action: (label: string, run: () => Promise<void>) => Promise<void> }) {
  const [tab, setTab] = useState<'configured' | 'history' | 'templates'>('configured')
  const [draft, setDraft] = useState<AutomationDraft>()
  const tomorrow = () => { const date = new Date(); date.setDate(date.getDate() + 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
  const newDraft = (): AutomationDraft => ({ title: '', prompt: '', schedule: { type: 'once', date: tomorrow(), time: '09:00' } })
  function changeType(type: AutomationSchedule['type']) {
    if (!draft) return
    const time = draft.schedule.time || '09:00'
    const schedule: AutomationSchedule = type === 'once' ? { type, date: tomorrow(), time }
      : type === 'daily' ? { type, time }
        : type === 'weekly' ? { type, time, weekdays: [1] }
          : { type, time, day: 1 }
    setDraft({ ...draft, schedule })
  }
  function saveDraft() {
    if (!draft) return
    void action('正在保存定时任务', async () => { update(await window.stable.automations.save(draft)); setDraft(undefined); setTab('configured') })
  }
  function edit(item: AutomationItem) { setDraft({ id: item.id, title: item.title, prompt: item.prompt, schedule: { ...item.schedule } as AutomationSchedule }) }
  return <section className="automations-page reveal">
    <header className="automations-head">
      <div><span>AUTOMATION</span><h1>定时</h1><p>Stable 开启期间按计划运行任务。退出软件后不在后台执行。</p></div>
      <div className="button-row"><button className="button" type="button" onClick={() => setDraft(newDraft())}><Plus size={16} />手动新建</button><button className="button primary" type="button" onClick={goChat}><MessageSquareText size={16} />在对话中创建</button></div>
    </header>
    <nav className="automation-tabs" aria-label="定时任务视图">
      <button data-active={tab === 'configured' || undefined} onClick={() => setTab('configured')}>已配置 <span>{state.items.length}</span></button>
      <button data-active={tab === 'history' || undefined} onClick={() => setTab('history')}>执行历史</button>
      <button data-active={tab === 'templates' || undefined} onClick={() => setTab('templates')}>任务模板</button>
    </nav>
    {tab === 'configured' && (state.items.length ? <div className="automation-grid">{state.items.map((item) => <article className="automation-card" key={item.id} data-enabled={item.enabled || undefined}>
      <header><span className="automation-card-icon"><Clock3 size={17} /></span><div><h2>{item.title}</h2><p>{formatAutomationSchedule(item.schedule)}</p></div><label className="switch"><input type="checkbox" checked={item.enabled} onChange={(event) => void action('正在更新定时任务', async () => update(await window.stable.automations.setEnabled(item.id, event.target.checked)))} /><span aria-hidden="true" /><em>{item.enabled ? '已启用' : '已暂停'}</em></label></header>
      <p className="automation-prompt">{item.prompt}</p>
      <div className="automation-meta"><span>下次运行</span><strong>{item.nextRunAt ? formatLocalTime(item.nextRunAt) : '暂无'}</strong><small data-status={item.lastStatus}>{item.lastStatus === 'running' ? '运行中' : item.lastStatus === 'completed' ? '上次成功' : item.lastStatus === 'failed' ? '上次失败' : item.source === 'chat' ? '由对话创建' : '手动创建'}</small></div>
      <footer><button className="text-button" type="button" disabled={item.lastStatus === 'running'} onClick={() => void action('正在运行定时任务', async () => update(await window.stable.automations.run(item.id)))}><Play size={15} />立即运行</button><span /><button className="icon-button" type="button" onClick={() => edit(item)} aria-label={`编辑 ${item.title}`}><Pencil size={15} /></button><button className="icon-button" type="button" disabled={item.lastStatus === 'running'} onClick={() => void action('正在删除定时任务', async () => update(await window.stable.automations.remove(item.id)))} aria-label={`删除 ${item.title}`}><Trash2 size={15} /></button></footer>
    </article>)}</div> : <div className="automation-empty"><Clock3 size={24} /><h2>尚未配置定时任务</h2><p>手动设置日期时间，或直接告诉 Stable 何时执行什么任务。</p><button className="button primary" onClick={() => setDraft(newDraft())}>手动新建</button></div>)}
    {tab === 'history' && (state.runs.length ? <div className="automation-history">{state.runs.map((run) => <article key={run.id}><span className="run-dot" data-status={run.status} /><div><strong>{run.title}</strong><p>{run.error || (run.result ? run.result.slice(0, 180) : '任务正在执行')}</p></div><div><span>{run.status === 'completed' ? '已完成' : run.status === 'running' ? '运行中' : run.status === 'cancelled' ? '已取消' : '失败'}</span><time>{formatLocalTime(run.startedAt)}</time></div></article>)}</div> : <div className="automation-empty"><Activity size={24} /><h2>还没有执行记录</h2><p>任务首次运行后，结果与错误会显示在这里。</p></div>)}
    {tab === 'templates' && <div className="automation-grid">{state.templates.map((template) => <article className="automation-card template" key={template.id}><header><span className="automation-card-icon"><Sparkles size={17} /></span><div><h2>{template.title}</h2><p>{formatAutomationSchedule(template.schedule)}</p></div></header><p className="automation-prompt">{template.description}</p><footer><span /><button className="button" type="button" onClick={() => setDraft({ title: template.title, prompt: template.prompt, schedule: { ...template.schedule } as AutomationSchedule })}>使用模板</button></footer></article>)}</div>}
    {draft && <div className="automation-editor-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setDraft(undefined) }}><section className="automation-editor" role="dialog" aria-modal="true" aria-labelledby="automation-editor-title">
      <header><div><span>AUTOMATION</span><h2 id="automation-editor-title">{draft.id ? '编辑定时任务' : '新建定时任务'}</h2></div><button className="icon-button" onClick={() => setDraft(undefined)} aria-label="关闭"><X size={17} /></button></header>
      <div className="field"><label htmlFor="automation-title">任务名称</label><input id="automation-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例如：每日工作摘要" /></div>
      <div className="field"><label htmlFor="automation-prompt">指定任务</label><textarea id="automation-prompt" rows={6} value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} placeholder="到点后让 Stable 执行什么？" /></div>
      <div className="automation-schedule-fields"><div className="field"><label htmlFor="automation-type">重复方式</label><select id="automation-type" value={draft.schedule.type} onChange={(event) => changeType(event.target.value as AutomationSchedule['type'])}><option value="once">仅一次</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></div>
        {draft.schedule.type === 'once' && <div className="field"><label htmlFor="automation-date">执行日期</label><input id="automation-date" type="date" value={draft.schedule.date} onChange={(event) => setDraft({ ...draft, schedule: { type: 'once', time: draft.schedule.time, date: event.target.value } })} /></div>}
        {draft.schedule.type === 'monthly' && <div className="field"><label htmlFor="automation-day">每月日期</label><input id="automation-day" type="number" min="1" max="31" value={draft.schedule.day} onChange={(event) => setDraft({ ...draft, schedule: { type: 'monthly', time: draft.schedule.time, day: Number(event.target.value) } })} /></div>}
        <div className="field"><label htmlFor="automation-time">执行时间</label><input id="automation-time" type="time" value={draft.schedule.time} onChange={(event) => setDraft({ ...draft, schedule: { ...draft.schedule, time: event.target.value } as AutomationSchedule })} /></div>
      </div>
      {draft.schedule.type === 'weekly' && <fieldset className="weekday-picker"><legend>每周执行日</legend>{['日','一','二','三','四','五','六'].map((label, day) => { const selected = draft.schedule.type === 'weekly' && draft.schedule.weekdays.includes(day); return <button type="button" data-active={selected || undefined} aria-pressed={selected} key={label} onClick={() => { if (draft.schedule.type !== 'weekly') return; const weekdays = selected ? draft.schedule.weekdays.filter((item) => item !== day) : [...draft.schedule.weekdays, day].sort(); setDraft({ ...draft, schedule: { ...draft.schedule, weekdays } }) }}>{label}</button> })}</fieldset>}
      <footer><button className="button" type="button" onClick={() => setDraft(undefined)}>取消</button><button className="button primary" type="button" disabled={!draft.title.trim() || !draft.prompt.trim()} onClick={saveDraft}><Save size={16} />保存任务</button></footer>
    </section></div>}
  </section>
}
