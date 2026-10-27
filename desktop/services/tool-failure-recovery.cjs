'use strict'

// Fixed guidance only: never promote text from a tool error into instructions,
// execute a retry, broaden permissions, or conceal the original failure.
function toolFailureRecovery(name, error) {
  const text = String(error || '').slice(0, 24000)
  let hint = ''
  if (name === 'Edit' && /Found \d+ matches|multiple matches/i.test(text)) hint = 'Edit 的匹配文本不唯一，工具未执行替换。先 Read 目标片段，使用包含函数名或相邻内容的唯一 old_string；除非确实需要修改全部位置，不要改成 replace_all。'
  if (name === 'Bash') {
    if (/IndexError: (?:tuple|list) index out of range/.test(text)) hint = '脚本访问了不存在的列或元素。重新检查完整表头、重复字段和实际行宽，按已核验字段建立映射；缺列应明确报告，不能猜列序号或静默跳过。'
    else if (/FileNotFoundError:/.test(text)) hint = '脚本依赖文件不存在。先检查实际输出路径及生成步骤是否成功；有依赖的生成、读取、校验必须顺序执行。文件路径基于 Path(__file__).resolve().parent 或已核验的绝对路径，不依赖前一次 Bash 的 cd。不要创建空文件冒充数据。'
    else if (/TypeError:.*NoneType/.test(text)) hint = '脚本将缺失值参与了运算。检查数据来源和缺失月份，明确采用缺失标记或按业务口径筛选；不能把缺失值直接补 0 来通过校验。'
    else if (/KeyError:/.test(text)) hint = '脚本引用了未生成的字段。核对数据生成脚本和消费脚本的字段契约，先验证必需字段；派生指标从真实来源计算，不用 dict.get(..., 0) 掩盖缺失。'
    else if (/SyntaxError: f-string expression part cannot include a backslash/.test(text)) hint = '当前 Python 不支持 f-string 表达式中的反斜杠。把嵌套表达式先计算到变量，再格式化；先用同一解释器做语法检查，不要反复增加转义。'
    else if (/checks=\d+\s+fails=[1-9]\d*|AssertionError:/.test(text)) hint = '校验未通过。逐项核对实际渲染值、数据来源、统计周期、单位和格式；NaN/undefined 应检查数据与可见输出，不把脚本中正常的检测代码当作错误。只有证实断言本身错误时才修正断言，保留等价校验，禁止删除检查来交付。'
  }
  return hint ? hint + ' 本次失败保留；检查部分写入后修复再重试，仍须遵守原审批、停止指令和费用上限。' : ''
}

module.exports = { toolFailureRecovery }
