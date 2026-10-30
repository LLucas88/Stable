import { AtSign, ChevronDown, ImagePlus, MessageSquare, Layers, Link2, Unlink2, RectangleHorizontal, Type, WandSparkles } from 'lucide-react'
import type { DesignRequest } from './types'
import { useEffect, useRef, useState } from 'react'
import { DESIGN_PRESETS, businessDesign, designDimensions, presetDesign, resizeDesign, type DesignRatio } from './shared/design-size'

function DesignSizeControls({ value, onChange }: { value: DesignRequest; onChange: (value: DesignRequest) => void }) {
  const [width, height] = designDimensions(value)
  const [draft, setDraft] = useState({ width: String(width), height: String(height) })
  const [notice, setNotice] = useState('')
  useEffect(() => { setDraft({ width: String(width), height: String(height) }) }, [width, height])
  const locked = value.aspectLocked !== false
  const output = value.outputPreset ? DESIGN_PRESETS[value.outputPreset] : undefined
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
  return <details className="composer-menu"><summary aria-label="图片尺寸"><RectangleHorizontal size={16}/>{output ? `${output.name} · ${output.width} × ${output.height}` : `${width} × ${height}`}<ChevronDown size={12}/></summary>
    <div className="composer-popover design-size-popover">
      <strong>交付规格</strong><div className="design-ratio-options design-business-options">{(Object.keys(DESIGN_PRESETS) as (keyof typeof DESIGN_PRESETS)[]).map(key => {
        const preset = DESIGN_PRESETS[key]
        return <button type="button" key={key} aria-pressed={value.outputPreset === key} onClick={() => { onChange(businessDesign(value, key)); setNotice('') }}><span>{preset.name}</span><small>{preset.width} × {preset.height}</small></button>
      })}<button type="button" aria-pressed={!output} onClick={() => { onChange({ ...value, outputPreset: undefined }); setNotice('') }}>自定义</button></div>
      {output && <div className="design-output-limit" aria-label="交付文件大小">文件大小：小于 {output.maxMB} MB<span>交付尺寸：{output.width} × {output.height} px</span></div>}
      <strong>选择分辨率</strong><div className="design-resolution-options">{(['standard', '2k'] as const).map(resolution => <button type="button" key={resolution} aria-pressed={(Boolean(output) || value.ratio !== 'custom') && value.resolution === resolution} onClick={() => {
        if (value.outputPreset) onChange({ ...businessDesign({ ...value, resolution }, value.outputPreset) })
        else if (value.ratio !== 'custom') choose(value.ratio, resolution)
        else {
          const next = resizeDesign({ ...value, aspectLocked: true }, width >= height ? 'width' : 'height', resolution === '2k' ? 2048 : 1280)
          onChange({ ...next, resolution, aspectLocked: value.aspectLocked }); setNotice('')
        }
      }}>{resolution === '2k' ? '2K' : '标准'}</button>)}</div>
      {!output && <><strong>尺寸</strong><div className="design-dimensions">
        {(['width', 'height'] as const).map((axis, index) => <div className="design-dimension-part" key={axis}>
          {index === 1 && <button type="button" className="design-aspect-lock" aria-label="锁定宽高比例" aria-pressed={locked} title={locked ? '解锁比例，可分别修改宽高' : '锁定当前宽高比例'} onClick={() => onChange({ ...value, aspectLocked: !locked })}>{locked ? <Link2 size={18}/> : <Unlink2 size={18}/>}</button>}
          <label><span>{index ? 'H' : 'W'}</span><input type="number" inputMode="numeric" min={512} max={2048} step={32} aria-label={index ? '图片高度' : '图片宽度'} value={draft[axis]} onFocus={event => event.currentTarget.select()} onChange={event => setDraft(current => ({ ...current, [axis]: event.target.value }))} onBlur={() => commit(axis)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur() } }}/></label>
        </div>)}<span className="design-pixel-unit">PX</span>
      </div>
      {notice && <p className="design-size-notice" aria-live="polite">{notice}</p>}</>}
    </div>
  </details>
}

const IMAGE_MODELS = {'glm-image':'GLM-image','gpt-image-2.5-sunburst':'GPT Image 2.5 Sunburst','gpt-image-2.5-flare':'GPT Image 2.5 Flare'} as const
const QUALITY_LABELS = {low:'低',medium:'中',high:'高',xhigh:'超高',max:'最高',auto:'自动'} as const
export const DEFAULT_DESIGN: DesignRequest = { model: 'gpt-image-2.5-sunburst', quality: 'medium', background: 'opaque', mode: 'generate', ratio: '1:1', resolution: 'standard', count: 1, text: '' }
export function DesignMessageParameters({ value }: { value?: DesignRequest }) {
  if (!value) return null
  const [width, height] = designDimensions(value)
  if (value.outputPreset) {
    const output = DESIGN_PRESETS[value.outputPreset]
    return <div className="design-message-parameters" aria-label="本条消息的图片参数"><span><ImagePlus size={13}/>图片生成</span><span>{output.name} · {output.width} × {output.height} px</span><span>小于 {output.maxMB} MB</span><span>{value.resolution === '2k' ? '2K' : '标准'}</span><span>{value.count} 张</span><span>{IMAGE_MODELS[value.model]}</span></div>
  }
  return <div className="design-message-parameters" aria-label="本条消息的图片参数"><span><ImagePlus size={13}/>图片生成</span><span>{width} × {height} px</span><span>{value.ratio === 'custom' ? '自定义' : value.resolution === '2k' ? '2K' : '标准'}</span><span>{value.count} 张</span><span>{IMAGE_MODELS[value.model]}</span>{value.model!=='glm-image' && <span>质量 {QUALITY_LABELS[(value.quality==='hd'?'medium':value.quality)||'medium']}</span>}</div>
}
export function DesignControls({ mode, onModeChange, value, onChange, references, onReference }: { mode: 'generate' | 'chat'; onModeChange: (mode: 'generate' | 'chat') => void; value: DesignRequest; onChange: (value: DesignRequest) => void; references: string[]; onReference: (index: number) => void }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const close = (event: PointerEvent) => { root.current?.querySelectorAll('details[open]').forEach(menu=>{if(!menu.contains(event.target as Node))(menu as HTMLDetailsElement).open=false}) }
    document.addEventListener('pointerdown',close)
    return ()=>document.removeEventListener('pointerdown',close)
  },[])
  const update = (change: Partial<DesignRequest>) => onChange({ ...value, ...change })
  const changeModel = (model: DesignRequest['model']) => {
    const next = presetDesign({ ...value, model, quality: model === 'glm-image' ? 'hd' : 'medium', background: 'opaque' }, value.ratio === 'custom' ? '1:1' : value.ratio)
    onChange(value.outputPreset ? businessDesign(next, value.outputPreset) : next)
  }
  return <div ref={root} className="design-controls" aria-label="图像生成参数" onKeyDown={event=>{if(event.key==='Escape'){const menu=(event.target as HTMLElement).closest('details');if(menu){menu.open=false;menu.querySelector('summary')?.focus();event.stopPropagation()}}}}>
    <details className="composer-menu design-mode-menu"><summary className="design-mode" aria-label="Design 输入模式">{mode === 'generate' ? <ImagePlus size={16}/> : <MessageSquare size={16}/>}{mode === 'generate' ? '图片生成' : '对话'}<ChevronDown size={12}/></summary><div className="composer-popover" role="menu" aria-label="选择输入模式">{(['generate','chat'] as const).map(item=><button type="button" className="composer-option" role="menuitemradio" aria-checked={mode===item} key={item} onClick={e=>{onModeChange(item);e.currentTarget.closest('details')!.open=false}}>{item === 'generate' ? <ImagePlus size={16}/> : <MessageSquare size={16}/>}<span>{item === 'generate' ? '图片生成' : '对话'}</span></button>)}</div></details>
    {mode === 'generate' && <>
    <details className="composer-menu"><summary><WandSparkles size={16}/>{IMAGE_MODELS[value.model]}<ChevronDown size={12}/></summary><div className="composer-popover"><strong>图像模型</strong>{(Object.keys(IMAGE_MODELS) as DesignRequest['model'][]).map(model=><button type="button" key={model} className="composer-option" aria-pressed={model===value.model} onClick={e=>{changeModel(model);e.currentTarget.closest('details')!.open=false}}>{IMAGE_MODELS[model]}</button>)}</div></details>
    {value.model!=='glm-image' && <details className="composer-menu"><summary>质量 {QUALITY_LABELS[(value.quality==='hd'?'medium':value.quality)||'medium']}<ChevronDown size={12}/></summary><div className="composer-popover">{(Object.keys(QUALITY_LABELS) as (keyof typeof QUALITY_LABELS)[]).map(quality=><button type="button" className="composer-option" key={quality} aria-pressed={value.quality===quality} onClick={e=>{update({quality});e.currentTarget.closest('details')!.open=false}}>{QUALITY_LABELS[quality]}</button>)}<label>背景<select value={value.background||'opaque'} onChange={e=>update({background:e.target.value as DesignRequest['background']})}><option value="opaque">不透明</option><option value="transparent">透明</option><option value="auto">自动</option></select></label></div></details>}
    <DesignSizeControls value={value} onChange={onChange}/>
    <details className="composer-menu"><summary><Layers size={16}/>{value.count} 张<ChevronDown size={12}/></summary><div className="composer-popover"><strong>生成张数</strong><div className="design-options">{[1,2,3,4].map(count=><button type="button" key={count} aria-pressed={value.count===count} onClick={e=>{update({count});e.currentTarget.closest('details')!.open=false}}>{count} 张</button>)}</div></div></details>
    <details className="composer-menu"><summary aria-label="图中文字" title="图中文字"><Type size={17}/></summary><div className="composer-popover"><label>图中文字<textarea aria-label="图中文字内容" placeholder="填写需要准确呈现的文案" maxLength={500} value={value.text} onChange={e=>update({text:e.target.value})}/></label></div></details>
    <details className="composer-menu"><summary aria-label="引用参考图" title="引用参考图"><AtSign size={17}/></summary><div className="composer-popover"><strong>引用参考图</strong>{references.length ? references.map((name,index)=><button type="button" className="composer-option" key={index} onClick={e=>{onReference(index);e.currentTarget.closest('details')!.open=false}}>图{index+1} · {name}</button>) : <p>先添加参考图片，再通过 @ 引用。</p>}</div></details>
    </>}
  </div>
}
