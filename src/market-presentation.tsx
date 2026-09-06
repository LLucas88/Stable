import { BarChart3, BookOpen, Bot, Code2, Compass, FileText, Globe2, Layers3, Mail, Palette, ShieldCheck, Sparkles, Users, Workflow, type LucideIcon } from 'lucide-react'
import type { MarketItem } from './types'

// Presentation only: keep original instructions, provenance and resource paths
// in storage so display cleanup cannot change execution or subsequent edits.
const platform = /work[\s_-]*buddy|trae[\s_-]*work|doubao(?:[\s_-]*work)?|豆包(?:\s*工作(?:台)?)?/gi
export function marketText(text = '') {
  return text.replace(/^(?:来源|平台)[:：].*$/gm, '')
    .replace(platform, '原平台')
}
export function marketPresentation(item: MarketItem): MarketItem {
  const name = item.name.replace(/\s*[·|｜]\s*(?:work[\s_-]*buddy|trae[\s_-]*work|doubao(?:[\s_-]*work)?|豆包(?:\s*工作(?:台)?)?)\s*$/gi, '')
  return { ...item, name: marketText(name), description: marketText(item.description), content: marketText(item.content), group: marketText(item.group), source: undefined, compatibilityReason: marketText(item.compatibilityReason) }
}
export function MarketIcon({ item }: { item: MarketItem }) {
  const text = `${item.name} ${item.group} ${item.id}`
  let Icon: LucideIcon = Sparkles, tone = 'violet'
  if (item.kind === 'expert') { Icon = Bot; tone = 'violet' }
  else if (item.kind === 'connector') { Icon = Workflow; tone = 'blue' }
  else if (/数据|指标|分析|sql|metric|data/i.test(text)) { Icon = BarChart3; tone = 'blue' }
  else if (/合同|合规|隐私|审查|安全|privacy|contract/i.test(text)) { Icon = ShieldCheck; tone = 'teal' }
  else if (/邮件|邮箱|mail/i.test(text)) { Icon = Mail; tone = 'amber' }
  else if (/设计|视觉|绘图|design|canvas/i.test(text)) { Icon = Palette; tone = 'pink' }
  else if (/会员|客户|用户|增长|user|customer/i.test(text)) { Icon = Users; tone = 'green' }
  else if (/网页|浏览器|browser|web/i.test(text)) { Icon = Globe2; tone = 'blue' }
  else if (/代码|开发|code|developer/i.test(text)) { Icon = Code2; tone = 'violet' }
  else if (/研究|竞品|产品|research|product/i.test(text)) { Icon = Compass; tone = 'amber' }
  else if (/文档|知识|笔记|文献|obsidian|knowledge/i.test(text)) { Icon = BookOpen; tone = 'teal' }
  else if (/内容|文案|创作|营销|content|copy/i.test(text)) { Icon = FileText; tone = 'pink' }
  else if (/工具|依赖|tool/i.test(text)) { Icon = Layers3; tone = 'blue' }
  return <span className="market-avatar" data-kind={item.kind} data-tone={tone} aria-hidden="true"><Icon size={25} strokeWidth={1.8}/></span>
}
