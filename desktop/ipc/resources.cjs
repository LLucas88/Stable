'use strict'
const { writeFileSync } = require('node:fs')
const { renderReportHtml } = require('../services/reports.cjs')
function registerResourceIpc({ ipcMain, store, dialog, getWindow, importDataPaths, requireText, importKnowledge, importKnowledgePaths, removeStoredAsset, knowledgeRoot, importReportPaths, saveReportDraft, reportRoot, cleanFilename, importLibraryFiles, requireLibraryCategory, importProcessingPaths, importScriptPaths, libraryRoot, runStoredScript, scriptRunner, isInside, markdownSummary }) {
  ipcMain.handle('stable:data:import', async () => {
    const result = await dialog.showOpenDialog(getWindow(), { title: '导入本地数据', properties: ['openFile', 'multiSelections'], filters: [
      { name: '支持的文件', extensions: ['txt', 'md', 'csv', 'json', 'yaml', 'yml', 'html', 'log', 'xml', 'pdf', 'docx', 'pptx', 'xlsx', 'xls'] }, { name: '所有文件', extensions: ['*'] },
    ] })
    if (result.canceled) return { added: 0, items: store.listData() }
    return importDataPaths(result.filePaths)
  })
  ipcMain.handle('stable:data:importPaths', (_event, payload) => importDataPaths(payload?.paths))
  ipcMain.handle('stable:data:enabled', (_event, payload) => { store.setDataEnabled(requireText(payload?.id, '数据 ID', 100), Boolean(payload?.enabled)); return store.listData() })
  ipcMain.handle('stable:data:remove', (_event, payload) => { store.removeData(requireText(payload?.id, '数据 ID', 100)); return store.listData() })

  ipcMain.handle('stable:knowledge:import', () => importKnowledge())
  ipcMain.handle('stable:knowledge:importPaths', (_event, payload) => importKnowledgePaths(payload?.paths))
  ipcMain.handle('stable:knowledge:get', (_event, payload) => {
    const item = store.knowledgeItem(requireText(payload?.id, '知识 ID', 100))
    if (!item) throw new Error('找不到这个知识文档。')
    return item
  })
  ipcMain.handle('stable:knowledge:enabled', (_event, payload) => {
    store.setKnowledgeEnabled(requireText(payload?.id, '知识 ID', 100), Boolean(payload?.enabled))
    return store.listKnowledge()
  })
  ipcMain.handle('stable:knowledge:remove', async (_event, payload) => {
    const id = requireText(payload?.id, '知识 ID', 100)
    const item = store.knowledgeItem(id)
    if (!item) throw new Error('找不到这个知识文档。')
    removeStoredAsset(knowledgeRoot(), item.path)
    store.removeKnowledge(id)
    return store.listKnowledge()
  })

  ipcMain.handle('stable:reports:import', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: '导入 HTML 报告', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'HTML 报告', extensions: ['html', 'htm'] }],
    })
    if (result.canceled) return { added: 0, items: store.listReports() }
    return importReportPaths(result.filePaths)
  })
  ipcMain.handle('stable:reports:importPaths', (_event, payload) => importReportPaths(payload?.paths))
  ipcMain.handle('stable:reports:render', (_event, payload) => {
    const mode = payload?.mode === 'source' || payload?.mode === 'studio' ? payload.mode : 'builder'
    const html = mode === 'source' || mode === 'studio' ? String(payload?.html || '') : renderReportHtml({ name: String(payload?.name || 'Stable 报告'), mode, components: Array.isArray(payload?.components) ? payload.components : [] })
    if (html.length > 10_000_000) throw new Error('HTML 内容不能超过 10 MB。')
    return html
  })
  ipcMain.handle('stable:reports:save', (_event, payload) => saveReportDraft(payload))
  ipcMain.handle('stable:reports:remove', async (_event, payload) => {
    const id = requireText(payload?.id, '报告 ID', 100)
    const item = store.reportItem(id)
    if (!item) throw new Error('找不到这份报告。')
    removeStoredAsset(reportRoot(), item.path)
    store.removeReport(id)
    return store.listReports()
  })
  ipcMain.handle('stable:reports:export', async (_event, payload) => {
    const item = store.reportItem(requireText(payload?.id, '报告 ID', 100))
    if (!item) throw new Error('找不到这份报告。')
    const result = await dialog.showSaveDialog(getWindow(), {
      title: '导出 HTML 报告', defaultPath: `${cleanFilename(item.name)}.html`,
      filters: [{ name: 'HTML 报告', extensions: ['html'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    writeFileSync(result.filePath, item.html, 'utf8')
    return { canceled: false, path: result.filePath }
  })

  ipcMain.handle('stable:library:import', (_event, payload) => importLibraryFiles(requireLibraryCategory(payload?.category)))
  ipcMain.handle('stable:library:importPaths', (_event, payload) => {
    const category = requireLibraryCategory(payload?.category)
    return category === 'processing' ? importProcessingPaths(payload?.paths) : importScriptPaths(category, payload?.paths)
  })
  ipcMain.handle('stable:library:rename', (_event, payload) => {
    const id = requireText(payload?.id, '脚本 ID', 100)
    const name = requireText(payload?.name, '脚本名称', 100)
    const item = store.libraryItem(id)
    if (!item || item.kind !== 'script' || !['collection', 'cleaning'].includes(item.category)) throw new Error('找不到这个脚本。')
    store.renameLibraryItem(id, name)
    return store.listLibrary()
  })
  ipcMain.handle('stable:library:remove', async (_event, payload) => {
    const id = requireText(payload?.id, '资产 ID', 100)
    const item = store.libraryItem(id)
    if (!item) throw new Error('找不到这个数据资产。')
    removeStoredAsset(libraryRoot(item.category), item.path)
    store.removeLibraryItem(id)
    return store.listLibrary()
  })
  ipcMain.handle('stable:library:run', async (_event, payload) => {
    const id = requireText(payload?.id, '资产 ID', 100)
    const item = store.libraryItem(id)
    const execution = await runStoredScript(item)
    return { cancelled: execution.cancelled, item: execution.item, items: store.listLibrary() }
  })
  ipcMain.handle('stable:library:cancel', () => scriptRunner.cancel())
  ipcMain.handle('stable:library:input', (_event, payload) => {
    const id = requireText(payload?.id, '资产 ID', 100)
    if (typeof payload?.value !== 'string') throw new Error('脚本输入无效。')
    return scriptRunner.writeInput(id, payload.value)
  })
  ipcMain.handle('stable:library:saveMarkdown', (_event, payload) => {
    const id = requireText(payload?.id, '资产 ID', 100)
    const item = store.libraryItem(id)
    if (!item || item.kind !== 'markdown') throw new Error('找不到这个 Markdown。')
    if (typeof payload?.content !== 'string') throw new Error('Markdown 内容无效。')
    if (payload.content.length > 2_000_000) throw new Error('Markdown 内容不能超过 2 MB。')
    if (!isInside(libraryRoot(item.category), item.path)) throw new Error('Markdown 路径不在 Stable 私有目录内，已停止保存。')
    writeFileSync(item.path, payload.content, 'utf8')
    store.saveMarkdown(id, payload.content, markdownSummary(payload.content))
    return store.listLibrary()
  })

}

module.exports = { registerResourceIpc }
