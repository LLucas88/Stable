'use strict'
function installEditContextMenu(webContents, Menu, clipboard) {
  webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable && !params.selectionText) return
    const template = [
      { label: '复制', role: 'copy', enabled: Boolean(params.selectionText) || Boolean(params.editFlags?.canCopy) },
      params.isEditable
        ? { label: '粘贴', role: 'paste', enabled: Boolean(params.editFlags?.canPaste) }
        : { label: '粘贴', enabled: Boolean(clipboard.readText()), click: () => webContents.send('stable:editor:pasteIntoComposer', clipboard.readText()) },
      params.isEditable
        ? { label: '全选', role: 'selectAll' }
        : { label: '全选', click: () => webContents.send('stable:editor:selectAllMessages') },
    ]
    Menu.buildFromTemplate(template).popup()
  })
}
module.exports = { installEditContextMenu }