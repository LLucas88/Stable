'use strict'

const { contextBridge, ipcRenderer, webUtils } = require('electron')

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload)

contextBridge.exposeInMainWorld('stable', {
  bootstrap: () => invoke('stable:bootstrap'),
  cloud: {
    login: (username, password) => invoke('stable:cloud:login', { username, password }),
    changePassword: (currentPassword, newPassword, confirmPassword) => invoke('stable:cloud:changePassword', { currentPassword, newPassword, confirmPassword }),
    refresh: () => invoke('stable:cloud:refresh'),
    logout: () => invoke('stable:cloud:logout'),
  },
  data: {
    importFiles: () => invoke('stable:data:import'),
    importPaths: (paths) => invoke('stable:data:importPaths', { paths }),
    setEnabled: (id, enabled) => invoke('stable:data:enabled', { id, enabled }),
    remove: (id) => invoke('stable:data:remove', { id }),
  },
  knowledge: {
    importFiles: () => invoke('stable:knowledge:import'),
    importPaths: (paths) => invoke('stable:knowledge:importPaths', { paths }),
    get: (id) => invoke('stable:knowledge:get', { id }),
    setEnabled: (id, enabled) => invoke('stable:knowledge:enabled', { id, enabled }),
    remove: (id) => invoke('stable:knowledge:remove', { id }),
  },
  reports: {
    importFiles: () => invoke('stable:reports:import'),
    importPaths: (paths) => invoke('stable:reports:importPaths', { paths }),
    render: (draft) => invoke('stable:reports:render', draft),
    save: (draft) => invoke('stable:reports:save', draft),
    remove: (id) => invoke('stable:reports:remove', { id }),
    export: (id) => invoke('stable:reports:export', { id }),
  },
  library: {
    importFiles: (category) => invoke('stable:library:import', { category }),
    importPaths: (category, paths) => invoke('stable:library:importPaths', { category, paths }),
    rename: (id, name) => invoke('stable:library:rename', { id, name }),
    remove: (id) => invoke('stable:library:remove', { id }),
    run: (id) => invoke('stable:library:run', { id }),
    sendInput: (id, value) => invoke('stable:library:input', { id, value }),
    cancel: () => invoke('stable:library:cancel'),
    saveMarkdown: (id, content) => invoke('stable:library:saveMarkdown', { id, content }),
    onEvent: (handler) => {
      const listener = (_event, payload) => handler(payload)
      ipcRenderer.on('stable:library:event', listener)
      return () => ipcRenderer.removeListener('stable:library:event', listener)
    },
  },
  skills: {
    setEnabled: (id, enabled) => invoke('stable:skills:enabled', { id, enabled }),
    remove: (id) => invoke('stable:skills:remove', { id }),
  },
  workflows: {
    save: (workflow) => invoke('stable:workflows:save', workflow),
    remove: (id) => invoke('stable:workflows:remove', { id }),
    run: (id) => invoke('stable:workflows:run', { id }),
    cancel: () => invoke('stable:workflows:cancel'),
    enhanceInstruction: (node, prompt, effort) => invoke('stable:workflows:enhanceInstruction', { node, prompt, effort }),
    generate: (goal) => invoke('stable:workflows:generate', { goal }),
    onEvent: (handler) => {
      const listener = (_event, payload) => handler(payload)
      ipcRenderer.on('stable:workflows:event', listener)
      return () => ipcRenderer.removeListener('stable:workflows:event', listener)
    },
  },
  agent: {
    inspectAttachments: (paths) => invoke('stable:agent:inspectAttachments', { paths }),
    savePastedImage: (conversationId, name, mediaType, data) => invoke('stable:agent:savePastedImage', { conversationId, name, mediaType, data }),
    discardDraftImage: (path) => invoke('stable:agent:discardDraftImage', { path }),
    imagePreview: (path) => invoke('stable:agent:imagePreview', { path }),
    selectAttachmentFolder: () => invoke('stable:agent:selectAttachmentFolder'),
    selectSkillFolder: () => invoke('stable:agent:selectSkillFolder'),
    create: () => invoke('stable:agent:create'),
    state: (id) => invoke('stable:agent:state', { id }),
    select: (id) => invoke('stable:agent:select', { id }),
    rename: (id, title) => invoke('stable:agent:rename', { id, title }),
    remove: (id) => invoke('stable:agent:remove', { id }),
    configure: (id, capability, dataIds) => invoke('stable:agent:configure', { id, capability, dataIds }),
    configurePermission: (id, permissionMode) => invoke('stable:agent:configurePermission', { id, permissionMode }),
    configureModel: (id, modelId) => invoke('stable:agent:configureModel', { id, modelId }),
    run: (conversationId, prompt, attachments = [], references = []) => invoke('stable:agent:run', { conversationId, prompt, attachments, references }),
    cancel: (conversationId) => invoke('stable:agent:cancel', { conversationId }),
    answerApproval: (conversationId, requestId, allowed) => invoke('stable:agent:answerApproval', { conversationId, requestId, allowed }),
    clear: (conversationId) => invoke('stable:agent:clear', { conversationId }),
    onEvent: (handler) => {
      const listener = (_event, payload) => handler(payload)
      ipcRenderer.on('stable:agent:event', listener)
      return () => ipcRenderer.removeListener('stable:agent:event', listener)
    },
    onState: (handler) => {
      const listener = (_event, payload) => handler(payload)
      ipcRenderer.on('stable:agent:state', listener)
      return () => ipcRenderer.removeListener('stable:agent:state', listener)
    },
  },
  automations: {
    state: () => invoke('stable:automations:state'),
    save: (value) => invoke('stable:automations:save', value),
    setEnabled: (id, enabled) => invoke('stable:automations:enabled', { id, enabled }),
    remove: (id) => invoke('stable:automations:remove', { id }),
    run: (id) => invoke('stable:automations:run', { id }),
    decideProposal: (conversationId, messageId, accepted) => invoke('stable:automations:proposal', { conversationId, messageId, accepted }),
    onEvent: (handler) => {
      const listener = (_event, payload) => handler(payload)
      ipcRenderer.on('stable:automations:event', listener)
      return () => ipcRenderer.removeListener('stable:automations:event', listener)
    },
  },
  updater: {
    state: () => invoke('stable:update:state'),
    check: () => invoke('stable:update:check'),
    install: () => invoke('stable:update:install'),
    onEvent: (handler) => {
      const listener = (_event, payload) => handler(payload)
      ipcRenderer.on('stable:update:event', listener)
      return () => ipcRenderer.removeListener('stable:update:event', listener)
    },
  },
  team: {
    state: () => invoke('stable:team:state'),
    create: (teamName, deviceName, port) => invoke('stable:team:create', { teamName, deviceName, port }),
    join: (inviteCode, deviceName) => invoke('stable:team:join', { inviteCode, deviceName }),
    leave: () => invoke('stable:team:leave'),
    request: (targetDeviceId, sourceConversationId, title, instruction, requiredCapabilities = []) => invoke('stable:team:request', { targetDeviceId, sourceConversationId, title, instruction, requiredCapabilities }),
    collaborate: (sourceConversationId, title, instruction) => invoke('stable:team:collaborate', { sourceConversationId, title, instruction }),
    savePreferences: (preferences) => invoke('stable:team:preferences', preferences),
    setRole: (deviceId, role) => invoke('stable:team:role', { deviceId, role }),
    shareConversation: (targetDeviceId, conversationId) => invoke('stable:team:shareConversation', { targetDeviceId, conversationId }),
    decideConversation: (offerId, allowed) => invoke('stable:team:decideConversation', { offerId, allowed }),
    decide: (taskId, allowed) => invoke('stable:team:decide', { taskId, allowed }),
    cancel: (taskId) => invoke('stable:team:cancel', { taskId }),
    onEvent: (handler) => {
      const listener = (_event, payload) => handler(payload)
      ipcRenderer.on('stable:team:event', listener)
      return () => ipcRenderer.removeListener('stable:team:event', listener)
    },
  },
  model: {
    save: (profile) => invoke('stable:model:save', profile),
    remove: (id) => invoke('stable:model:remove', { id }),
    setDefault: (id) => invoke('stable:model:setDefault', { id }),
  },
  settings: {
    globalInstructions: () => invoke('stable:settings:globalInstructions'),
    saveGlobalInstructions: (content) => invoke('stable:settings:saveGlobalInstructions', { content }),
  },
  preview: {
    openWeb: (url, bounds) => invoke('stable:preview:openWeb', { url, bounds }),
    openFile: (path, bounds) => invoke('stable:preview:openFile', { path, bounds }),
    setBounds: (bounds) => invoke('stable:preview:setBounds', { bounds }),
    navigate: (action) => invoke('stable:preview:navigate', { action }),
    close: () => invoke('stable:preview:close'),
    onEvent: (handler) => {
      const listener = (_event, payload) => handler(payload)
      ipcRenderer.on('stable:preview:event', listener)
      return () => ipcRenderer.removeListener('stable:preview:event', listener)
    },
  },
  clipboard: {
    writeText: (text) => invoke('stable:clipboard:writeText', { text }),
  },
  appearance: {
    setTheme: (theme) => invoke('stable:appearance:theme', { theme }),
    completeLaunch: () => invoke('stable:appearance:launchComplete'),
    onLaunchStart: (handler) => {
      const listener = () => handler()
      ipcRenderer.on('stable:appearance:launchStart', listener)
      ipcRenderer.send('stable:appearance:launchReady')
      return () => ipcRenderer.removeListener('stable:appearance:launchStart', listener)
    },
  },
  system: {
    openPath: (path) => invoke('stable:system:openPath', { path }),
    showItemInFolder: (path) => invoke('stable:system:showItemInFolder', { path }),
  },
  files: {
    path: (file) => webUtils.getPathForFile(file),
  },
})
