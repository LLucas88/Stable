'use strict'

// One instance per case, including its checkpoint/resume and correction calls.
function requestBudget(limit) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw Error('请求上限必须是正整数')
  let used = 0
  return {
    get used() { return used },
    onRequest() {
      if (used >= limit) throw Error(`benchmark 请求次数达到上限（${used}/${limit}），已停止；保留已完成文件，未完成项目不能视为验收通过。`)
      used++
      if (used < Math.ceil(limit * .75)) return undefined
      return `本例请求预算：正在进行第 ${used}/${limit} 次请求，本次之后还可请求 ${limit - used} 次（包括参数纠正和续跑）。优先完成未通过的数据和交互检查；已通过项目不重复截图，不新增装饰性改版。保存进度并据实交付，未完成或未验证的项目明确说明，不能把预算不足说成全部通过。`
    },
  }
}

module.exports = { requestBudget }
