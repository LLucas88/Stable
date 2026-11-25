'use strict'

async function prepareEditorQuit({ editors, dialog, getWindow }) {
  const show = options => {
    const window = getWindow?.()
    return window && !window.isDestroyed() ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options)
  }
  for (;;) {
    try {
      await editors.flushAll({ closing: true })
      return true
    } catch (error) {
      const choice = await show({
        type: 'warning', message: '部分 HTML 编辑无法写入原文件',
        detail: error.message + '\n\n可以取消退出继续编辑、重试保存，或保留恢复草稿后退出。页面已经关闭时，只能恢复此前采集的内容。选择放弃写入会直接退出，已有恢复草稿会保留，其他未保存的修改可能丢失。',
        buttons: ['取消退出', '重试保存', '保留草稿并退出', '放弃写入并退出'],
        defaultId: 0, cancelId: 0, noLink: true,
      })
      if (choice.response === 1) continue
      if (choice.response === 3) return true
      if (choice.response !== 2) return false
      try {
        await editors.flushAll({ closing: true, preserveDrafts: true })
        return true
      } catch (failure) {
        await show({ type: 'error', message: '草稿未能安全保存，已取消退出', detail: failure.message })
        return false
      }
    }
  }
}
module.exports = { prepareEditorQuit }
