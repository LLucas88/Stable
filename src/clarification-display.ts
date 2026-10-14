// Preserve model-only instructions in stored history, including older conversations.
export function clarificationDisplay(content: string): { question: string; answer: string } | undefined {
  const choice = /^【(?:用户选择|20 秒未操作，模型自主选择推荐路线|用户委托模型选择推荐路线)】\r?\n问题：([\s\S]*?)\r?\n路线：([\s\S]*?)\r?\n处理提示：[\s\S]*$/.exec(content)
  if (choice) return { question: choice[1], answer: choice[2] }
  const custom = /^针对“([\s\S]*?)”的补充：\r?\n([\s\S]+)$/.exec(content)
  if (custom) return { question: custom[1], answer: custom[2] }
}
