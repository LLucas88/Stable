import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { X, GripVertical, Pencil, MessageSquarePlus, ScanLine, Eraser, Scaling, Undo2, Redo2, Minus, Plus, LoaderCircle, Send, Download, Check } from 'lucide-react'
import type { EditPoint, EditStroke, ImageEditDraft, ImageEditView, EditResize } from './image-editor-types'
import { clamp, cropRect, imagePoint, strokeHit } from './shared/image-edit-geometry'
import { ComplexityControl,BackgroundControl,EditorExtra,IMAGE_MODELS } from './ImageParameters'
import './styles/image-editor.css'

type Tool = 'pen' | 'comment' | 'erase' | 'region' | 'resize' | null
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

export function ImageEditor({ conversationId, path, onClose }: { conversationId: string; path: string; onClose: () => void }) {
  const [view, setView] = useState<ImageEditView>(), [draft, setDraft] = useState<ImageEditDraft>()
  const [tool, setTool] = useState<Tool>(null), [zoom, setZoom] = useState(1), [compare, setCompare] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('')
  const [undo, setUndo] = useState<ImageEditDraft[]>([]), [redo, setRedo] = useState<ImageEditDraft[]>([])
  const [stroke, setStroke] = useState<EditStroke>(), [color, setColor] = useState('#fa5151'), [brush, setBrush] = useState(.006)
  const [extent, setExtent] = useState({ width: 800, height: 500 }), [position, setPosition] = useState({ x: 20, y: 20 })
  const [original, setOriginal] = useState('')
  const regionStart=useRef<EditPoint>(),regionNext=useRef<ImageEditDraft['region']>()
  const [regionPreview,setRegionPreview]=useState<ImageEditDraft['region']>()
  const stageRef = useRef<HTMLDivElement>(null), toolbarRef = useRef<HTMLDivElement>(null), imageRef = useRef<HTMLImageElement>(null), dialog = useRef<HTMLDivElement>(null)
  const draftRef = useRef(draft), viewRef = useRef(view), timer = useRef<ReturnType<typeof setTimeout>>(), writes = useRef<Promise<void>>(Promise.resolve())
  const drawing = useRef<EditStroke>(), drag = useRef<{ x: number; y: number; left: number; top: number }>(), moved = useRef(false), alive = useRef(true), submitting = useRef(false)
  draftRef.current = draft; viewRef.current = view
  const version = view?.versions.find(v => v.id === view.versionId)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    alive.current = true
    void window.stable.imageEditor.open(conversationId, path).then(v => { if (alive.current) install(v) }).catch(e => { if (alive.current) setError(errorText(e)) })
    dialog.current?.focus()
    return () => { alive.current = false; clearTimeout(timer.current); void persist().catch(() => {}); previous?.focus() }
  }, [conversationId, path])
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(() => {
      const size = { width: stage.clientWidth, height: stage.clientHeight }; setExtent(size)
      const w = toolbarRef.current?.offsetWidth || 600, h = toolbarRef.current?.offsetHeight || 52
      setPosition(p => moved.current ? { x: clamp(p.x, 8, Math.max(8, size.width - w - 8)), y: clamp(p.y, 8, Math.max(8, size.height - h - 8)) } : { x: Math.max(8, (size.width - w) / 2), y: Math.max(8, size.height - h - 16) })
    })
    observer.observe(stage); return () => observer.disconnect()
  }, [Boolean(view)])
  useEffect(() => {
    if (!draft || !view) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { void persist().catch(e => setError('草稿保存失败：' + errorText(e))) }, 350)
    return () => clearTimeout(timer.current)
  }, [draft, view?.versionId])

  function install(v: ImageEditView) {
    viewRef.current = v; draftRef.current = v.draft; setView(v); setDraft(v.draft); setUndo([]); setRedo([]); setCompare(false); setTool(null); setZoom(1)
    if (v.versionId === 'original') setOriginal(v.previewUrl)
    else void window.stable.agent.imagePreview(v.versions[0].path).then(url => { if (alive.current && viewRef.current?.id === v.id) setOriginal(url) }).catch(() => setOriginal(''))
  }
  async function persist() {
    clearTimeout(timer.current)
    const current = viewRef.current, value = draftRef.current
    if (!current || !value) return
    const write = writes.current.catch(() => {}).then(() => window.stable.imageEditor.save(current.id, current.versionId, value))
    writes.current = write; await write
  }
  function edit(next: ImageEditDraft, history = true) {
    if (!draft || busy) return
    if (history) { setUndo(list => [...list.slice(-29), draft]); setRedo([]) }
    const value = { ...next, requestId: crypto.randomUUID() }; draftRef.current = value; setDraft(value); setStatus(''); setError('')
  }
  function step(back: boolean) {
    const stack = back ? undo : redo, value = stack[stack.length - 1]
    if (!value || !draft) return
    if (back) { setUndo(stack.slice(0, -1)); setRedo(list => [...list, draft]) } else { setRedo(stack.slice(0, -1)); setUndo(list => [...list, draft]) }
    edit(value, false)
  }
  async function close() {
    if (submitting.current) return
    try { await persist(); onClose() } catch (e) { setError('无法保存草稿：' + errorText(e)) }
  }
  async function select(id: string) {
    if (!view || busy) return
    setBusy(true)
    try { await persist(); install(await window.stable.imageEditor.select(view.id, id)) } catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }
  function location(event: ReactPointerEvent<SVGSVGElement>) { return imagePoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect()) }
  function erase(p: EditPoint) {
    const current = draftRef.current
    if (!current || !version) return
    const rect = imageRef.current?.getBoundingClientRect(), radius = rect ? 12 * version.width / rect.width : 12
    const strokes = current.strokes.filter(s => !strokeHit(s, p, version.width, version.height, radius))
    if (strokes.length !== current.strokes.length) edit({ ...current, strokes })
  }
  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (busy || compare || !draft || event.button !== 0) return
    const p = location(event)
    if(tool==='region'){regionStart.current=p;regionNext.current=undefined;setRegionPreview(undefined);event.currentTarget.setPointerCapture(event.pointerId)}
    if (tool === 'pen' && draft.strokes.length < 100) { drawing.current = { points: [p], color, width: brush }; setStroke(drawing.current); event.currentTarget.setPointerCapture(event.pointerId) }
    if (tool === 'erase') { erase(p); event.currentTarget.setPointerCapture(event.pointerId) }
    if (tool === 'comment' && draft.comments.length < 12) {
      edit({ ...draft, comments: [...draft.comments, { ...p, text: '' }] })
      setTimeout(() => { const nodes = dialog.current?.querySelectorAll<HTMLTextAreaElement>('.image-edit-comment textarea'); nodes?.[nodes.length - 1]?.focus() }, 0)
    }
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (busy || compare || !event.buttons) return
    if(tool==='region'&&regionStart.current){const p=location(event),a=regionStart.current;regionNext.current={x:Math.min(p.x,a.x),y:Math.min(p.y,a.y),width:Math.abs(p.x-a.x),height:Math.abs(p.y-a.y)};setRegionPreview(regionNext.current);return}
    if (tool === 'erase') { erase(location(event)); return }
    if (!drawing.current || drawing.current.points.length >= 1500) return
    drawing.current = { ...drawing.current, points: [...drawing.current.points, location(event)] }; setStroke(drawing.current)
  }
  function pointerUp() { if(regionStart.current&&draft){if(regionNext.current&&regionNext.current.width>.002&&regionNext.current.height>.002)edit({...draft,region:regionNext.current});regionStart.current=undefined;regionNext.current=undefined;setRegionPreview(undefined)} if (drawing.current && draft) edit({ ...draft, strokes: [...draft.strokes, drawing.current] }); drawing.current = undefined; setStroke(undefined) }
  function resizeMode(mode: EditResize['mode']) {
    if (!draft || !version) return
    edit({ ...draft, resize: { mode, width: version.width, height: version.height, x: .5, y: .5, background: 'transparent' } })
  }
  function dimension(axis: 'width' | 'height', value: number) {
    if (!draft?.resize || !version) return
    const resize = { ...draft.resize, [axis]: value }
    if (resize.mode === 'scale') { if (axis === 'width') resize.height = Math.max(1, Math.round(value * version.height / version.width)); else resize.width = Math.max(1, Math.round(value * version.width / version.height)) }
    edit({ ...draft, resize })
  }
  function guide() {
    if (!draft || !version || !imageRef.current || (!draft.strokes.length && !draft.comments.length)) return undefined
    if (!imageRef.current.complete || imageRef.current.naturalWidth !== version.width) throw Error('图片尚未加载完成，请稍后提交。')
    const canvas = document.createElement('canvas'); canvas.width = version.width; canvas.height = version.height
    const ctx = canvas.getContext('2d')!
    if(draft.region)ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height)
    const unit = Math.min(canvas.width, canvas.height)
    for (const s of draft.strokes) {
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.width * unit; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath()
      s.points.forEach((p, i) => i ? ctx.lineTo(p.x * canvas.width, p.y * canvas.height) : ctx.moveTo(p.x * canvas.width, p.y * canvas.height)); ctx.stroke()
      if (s.points.length === 1) { ctx.beginPath(); ctx.arc(s.points[0].x * canvas.width, s.points[0].y * canvas.height, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill() }
    }
    draft.comments.forEach((c, i) => {
      const x = c.x * canvas.width, y = c.y * canvas.height, radius = unit * .022
      ctx.fillStyle = '#1769ff'; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'white'; ctx.font = `bold ${radius * 1.25}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, y)
    })
    return canvas.toDataURL('image/png')
  }
  async function submit() {
    if (!view || !draft || submitting.current) return
    submitting.current = true; setError(''); setStatus(''); setBusy(true)
    try { await persist(); const next = await window.stable.imageEditor.submit(view.id, view.versionId, draft, guide()); if (alive.current) { install(next); setStatus('新版本已生成。可对比原图，或保存到对话。') } }
    catch (e) { if (alive.current) setError(errorText(e) + ' 草稿已保留。') }
    finally { submitting.current = false; if (alive.current) setBusy(false) }
  }
  function moveToolbar(x: number, y: number) {
    moved.current = true
    setPosition({ x: clamp(x, 8, Math.max(8, extent.width - (toolbarRef.current?.offsetWidth || 0) - 8)), y: clamp(y, 8, Math.max(8, extent.height - (toolbarRef.current?.offsetHeight || 0) - 8)) })
  }
  const displayVersion = compare ? view?.versions[0] : version
  const fit = displayVersion ? Math.min(1, Math.max(100, extent.width - 80) / displayVersion.width, Math.max(100, extent.height - 110) / displayVersion.height) * zoom : 1
  const selectedRegion=regionPreview||draft?.region
  const rectangle = draft?.resize?.mode === 'crop' && version ? cropRect(draft.resize, version.width, version.height) : null
  const remote = Boolean(draft?.prompt || draft?.removeBackground || draft?.background && draft.background!=='auto' || draft?.comments.some(c => c.text))

  return <div ref={dialog} className="image-editor" role="dialog" aria-modal="true" aria-label="图片编辑" tabIndex={-1} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); void close() }
    if (event.key === 'Tab') {
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)') || []).filter(el => el.getClientRects().length)
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }}>
    <header className="image-edit-header"><div><strong>图片编辑</strong><span>{version ? `${version.width} × ${version.height} px` : '正在打开图片'}</span></div>
      {view && <select aria-label="图片版本" disabled={busy} value={view.versionId} onChange={e => void select(e.target.value)}>{view.versions.map(v => <option key={v.id} value={v.id}>{v.label}{v.accepted ? ' · 已保存' : ''}</option>)}</select>}
      <button type="button" disabled={busy || !original || view?.versionId === 'original'} aria-pressed={compare} onClick={() => setCompare(v => !v)}>{compare ? '查看编辑结果' : '对比原图'}</button>
      <button type="button" disabled={busy || !version} aria-label="下载当前图片" onClick={() => { if (version) void window.stable.agent.saveImageAs(version.path).catch(e => setError(errorText(e))) }}><Download size={18} /></button>
      <button type="button" disabled={busy} aria-label="关闭图片编辑" onClick={() => void close()}><X size={20} /></button>
    </header>
    <div className="image-edit-body"><div ref={stageRef} className="image-edit-stage">
      <div className="image-edit-scroll"><div className="image-edit-canvas" style={displayVersion ? { width: displayVersion.width * fit, height: displayVersion.height * fit } : undefined}>
        {view && <img ref={imageRef} draggable={false} src={compare ? original : view.previewUrl} alt={compare ? '原图对比' : '当前编辑图片'} />}
        {version && !compare && <svg viewBox={`0 0 ${version.width} ${version.height}`} className="image-edit-overlay" data-tool={tool || 'view'} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { regionStart.current=undefined;regionNext.current=undefined;setRegionPreview(undefined);drawing.current = undefined; setStroke(undefined) }} aria-label="图片标注画布">
          {[...(draft?.strokes || []), ...(stroke ? [stroke] : [])].map((s, i) => <g key={i} fill={s.color} stroke={s.color} strokeWidth={s.width * Math.min(version.width, version.height)} strokeLinecap="round" strokeLinejoin="round">{s.points.length === 1 ? <circle cx={s.points[0].x * version.width} cy={s.points[0].y * version.height} r={s.width * Math.min(version.width, version.height) / 2} stroke="none" /> : <polyline fill="none" points={s.points.map(p => `${p.x * version.width},${p.y * version.height}`).join(' ')} />}</g>)}
          {draft?.comments.map((c, i) => <g key={i} transform={`translate(${c.x * version.width},${c.y * version.height})`}><circle r={Math.min(version.width, version.height) * .022} fill="#1769ff" /><text textAnchor="middle" dominantBaseline="central" fontSize={Math.min(version.width, version.height) * .028} fill="white">{i + 1}</text></g>)}
          {selectedRegion&&<rect x={selectedRegion.x*version.width} y={selectedRegion.y*version.height} width={selectedRegion.width*version.width} height={selectedRegion.height*version.height} fill="#1769ff18" stroke="#1769ff" strokeWidth={2/fit} strokeDasharray={`${8/fit} ${4/fit}`}/>}
          {rectangle && <rect {...rectangle} fill="#fff2" stroke="#fff" strokeWidth={2 / fit} strokeDasharray={`${8 / fit} ${4 / fit}`} />}
        </svg>}
      </div></div>
      {view && <div className="image-edit-floating" ref={toolbarRef} style={{ left: position.x, top: position.y }} role="toolbar" aria-label="图片编辑工具">
        <button type="button" className="image-edit-drag" aria-label="移动工具栏" title="拖动，或用方向键移动工具栏" onKeyDown={e => { const offset: Record<string, [number, number]> = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }; const d = offset[e.key]; if (d) { e.preventDefault(); moveToolbar(position.x + d[0], position.y + d[1]) } }} onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, left: position.x, top: position.y }; e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={e => { if (drag.current) moveToolbar(drag.current.left + e.clientX - drag.current.x, drag.current.top + e.clientY - drag.current.y) }} onPointerUp={() => { drag.current = undefined }} onPointerCancel={() => { drag.current = undefined }}><GripVertical size={18} /></button>
        <button type="button" disabled={busy || compare} aria-pressed={tool === 'pen'} onClick={() => setTool(tool === 'pen' ? null : 'pen')}><Pencil size={18} />标注</button>
        <button type="button" disabled={busy || compare} aria-pressed={tool === 'comment'} onClick={() => setTool(tool === 'comment' ? null : 'comment')}><MessageSquarePlus size={18} />添加评论</button>
        <button type="button" disabled={busy || compare} aria-pressed={draft?.removeBackground} onClick={() => draft && edit({ ...draft, removeBackground: !draft.removeBackground,background:!draft.removeBackground?'transparent':'auto',outputFormat:!draft.removeBackground&&draft.outputFormat==='jpeg'?'png':draft.outputFormat })}><ScanLine size={18} />移除背景</button>
        <button type="button" disabled={busy || compare} aria-pressed={tool === 'erase'} title="仅擦掉标注，不修改图片像素" onClick={() => setTool(tool === 'erase' ? null : 'erase')}><Eraser size={18} />擦除</button>
        <button type="button" disabled={busy || compare} aria-pressed={tool === 'region'} onClick={()=>setTool(tool==='region'?null:'region')}><ScanLine size={18}/>选区</button>
        <button type="button" disabled={busy || compare} aria-pressed={tool === 'resize'} onClick={() => setTool(tool === 'resize' ? null : 'resize')}><Scaling size={18} />调整大小</button>
      </div>}
      <div className="image-edit-view-controls"><button type="button" aria-label="缩小视图" onClick={() => setZoom(z => Math.max(.25, z - .25))}><Minus size={16} /></button><output>{Math.round(zoom * 100)}%</output><button type="button" aria-label="放大视图" onClick={() => setZoom(z => Math.min(4, z + .25))}><Plus size={16} /></button></div>
    </div>
    {draft && <aside className="image-edit-options"><div className="image-edit-history"><button type="button" disabled={busy || !undo.length} onClick={() => step(true)}><Undo2 size={16} />撤销</button><button type="button" disabled={busy || !redo.length} onClick={() => step(false)}><Redo2 size={16} />重做</button></div>
      <p className="image-edit-hint">{compare ? '正在查看原图。返回编辑结果后可继续修改。' : tool === 'erase' ? '点击或划过笔迹，仅擦除标注。' : tool === 'comment' ? '点击图片添加评论，编号与位置一起保存。' : tool === 'pen' ? '在图片上画线或圈选位置。标注仅用于说明修改位置。' : '选择工具，完成后统一提交修改。'}</p>
      {tool==='region'&&<><p>拖动框选修改区域。模型会参考蒙版；严格保留其他区域请开启编辑设置中的像素保留。</p><button type="button" disabled={busy} onClick={()=>edit({...draft,region:{x:.18,y:.2,width:.64,height:.35}})}>使用中心选区</button>{draft.region&&<button type="button" disabled={busy} onClick={()=>edit({...draft,region:undefined,keepOutside:false})}>清除选区</button>}</>}
      {tool === 'pen' && <div className="image-edit-brush"><label>颜色<input type="color" disabled={busy} value={color} onChange={e => setColor(e.target.value)} /></label><label>粗细<input type="range" min="0.002" max="0.025" step="0.001" value={brush} onChange={e => setBrush(+e.target.value)} /></label></div>}
      {draft.removeBackground && <p className="image-edit-chip">提交后移除背景，输出透明 PNG</p>}
      {tool === 'resize' && <fieldset disabled={busy||draft.keepOutside}><legend>调整大小</legend><select aria-label="尺寸处理方式" value={draft.resize?.mode || ''} onChange={e => e.target.value ? resizeMode(e.target.value as EditResize['mode']) : edit({ ...draft, resize: undefined })}><option value="">保持原尺寸</option><option value="scale">等比例缩放</option><option value="crop">裁剪</option><option value="pad">补边</option></select>
        {draft.resize && <><div className="image-edit-dimensions"><label>宽<input type="number" aria-label="目标宽度" min="1" max="8192" value={draft.resize.width} onChange={e => dimension('width', +e.target.value)} /></label><span>×</span><label>高<input type="number" aria-label="目标高度" min="1" max="8192" value={draft.resize.height} onChange={e => dimension('height', +e.target.value)} /></label></div>
          {draft.resize.mode !== 'scale' && <><label>水平位置<input aria-label="水平位置" type="range" min="0" max="1" step="0.01" value={draft.resize.x} onChange={e => edit({ ...draft, resize: { ...draft.resize!, x: +e.target.value } })} /></label><label>垂直位置<input aria-label="垂直位置" type="range" min="0" max="1" step="0.01" value={draft.resize.y} onChange={e => edit({ ...draft, resize: { ...draft.resize!, y: +e.target.value } })} /></label></>}
          {draft.resize.mode === 'pad' && <label>补边颜色<select value={draft.resize.background} onChange={e => edit({ ...draft, resize: { ...draft.resize!, background: e.target.value as 'white' | 'transparent' } })}><option value="transparent">透明</option><option value="white">白色</option></select></label>}
          <small>{draft.resize.mode === 'scale' ? '保持比例，只重采样像素。' : draft.resize.mode === 'crop' ? '虚线框内的内容会保留，不放大图片。' : '保持原图像素，在四周增加画布。'}</small></>}
      </fieldset>}
      {draft.resize && tool !== 'resize' && <p className="image-edit-chip">{({ scale: '缩放', crop: '裁剪', pad: '补边' })[draft.resize.mode]} → {draft.resize.width} × {draft.resize.height}</p>}
      {draft.comments.map((c, i) => <div className="image-edit-comment" key={i}><label>{i + 1} · 位置评论<textarea disabled={busy} aria-label={`评论 ${i + 1}`} maxLength={180} value={c.text} onChange={e => edit({ ...draft, comments: draft.comments.map((v, n) => n === i ? { ...v, text: e.target.value } : v) })} /></label><button type="button" disabled={busy} aria-label={`删除评论 ${i + 1}`} onClick={() => edit({ ...draft, comments: draft.comments.filter((_, n) => n !== i) })}><X size={15} /></button></div>)}
      <small className="image-edit-autosave">草稿按图片版本自动保存</small>
    </aside>}</div>
    <footer className="image-edit-footer">
      {error && <p role="alert" className="image-edit-error">{error}</p>}{status && <p role="status">{status}</p>}
      <textarea aria-label="描述修改内容" placeholder="描述修改内容，例如：把标注处的杯子换成白色，保留其他内容…" maxLength={1000} disabled={!draft || busy || compare} value={draft?.prompt || ''} onChange={e => draft && edit({ ...draft, prompt: e.target.value })} />
      <div className="image-edit-submit-row"><span>{remote ? '提交后调用图片编辑接口，按原尺寸适配，必要时补边；请对比检查结果。' : '尺寸处理在本地执行；标注和评论保留为草稿。'}</span>
        {draft&&<><ComplexityControl value={draft.complexity} onChange={complexity=>edit({...draft,complexity})} editor disabled={busy||compare} unsupported={!draft.model.startsWith('gpt-image-2.6-')}/><BackgroundControl value={draft.removeBackground?'transparent':draft.background||'auto'} onChange={background=>edit({...draft,background,removeBackground:background==='transparent'})} editor disabled={busy||compare} transparentSupported={draft.outputFormat!=='jpeg'}/><EditorExtra busy={busy||compare} value={draft} onChange={edit} connections={view?.connections}/></>}
        <select aria-label="图片编辑模型" disabled={busy} value={draft?.model || 'gpt-image-2.5-sunburst'} onChange={e => draft && edit({ ...draft, model: e.target.value,upstreamModel:undefined,complexity:e.target.value.startsWith('gpt-image-2.6-')?draft.complexity:undefined })}>{Object.entries(IMAGE_MODELS).filter(([id])=>id!=='glm-image').map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
        {version && version.id !== 'original' && <button type="button" disabled={busy || version.accepted} onClick={() => { if (view) void persist().then(() => window.stable.imageEditor.accept(view.id, version.id)).then(() => { setView(v => v && { ...v, versions: v.versions.map(item => item.id === version.id ? { ...item, accepted: true } : item) }); setStatus('已保存到对话，原图仍可在版本列表中查看。') }).catch(e => setError(errorText(e))) }}><Check size={17} />{version.accepted ? '已保存' : '保存到对话'}</button>}
        {busy ? <button type="button" onClick={() => view && void window.stable.imageEditor.cancel(view.id).then(() => setStatus('正在停止，草稿会保留。')).catch(e => setError(errorText(e)))}><LoaderCircle size={17} className="spin" />停止</button> : <button type="button" className="image-edit-submit" disabled={!draft || compare} onClick={() => void submit()}><Send size={17} />提交修改</button>}
      </div>
    </footer>
  </div>
}
