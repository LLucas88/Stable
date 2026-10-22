'use strict'

function registerAutomationIpc({ ipcMain, store, automationState, publishAutomationState, automationRunners, executeAutomation, requireText, publishAgentState, agentState }) {
  ipcMain.handle('stable:automations:state', () => automationState())
  ipcMain.handle('stable:automations:save', (_event, payload) => {
    if (payload?.id) store.updateAutomation(requireText(payload.id, '定时任务 ID', 100), payload)
    else store.createAutomation(payload, 'manual')
    return publishAutomationState()
  })
  ipcMain.handle('stable:automations:enabled', (_event, payload) => {
    store.setAutomationEnabled(requireText(payload?.id, '定时任务 ID', 100), Boolean(payload?.enabled))
    return publishAutomationState()
  })
  ipcMain.handle('stable:automations:remove', (_event, payload) => {
    const id = requireText(payload?.id, '定时任务 ID', 100)
    if (automationRunners.has(id)) throw new Error('这个定时任务正在运行，请完成后再删除。')
    store.removeAutomation(id)
    return publishAutomationState()
  })
  ipcMain.handle('stable:automations:run', (_event, payload) => executeAutomation(requireText(payload?.id, '定时任务 ID', 100), true))
  ipcMain.handle('stable:automations:proposal', (_event, payload) => {
    const conversationId = requireText(payload?.conversationId, '对话 ID', 100)
    const messageId = requireText(payload?.messageId, '消息 ID', 100)
    const message = store.listMessages(conversationId).find((item) => item.id === messageId)
    if (!message?.automationProposal || message.automationProposal.status !== 'pending') throw new Error('这条自动化建议已经处理或不存在。')
    if (!payload?.accepted) {
      store.updateAutomationProposal(messageId, 'rejected')
      publishAgentState(conversationId)
      return { agent: agentState(conversationId), automations: publishAutomationState() }
    }
    const item = store.createAutomation(message.automationProposal, 'chat')
    store.updateAutomationProposal(messageId, 'accepted', item.id)
    publishAgentState(conversationId)
    return { agent: agentState(conversationId), automations: publishAutomationState() }
  })
}

module.exports = { registerAutomationIpc }
