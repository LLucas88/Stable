import { AtSign, ChevronDown, ImagePlus, MessageSquare, Layers, Link2, Unlink2, RectangleHorizontal, Type, WandSparkles } from 'lucide-react'
import { MoreSettings,ComplexityControl,BackgroundControl,OutputControl,IMAGE_MODELS } from './ImageParameters'
import type { DesignRequest,ModelProfile } from './types'
import { useEffect, useRef, useState } from 'react'
import { DESIGN_PRESETS, businessDesign, designDimensions, presetDesign, resizeDesign } from './shared/design-size'

function connectionHost(url:string){try{return new URL(url).hostname}catch{return '连接地址待配置'}}
function DesignSizeControls({ value, onChange, onUnbind }: { value: DesignRequest; onChange: (value: DesignRequest) => void; onUnbind: () => void }) {
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
  return <details className="composer-menu" data-bound={value.bindings?.size || undefined}><summary aria-label="图片尺寸" title={value.bindings?.size ? "本次已绑定尺寸" : "未绑定，按提示词或自动"}><RectangleHorizontal size={16}/><span className="p26-setting-label">尺寸</span><span className="p26-setting-value">{value.model!=='glm-image' && !value.bindings?.size ? '自动' : output ? `${output.name} · ${output.width} × ${output.height}` : `${width} × ${height}`}</span><ChevronDown size={12}/></summary>
    <div className="composer-popover design-size-popover">
      {value.model!=='glm-image' && <button type="button" className="composer-option" onClick={onUnbind}>不绑定尺寸，按提示词或自动</button>}<strong>交付规格</strong><div className="design-ratio-options design-business-options">{(Object.keys(DESIGN_PRESETS) as (keyof typeof DESIGN_PRESETS)[]).map(key => {
        const preset = DESIGN_PRESETS[key]
        return <button type="button" key={key} aria-pressed={value.outputPreset === key} disabled={['svg','gif'].includes(value.outputFormat||'')} onClick={() => { onChange(businessDesign(value, key)); setNotice('') }}><span>{preset.name}</span><small>{preset.width} × {preset.height}</small></button>
      })}<button type="button" aria-pressed={!output} onClick={() => { onChange({ ...value, outputPreset: undefined }); setNotice('') }}>自定义</button></div>
      {output && <div className="design-output-limit" aria-label="交付文件大小">文件大小：小于 {output.maxMB} MB<span>交付尺寸：{output.width} × {output.height} px</span></div>}
      <label>尺寸处理<select disabled={['svg','gif'].includes(value.outputFormat||'')} aria-label="尺寸处理" value={value.fit || 'strict'} onChange={e => onChange({ ...value, fit: e.target.value as DesignRequest['fit'] })}><option value="strict">保持完整，不自动补边或裁切</option><option value="contain">允许留边，保留完整图片</option><option value="cover">允许居中裁切，铺满画布</option></select></label>
      <p className="design-fit-notice">比例不一致时默认暂停。选择裁切前请预览原图；重新构图或扩图需另行确认。</p>
      <strong>选择分辨率</strong><div className="design-resolution-options" data-resolution={value.resolution}><span className="design-resolution-slider" aria-hidden="true"/>{(['standard', '2k'] as const).map(resolution => <button type="button" key={resolution} aria-pressed={value.resolution === resolution} onClick={() => {
        if (value.outputPreset) onChange({ ...businessDesign({ ...value, resolution }, value.outputPreset) })
        else {
          onChange({ ...value, ratio: 'custom', width, height, resolution }); setNotice('')
        }
      }}>{resolution === '2k' ? '2K' : '标准'}</button>)}</div>
      {!output && <><strong>尺寸</strong><div className="design-dimensions">
        {(['width', 'height'] as const).map((axis, index) => <div className="design-dimension-part" key={axis}>
          {index === 1 && <button type="button" className="design-aspect-lock" aria-label="锁定宽高比例" aria-pressed={locked} title={locked ? '解锁比例，可分别修改宽高' : '锁定当前宽高比例'} onClick={() => onChange({ ...value, aspectLocked: !locked })}>{locked ? <Link2 size={18}/> : <Unlink2 size={18}/>}</button>}
          <label><span>{index ? 'H' : 'W'}</span><input type="number" inputMode="numeric" min={512} max={value.model === 'glm-image' ? 2048 : 3840} step={value.model === 'glm-image' ? 32 : 16} aria-label={index ? '图片高度' : '图片宽度'} value={draft[axis]} onFocus={event => event.currentTarget.select()} onChange={event => setDraft(current => ({ ...current, [axis]: event.target.value }))} onBlur={() => commit(axis)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.currentTarget.blur() } }}/></label>
        </div>)}<span className="design-pixel-unit">PX</span>
      </div>
      {notice && <p className="design-size-notice" aria-live="polite">{notice}</p>}</>}
    </div>
  </details>
}

const QUALITY_LABELS = {low:'低',medium:'中',high:'高',xhigh:'超高',max:'最高',auto:'自动'} as const
export const DEFAULT_DESIGN: DesignRequest = { model: 'gpt-image-2.6-sunburst', quality: 'auto', background: 'auto', bindings: {}, mode: 'generate', ratio: '1:1', resolution: 'standard', count: 1, text: '' }
function ExtraParameters({value}:{value:DesignRequest}){return <><span>{(value.outputFormat||'png').toUpperCase()}</span>{value.complexity&&<span>构图 {{low:'低',medium:'中',high:'高'}[value.complexity]}</span>}{value.background&&<span>背景 {{auto:'自动',opaque:'不透明',transparent:'透明'}[value.bindings&&!value.bindings.background?'auto':value.background]}</span>}{value.outputFormat==='gif'&&<span>{value.frameCount||9} 帧 · {value.frameDurationMs||200} ms/帧</span>}</>}
export function DesignMessageParameters({ value }: { value?: DesignRequest }) {
  if (!value) return null
  if(value.bindings !== undefined && value.model!=='glm-image') return <div className="design-message-parameters" aria-label="本条消息的图片参数"><span><ImagePlus size={13}/>图片生成</span><span>{value.bindings.size ? `${designDimensions(value).join(' × ')} px` : '尺寸 自动'}</span><span>质量 {value.bindings.quality ? QUALITY_LABELS[(value.quality==='hd'?'medium':value.quality)||'auto'] : '自动'}</span><span>{value.bindings.count ? `${value.count} 张` : '数量 默认1张'}</span><span>{IMAGE_MODELS[value.model]}</span><ExtraParameters value={value}/></div>
  const [width, height] = designDimensions(value)
  if (value.outputPreset) {
    const output = DESIGN_PRESETS[value.outputPreset]
    return <div className="design-message-parameters" aria-label="本条消息的图片参数"><span><ImagePlus size={13}/>图片生成</span><span>{output.name} · {output.width} × {output.height} px</span><span>小于 {output.maxMB} MB</span><span>{value.resolution === '2k' ? '2K' : '标准'}</span><span>{value.count} 张</span><span>{IMAGE_MODELS[value.model]}</span><ExtraParameters value={value}/></div>
  }
  return <div className="design-message-parameters" aria-label="本条消息的图片参数"><span><ImagePlus size={13}/>图片生成</span><span>{width} × {height} px</span><span>{value.ratio === 'custom' ? '自定义' : value.resolution === '2k' ? '2K' : '标准'}</span><span>{value.count} 张</span><span>{IMAGE_MODELS[value.model]}</span><ExtraParameters value={value}/>{value.model!=='glm-image' && <span>质量 {QUALITY_LABELS[(value.quality==='hd'?'medium':value.quality)||'medium']}</span>}</div>
}
export function DesignControls({ mode, onModeChange, value, onChange, references, onReference, connections=[] }: { mode: 'generate' | 'chat'; onModeChange: (mode: 'generate' | 'chat') => void; value: DesignRequest; onChange: (value: DesignRequest) => void; references: string[]; connections?: ModelProfile[]; onReference: (index: number) => void }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const close = (event: PointerEvent) => { root.current?.querySelectorAll('details[open]').forEach(menu=>{if(!menu.contains(event.target as Node))(menu as HTMLDetailsElement).open=false}) }
    document.addEventListener('pointerdown',close)
    return ()=>document.removeEventListener('pointerdown',close)
  },[])
  const update = (change: Partial<DesignRequest>) => onChange({ ...value, ...change, bindings: {...value.bindings,...(change.quality!==undefined?{quality:true}:{}),...(change.background!==undefined?{background:true}:{}),...(change.count!==undefined?{count:true}:{})} })
  const unbind = (key: 'quality'|'background'|'size'|'count') => onChange({...value,bindings:{...value.bindings,[key]:false}})
  const changeModel = (model: DesignRequest['model']) => {
    const next = presetDesign({ ...value, model, upstreamModel:undefined, complexity:undefined, outputFormat:'png',frameCount:undefined,frameDurationMs:undefined, quality: model === 'glm-image' ? 'hd' : 'auto', background: model === 'glm-image' ? 'opaque' : 'auto', bindings: {} }, value.ratio === 'custom' ? '1:1' : value.ratio)
    onChange(value.outputPreset ? businessDesign(next, value.outputPreset) : next)
  }
  return <div ref={root} className="design-controls" aria-label="图像生成参数" onKeyDown={event=>{if(event.key==='Escape'){const menu=(event.target as HTMLElement).closest('details');if(menu){menu.open=false;menu.querySelector('summary')?.focus();event.stopPropagation()}}}}>
    <details className="composer-menu design-mode-menu"><summary className="design-mode" aria-label="Design 输入模式">{mode === 'generate' ? <ImagePlus size={16}/> : <MessageSquare size={16}/>}{mode === 'generate' ? '图片生成' : '对话'}<ChevronDown size={12}/></summary><div className="composer-popover" role="menu" aria-label="选择输入模式">{(['generate','chat'] as const).map(item=><button type="button" className="composer-option" role="menuitemradio" aria-checked={mode===item} key={item} onClick={e=>{onModeChange(item);e.currentTarget.closest('details')!.open=false}}>{item === 'generate' ? <ImagePlus size={16}/> : <MessageSquare size={16}/>}<span>{item === 'generate' ? '图片生成' : '对话'}</span></button>)}</div></details>
    {mode === 'generate' && <>
    <details className="composer-menu"><summary><WandSparkles size={16}/>{IMAGE_MODELS[value.model]}<ChevronDown size={12}/></summary><div className="composer-popover"><strong>图像模型</strong>{(Object.keys(IMAGE_MODELS) as DesignRequest['model'][]).map(model=><button type="button" key={model} className="composer-option" aria-pressed={model===value.model} onClick={e=>{changeModel(model);e.currentTarget.closest('details')!.open=false}}>{IMAGE_MODELS[model]}</button>)}{value.model!=='glm-image'&&connections.some(c=>c.providerId!=='stable-cloud'&&c.providerId!=='chatgpt')&&<><label>服务连接<select aria-label="图片服务连接" value={value.connectionId||''} onChange={e=>update({connectionId:e.target.value||undefined,upstreamModel:undefined})}><option value="">按图片模型匹配已有连接</option>{connections.filter(c=>c.hasApiKey&&c.providerId!=='stable-cloud'&&c.providerId!=='chatgpt').map(c=><option key={c.id} value={c.id}>{c.displayName} · {connectionHost(c.baseURL)}</option>)}</select></label>{value.connectionId&&<label>上游模型名（可选）<input aria-label="图片上游模型名" placeholder={value.model} value={value.upstreamModel||''} maxLength={160} onChange={e=>update({upstreamModel:e.target.value.trim()||undefined})}/></label>}{value.connectionId&&<label>编辑请求格式<select aria-label="图片编辑请求格式" value={value.editTransport||'json'} onChange={e=>update({editTransport:e.target.value as DesignRequest['editTransport']})}><option value="json">JSON</option><option value="multipart">Multipart（兼容中转）</option></select></label>}</>}</div></details>
    {value.model!=='glm-image' && <details className="composer-menu" data-bound={value.bindings?.quality || undefined}><summary title={value.bindings?.quality ? "本次已绑定质量" : "未绑定，按提示词或自动"}>质量 {value.bindings?.quality ? QUALITY_LABELS[(value.quality==='hd'?'medium':value.quality)||'auto'] : '自动'}<ChevronDown size={12}/></summary><div className="composer-popover"><button type="button" className="composer-option" onClick={()=>unbind('quality')}>不绑定质量，按提示词或自动</button>{(Object.keys(QUALITY_LABELS) as (keyof typeof QUALITY_LABELS)[]).map(quality=><button type="button" className="composer-option" key={quality} aria-pressed={value.quality===quality} onClick={e=>{update({quality});e.currentTarget.closest('details')!.open=false}}>{QUALITY_LABELS[quality]}</button>)}</div></details>}
    <MoreSettings>
    <ComplexityControl value={value.complexity} onChange={complexity=>update({complexity})} unsupported={!value.model.startsWith('gpt-image-2.6-')}/>
    <BackgroundControl value={value.model==='glm-image'?'opaque':value.bindings?.background?value.background:'auto'} onChange={background=>update({background})} disabled={value.model==='glm-image'} transparentSupported={['png','webp'].includes(value.outputFormat||'png')}/>
    <OutputControl value={value} onChange={onChange} hasReferences={references.length>0}/>
    <DesignSizeControls value={value} onChange={next=>onChange({...next,bindings:{...value.bindings,size:true}})} onUnbind={()=>unbind('size')}/>
    <details className="composer-menu" data-bound={value.bindings?.count || undefined}><summary aria-label="生成数量" title={value.bindings?.count ? "本次已绑定数量" : "未绑定，默认1张；以提示词为准"}><Layers size={16}/><span className="p26-setting-label">数量</span><span className="p26-setting-value">{value.model!=='glm-image'&&!value.bindings?.count ? '自动' : `${value.count} 张`}</span><ChevronDown size={12}/></summary><div className="composer-popover">{value.model!=='glm-image' && <button type="button" className="composer-option" onClick={()=>unbind('count')}>不绑定数量，按提示词或默认1张</button>}<strong>生成张数</strong><div className="design-options">{(value.outputFormat==='svg'?[1]:[1,2,3,4]).map(count=><button type="button" key={count} aria-pressed={value.count===count} onClick={e=>{update({count});e.currentTarget.closest('details')!.open=false}}>{count} 张</button>)}</div></div></details>
    <details className="composer-menu"><summary aria-label="图中文字" title="图中文字"><Type size={17}/><span className="p26-setting-label">图中文字</span><span className="p26-setting-value">{value.text?'已填写':'未填写'}</span><ChevronDown size={12}/></summary><div className="composer-popover"><label>图中文字<textarea aria-label="图中文字内容" placeholder="填写需要准确呈现的文案" maxLength={500} value={value.text} onChange={e=>update({text:e.target.value})}/></label></div></details>
    <details className="composer-menu"><summary aria-label="引用参考图" title="引用参考图"><AtSign size={17}/><span className="p26-setting-label">参考图</span><span className="p26-setting-value">{references.length?`${references.length} 张`:'未添加'}</span><ChevronDown size={12}/></summary><div className="composer-popover"><strong>引用参考图</strong>{references.length ? references.map((name,index)=><button type="button" className="composer-option" key={index} onClick={e=>{onReference(index);e.currentTarget.closest('details')!.open=false}}>图{index+1} · {name}</button>) : <p>先添加参考图片，再通过 @ 引用。</p>}</div></details>
    </MoreSettings>
    </>}
  </div>
}
