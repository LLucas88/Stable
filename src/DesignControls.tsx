import { AtSign, ChevronDown, ImagePlus, MessageSquare, Layers, Link2, Unlink2, RectangleHorizontal, Type, WandSparkles } from 'lucide-react'
import type { DesignRequest } from './types'
import { useEffect, useRef, useState } from 'react'
import { DESIGN_SIZES, designDimensions, presetDesign, resizeDesign, type DesignRatio } from './shared/design-size'

function DesignSizeControls({ value, onChange }: { value: DesignRequest; onChange: (value: DesignRequest) => void }) {
  const [width, height] = designDimensions(value)
  const [draft, setDraft] = useState({ width: String(width), height: String(height) })
  const [notice, setNotice] = useState('')
  useEffect(() => { setDraft({ width: String(width), height: String(height) }) }, [width, height])
  const locked = value.aspectLocked !== false
  function commit(axis: 'width' | 'height') {
    const raw = draft[axis].trim() ? Number(draft[axis]) : NaN
    const next = resizeDesign(value, axis, raw), [w, h] = designDimensions(next)
    setDraft({ width: String(w), height: String(h) })
    setNotice(!Number.isFinite(raw) ? `已恢复为 ${w} × ${h} px` : `实际尺寸 ${w} × ${h} px${raw !== (axis === 'width' ? w : h) ? '（已自动调整）' : ''}`)
    onChange(next)
  }
  function choose(ratio: DesignRatio, resolution = value.resolution) {
    onChange(presetDesign(value, ratio, resolution)); setNotice('')
  }
  return <details className="composer-menu"><summary aria-label="图片尺寸"><RectangleHorizontal size={16}/>{value.ratio === 'custom' ? `${width} × ${height}` : `${value.ratio} · ${value.resolution === '2k' ? '2K' : '标准'}`}<ChevronDown size={12}/></summary>
    <div className="composer-popover design-size-popover">
      <strong>选择比例</strong><div className="design-ratio-options">{(Object.keys(DESIGN_SIZES) as DesignRatio[]).map(ratio => {
        const [w, h] = DESIGN_SIZES[ratio][0]
        return <button type="button" key={ratio} aria-pressed={value.ratio === ratio} onClick={() => choose(ratio)}><svg className="design-ratio-shape" aria-hidden="true" viewBox="0 0 24 24" width={22 * Math.min(1, w / h)} height={22 * Math.min(1, h / w)} preserveAspectRatio="none"><rect x="2" y="2" width="20" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg><span>{ratio}</span></button>
      })}</div>
      <strong>选择分辨率</strong><div className="design-resolution-options">{(['standard', '2k'] as const).map(resolution => <button type="button" key={resolution} aria-pressed={value.ratio !== 'custom' && value.resolution === resolution} onClick={() => {
        if (value.ratio !== 'custom') choose(value.ratio, resolution)
        else {
          const next = resizeDesign({ ...value, aspectLocked: true }, width >= height ? 'width' : 'height', resolution === '2k' ? 2048 : 1280)
          onChange({ ...next, resolution, aspectLocked: value.aspectLocked }); setNotice('')
        }
      }}>{resolution === '2k' ? '2K' : '标准'}</button>)}</div>
      <strong>尺寸</strong><div className="design-dimensions">
        {(['width', 'height'] as const).map((axis, index) => <div className="design-dimension-part" key={axis}>
          {index === 1 && <button type="button" className="design-aspect-lock" aria-label="锁定宽高比例" aria-pressed={locked} title={locked ? '解锁比例，可分别修改宽高' : '锁定当前宽高比例'} onClick={() => onChange({ ...value, aspectLocked: !locked })}>{locked ? <Link2 size={18}/> : <Unlink2 size={18}/>}</button>}
          <label><span>{index ? 'H' : 'W'}</span><input type="number" inputMode="numeric" min={512} max={2048} step={32} aria-label={index ? '图片高度' : '图片宽度'} value={draft[axis]} onFocus={event => event.currentTarget.select()} onChange={event => setDraft(current => ({ ...current, [axis]: event.target.value }))} onBlur={() => commit(axis)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur() } }}/></label>
        </div>)}<span className="design-pixel-unit">PX</span>
      </div>
      <p className="design-size-notice" aria-live="polite">{notice || '512–2048 px，自动对齐到 32 的倍数；锁定比例时同步调整。'}</p>
    </div>
  </details>
}

export const DEFAULT_DESIGN: DesignRequest = { model: 'glm-image', mode: 'generate', ratio: '1:1', resolution: 'standard', count: 1, text: '' }
export function DesignMessageParameters({ value }: { value?: DesignRequest }) {
  if (!value) return null
  const [width, height] = designDimensions(value)
  return <div className="design-message-parameters" aria-label="本条消息的图片参数"><span><ImagePlus size={13}/>图片生成</span><span>{width} × {height} px</span><span>{value.ratio === 'custom' ? '自定义' : value.resolution === '2k' ? '2K' : '标准'}</span><span>{value.count} 张</span></div>
}
export function DesignControls({ mode, onModeChange, value, onChange, references, onReference }: { mode: 'generate' | 'chat'; onModeChange: (mode: 'generate' | 'chat') => void; value: DesignRequest; onChange: (value: DesignRequest) => void; references: string[]; onReference: (index: number) => void }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const close = (event: PointerEvent) => { root.current?.querySelectorAll('details[open]').forEach(menu=>{if(!menu.contains(event.target as Node))(menu as HTMLDetailsElement).open=false}) }
    document.addEventListener('pointerdown',close)
    return ()=>document.removeEventListener('pointerdown',close)
  },[])
  const update = (change: Partial<DesignRequest>) => onChange({ ...value, ...change })
  return <div ref={root} className="design-controls" aria-label="图像生成参数" onKeyDown={event=>{if(event.key==='Escape'){const menu=(event.target as HTMLElement).closest('details');if(menu){menu.open=false;menu.querySelector('summary')?.focus();event.stopPropagation()}}}}>
    <details className="composer-menu design-mode-menu"><summary className="design-mode" aria-label="Design 输入模式">{mode === 'generate' ? <ImagePlus size={16}/> : <MessageSquare size={16}/>}{mode === 'generate' ? '图片生成' : '对话'}<ChevronDown size={12}/></summary><div className="composer-popover" role="menu" aria-label="选择输入模式">{(['generate','chat'] as const).map(item=><button type="button" className="composer-option" role="menuitemradio" aria-checked={mode===item} key={item} onClick={e=>{onModeChange(item);e.currentTarget.closest('details')!.open=false}}>{item === 'generate' ? <ImagePlus size={16}/> : <MessageSquare size={16}/>}<span>{item === 'generate' ? '图片生成' : '对话'}</span></button>)}</div></details>
    {mode === 'generate' && <>
    <details className="composer-menu"><summary><WandSparkles size={16}/>GLM-image<ChevronDown size={12}/></summary><div className="composer-popover"><strong>图像模型</strong><button type="button" className="composer-option" aria-pressed="true" onClick={e=>{e.currentTarget.closest('details')!.open=false}}>GLM-image ✓</button><p>使用已配置的智谱标准 API。对话模型负责理解与合成。</p></div></details>
    <DesignSizeControls value={value} onChange={onChange}/>
    <details className="composer-menu"><summary><Layers size={16}/>{value.count} 张<ChevronDown size={12}/></summary><div className="composer-popover"><strong>生成张数</strong><div className="design-options">{[1,2,3,4].map(count=><button type="button" key={count} aria-pressed={value.count===count} onClick={e=>{update({count});e.currentTarget.closest('details')!.open=false}}>{count} 张</button>)}</div><p>逐张生成，失败不自动补发。</p></div></details>
    <details className="composer-menu"><summary aria-label="图中文字" title="图中文字"><Type size={17}/></summary><div className="composer-popover"><label>图中文字<textarea aria-label="图中文字内容" placeholder="填写需要准确呈现的文案" maxLength={500} value={value.text} onChange={e=>update({text:e.target.value})}/></label></div></details>
    <details className="composer-menu"><summary aria-label="引用参考图" title="引用参考图"><AtSign size={17}/></summary><div className="composer-popover"><strong>引用参考图</strong>{references.length ? references.map((name,index)=><button type="button" className="composer-option" key={index} onClick={e=>{onReference(index);e.currentTarget.closest('details')!.open=false}}>图{index+1} · {name}</button>) : <p>先添加参考图片，再通过 @ 引用。</p>}</div></details>
    </>}
  </div>
}
