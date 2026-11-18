'use strict'
// Offline catalog and classic-preset adapters. The Bold pack uses original
// samples and HTML from the linked beautiful-html-templates repository.
// Never execute scripts from upstream documents during preparation.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const source = path.resolve(__dirname, '../desktop/skills/frontend-slides')
const output = path.resolve(__dirname, '../desktop/assets/frontend-slides')
const read = file => fs.readFileSync(path.join(source, file), 'utf8')
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const index = JSON.parse(read('bold-template-pack/selection-index.json'))
const presets = [...read('STYLE_PRESETS.md').matchAll(/### \d+\. ([^\n]+)\n([\s\S]*?)(?=\n### |$)/g)]
const entries = [
  ...presets.map((m, i) => ({slug: 'preset-' + m[1].toLowerCase().replace(/[^a-z0-9]+/g,'-'), name: m[1], body: m[2], reference: 'STYLE_PRESETS.md', tags: ['经典风格'], scheme: i < 4 || i === 8 || i === 9 ? 'dark' : 'light'})),
  ...index.templates.map(item => ({ ...item, body: read(item.preview_md), reference: item.design_md, tags: item.mood.slice(0, 3) })),
]
const luminance = hex => { const v=hex.slice(1);return [.2126,.7152,.0722].reduce((a,k,i)=>a+k*parseInt(v.slice(i*2,i*2+2),16),0) }
function palette(entry) {
  const line = entry.body.match(/- Palette: ([^\n]+)/)?.[1] || entry.body
  const colors = [...new Set(line.match(/#[a-f\d]{6}\b/gi) || [])]
  const sorted = [...colors].sort((a,b)=>luminance(a)-luminance(b))
  const dark = entry.scheme === 'dark', bg = dark ? sorted[0] || '#151821' : sorted.at(-1) || '#faf8f2'
  const ink = dark ? '#f6f4ed' : sorted[0] || '#18191c'
  const accents=colors.filter(c=>Math.max(...[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)))-Math.min(...[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)))>40)
  return { bg, ink, accent: accents.find(c=>Math.abs(luminance(c)-luminance(bg))>55) || (dark?'#b9e166':'#d65332'), secondary: accents.at(-1) || '#a8b6c8' }
}
function treatment(entry, i) {
  const s=entry.slug
  if(/terminal|orbit|cyber|matrix|code/.test(s))return 'terminal'
  if(/paper|ink|editorial|notebook|newspaper|literary/.test(s))return 'editorial'
  if(/split|studio|voltage|frame/.test(s))return 'split'
  if(/pastel|geometry|playful|candy/.test(s))return 'geometry'
  if(/botanical|biennale|elegant|museum/.test(s))return 'serif'
  if(/swiss|signal|bold|brutal|red|yellow/.test(s))return 'poster'
  return ['split','poster','serif','geometry','editorial'][i%5]
}
function document(entry, i) {
  const {bg,ink,accent,secondary}=palette(entry), layout=treatment(entry,i)
  const title=layout==='terminal'?'构建下一个可能':layout==='serif'?'让好想法\n被看见':layout==='editorial'?'从观察\n走向行动':'把想法\n变成行动'
  const font=entry.body.match(/(?:Display:|Typography:)\s*`([^`]+)`/)?.[1] || (/serif|editorial/.test(layout)?'Georgia':'Segoe UI')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(entry.name)} · 演示文稿</title><style>
  *{box-sizing:border-box}html{scroll-behavior:smooth;scroll-snap-type:y proximity}body{margin:0;container-type:inline-size;background:${bg};color:${ink};font:30px/1.5 "Segoe UI","Microsoft YaHei",sans-serif}.slide{position:relative;width:1920px;height:1080px;zoom:calc(100cqw / 1920px);overflow:hidden;scroll-snap-align:start;padding:96px 112px;border-bottom:1px solid color-mix(in srgb,currentColor 18%,transparent);background:${bg}}.stage{height:100%;position:relative;z-index:1}.eyebrow{font-size:23px;letter-spacing:5px;display:flex;justify-content:space-between;border-bottom:2px solid currentColor;padding-bottom:24px}.title{font-family:"${esc(font)}","Microsoft YaHei",sans-serif;font-size:142px;line-height:1.16;letter-spacing:-4px;margin:110px 0 42px;max-width:1350px;white-space:pre-line}.subtitle{max-width:960px;font-size:34px;opacity:.8}.foot{position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:space-between;font-size:24px}.art{position:absolute;width:620px;height:620px;border-radius:50%;right:-100px;top:200px;background:${accent};opacity:.24;transform:rotate(-18deg)}.art:after{content:"";position:absolute;inset:130px;border:3px solid ${ink};border-radius:inherit}.kicker{color:${accent};font-size:28px}h2{font-family:"${esc(font)}","Microsoft YaHei",sans-serif;font-size:82px;line-height:1.2;margin:55px 0 60px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:32px}.card{padding:42px;border:2px solid color-mix(in srgb,currentColor 25%,transparent);min-height:340px}.card strong{font-size:76px;color:${accent}}h3{font-size:38px;margin:18px 0}p{margin:14px 0}.card p{font-size:28px;opacity:.78}.closing{max-width:1400px;font-size:104px;line-height:1.25;margin:140px 0 60px}.rule{width:180px;height:12px;background:${accent}}.terminal{font-family:Consolas,"Microsoft YaHei",monospace;background-image:linear-gradient(${accent}0c 1px,transparent 1px),linear-gradient(90deg,${accent}0c 1px,transparent 1px);background-size:40px 40px}.terminal .title{color:${accent};font-family:Consolas,"Microsoft YaHei",monospace}.terminal .art{border-radius:0;opacity:1;width:340px;height:340px;right:0;top:250px;box-shadow:20px 20px 0 ${secondary};background:transparent;border:8px solid ${accent}}.terminal .title{max-width:1200px;font-size:128px}.terminal .card{box-shadow:8px 8px 0 ${accent}}.editorial .title,.serif .title,.editorial h2,.serif h2{font-family:Georgia,"SimSun",serif;font-weight:400}.editorial .art{width:340px;height:680px;right:0;top:170px;border-radius:0;opacity:.8;background:repeating-linear-gradient(0deg,${accent},${accent} 8px,transparent 8px,transparent 22px)}.editorial .title{font-size:158px}.editorial .cards{gap:0}.editorial .card{border-width:0 0 0 2px}.split.cover{background:linear-gradient(90deg,${bg} 64%,${accent} 64%)}.split .title{max-width:1120px;font-size:132px}.split .art{right:-40px;background:${bg};opacity:.85;width:480px;height:480px;border-radius:18px}.split .art:after{border-color:${accent}}.geometry.cover{background:linear-gradient(110deg,${bg} 64%,${secondary} 64%)}.geometry .title{max-width:1150px}.geometry .art{right:0;opacity:1;width:380px;height:620px;background:${accent};border-radius:200px}.geometry .card{border-radius:45px;background:color-mix(in srgb,${accent} 12%,${bg});border:0}.serif .art{filter:blur(60px);background:radial-gradient(circle,${accent},${secondary},transparent);opacity:.8}.serif .title{font-size:156px;position:relative}.poster.cover{background:${accent};color:${bg}}.poster .title{font-size:176px;font-weight:900;line-height:1.06;max-width:1500px}.poster .art{width:440px;height:440px;right:-140px;background:${bg};opacity:.85;border-radius:0;top:380px;transform:rotate(30deg)}.poster .eyebrow{border-width:6px}.poster .card{border-top:12px solid ${accent}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{.slide{zoom:.5;break-after:page}}
  </style></head><body><section class="slide cover ${layout}"><div class="art"></div><div class="stage"><div class="eyebrow"><span>IDEAS INTO ACTION</span><span>01 / 03</span></div><h1 class="title">${esc(title)}</h1><p class="subtitle">在这里写下你的项目主题、核心主张与一句话介绍。</p><div class="foot"><span>项目提案 · 示例内容</span><span>请替换为真实资料 ↗</span></div></div></section><section class="slide ${layout}"><div class="stage"><div class="eyebrow"><span>思路与结构</span><span>02 / 03</span></div><h2>把核心问题讲清楚</h2><div class="cards"><article class="card"><strong>01</strong><h3>我们看到了什么</h3><p>填写已验证的事实与背景，标注资料来源。</p></article><article class="card"><strong>02</strong><h3>这意味着什么</h3><p>写出关键判断，区分证据、假设与未知信息。</p></article><article class="card"><strong>03</strong><h3>接下来如何行动</h3><p>明确行动、负责人及可以验证的完成标准。</p></article></div><div class="foot"><span>请用实际资料替换示例</span><span>观点 · 证据 · 行动</span></div></div></section><section class="slide ${layout}"><div class="stage"><div class="eyebrow"><span>下一步</span><span>03 / 03</span></div><div class="closing">让下一步，<br>清晰而具体。</div><div class="rule"></div><p class="subtitle">在这里填写行动安排、交付时间与负责人。</p><div class="foot"><span>谢谢阅读</span><span>讨论 / 反馈</span></div></div></section><script>document.addEventListener('keydown',e=>{if(['ArrowRight','ArrowDown','PageDown','ArrowLeft','ArrowUp','PageUp'].includes(e.key)){e.preventDefault();const slides=[...document.querySelectorAll('.slide')],i=Math.round(scrollY/slides[0].getBoundingClientRect().height),d=/Left|Up/.test(e.key)?-1:1;slides[Math.max(0,Math.min(slides.length-1,i+d))].scrollIntoView();}});</script></body></html>`
}
fs.mkdirSync(output,{recursive:true})
const names = require('../desktop/assets/frontend-slides/names-zh.json')
const samples = require('../desktop/assets/frontend-slides/upstream-samples.json')
const catalog=entries.map((entry,i)=>{
  const original=samples.find(x=>x.slug===entry.slug),name=names[entry.slug]
  if(!name)throw Error('Missing Chinese name: '+entry.slug)
  if(!original)fs.writeFileSync(path.join(output,entry.slug+'.html'),document(entry,i))
  return {slug:entry.slug,name,originalName:entry.name,description:original ? name+'风格，展示 GitHub 提供的原版演示样片，可参考原始 HTML 制作演示文稿。' : name+'经典风格预设，当前预览为 Stable 示例。',tags:entry.tags,reference:entry.reference,hasOriginalPreview:!!original,...(original?{samples:original.images.map(x=>x.split('/').pop())}: {})}
}).sort((a,b)=>Number(b.hasOriginalPreview)-Number(a.hasOriginalPreview))
fs.writeFileSync(path.join(output,'catalog.json'),JSON.stringify(catalog,null,2)+'\n')
const files=fs.readdirSync(source,{recursive:true}).filter(p=>fs.statSync(path.join(source,p)).isFile()&&p!=='PROVENANCE.json').sort().map(p=>({path:p.replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(source,p))).digest('hex')}))
fs.writeFileSync(path.join(source,'PROVENANCE.json'),JSON.stringify({source:'https://github.com/zarazhangrui/frontend-slides',retrieved:'2026-11-03',license:'MIT',skillBlob:'9b8374bf128db6d5c18921d170bdc6a230808f82',note:'Upstream markdown resources preserved. Classic gallery presets use Stable adaptations; Bold gallery assets have separate provenance under assets/frontend-slides/originals.',files},null,2)+'\n')
console.log(`Frontend Slides: ${catalog.length} gallery templates, ${files.length} upstream resources`)
