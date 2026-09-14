import purposes from './skill-purposes.json'
import type { MarketItem } from './types'

// Display metadata only. Skill identifiers and execution instructions stay intact.
export function skillPurpose(item: MarketItem): string {
  const known = (purposes as Record<string, string>)[item.id]
  if (known) return known
  const name = item.name.split(/\s+[·|｜]\s+/)[0]
  if (/[\u3400-\u9fff]/.test(name)) return name
  const heading = item.content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (heading && /[\u3400-\u9fff]/.test(heading)) return heading
  const description = item.description.split(/[。；\n]/)[0].trim()
  return description && !/^支持该技能/.test(description) ? description : name.replace(/[-_]/g, ' ')
}

export function skillConversationPrompts(item: MarketItem) {
  const purpose = skillPurpose(item)
  return [
    { title: `开始${purpose}`, text: `请使用「${purpose}」，根据【背景与材料】完成【任务目标】，输出【需要的成果】，遵守【时间与资源限制】。缺少关键材料时请先指出。` },
    { title: '检查现有材料并改进', text: `请使用「${purpose}」检查我提供的【现有材料或方案】，围绕【关注的问题】给出有依据的发现、修改建议和改进后的结果。请区分已知事实与待确认信息。` },
    { title: '结合目标制定行动方案', text: `请使用「${purpose}」，根据【我的目标】和【当前情况】，在【时间、资源及其他限制】内制定可执行的方案，说明所需输入、主要步骤、交付成果和验收方式。请遵循此 Skill 的能力边界。` },
  ]
}
