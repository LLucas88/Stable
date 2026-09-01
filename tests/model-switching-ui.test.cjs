'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')

function source(...segments) { return readFileSync(path.join(__dirname, '..', ...segments), 'utf8') }

test('renderer keeps conversation-scoped model switching without exposing the removed settings catalog', () => {
  const app = source('src', 'App.tsx')
  const types = source('src', 'types.ts')
  const preload = source('desktop', 'preload.cjs')
  const css = source('src', 'styles', 'app.css')

  assert.match(types, /export interface ModelProfile \{[\s\S]*id: string[\s\S]*hasApiKey: boolean/)
  assert.match(types, /export interface ModelCatalog \{[\s\S]*items: ModelProfile\[\][\s\S]*defaultModelId: string/)
  assert.match(types, /export interface ConversationItem \{[\s\S]*modelId: string/)
  assert.match(types, /models: ModelCatalog/)
  assert.doesNotMatch(types, /model: ModelSettings/)

  assert.match(preload, /configureModel: \(id, modelId\) => invoke\('stable:agent:configureModel'/)
  assert.match(preload, /save: \(profile\) => invoke\('stable:model:save'/)
  assert.match(preload, /remove: \(id\) => invoke\('stable:model:remove'/)
  assert.match(preload, /setDefault: \(id\) => invoke\('stable:model:setDefault'/)

  assert.match(app, /className="composer-menu model-menu"/)
  assert.match(app, /type="radio" name=\{`conversation-model-\$\{activeConversation\.id\}`\}/)
  assert.match(app, /当前对话 · 从下一条消息生效/)
  assert.match(app, /window\.stable\.agent\.configureModel\(activeConversation\.id, modelId\)/)
  assert.match(app, /role="status" aria-live="polite"/)
  assert.doesNotMatch(app, /className="model-profile-list"/)
  assert.doesNotMatch(app, /window\.stable\.model\.save\(form\)/)
  assert.doesNotMatch(app, /window\.stable\.model\.setDefault\(profile\.id\)/)
  assert.doesNotMatch(app, /window\.stable\.model\.remove\(profile\.id\)/)
  assert.match(app, /activeConversation\?\.modelId/)
  assert.doesNotMatch(app, /function validateProfile\(\)/)
  assert.doesNotMatch(app, /id: 'settings'/)
  assert.doesNotMatch(app, /function CloudModelSettings/)
  assert.match(css, /\.model-popover/)
  assert.match(css, /\.model-option:has\(input:focus-visible\)/)
})

test('main process snapshots the selected route before asynchronous message preparation', () => {
  const main = source('desktop', 'main.cjs')
  const sendHandler = main.slice(main.indexOf("ipcMain.handle('stable:agent:run'"), main.indexOf("ipcMain.handle('stable:agent:cancel'"))
  const runAgent = main.slice(main.indexOf('async function runAgent'), main.indexOf('async function runWorkflow'))

  assert.ok(sendHandler.indexOf('modelRegistry.resolve(conversation.modelId)') >= 0)
  assert.ok(sendHandler.indexOf('modelRegistry.resolve(conversation.modelId)') < sendHandler.indexOf('await extractAgentAttachments'))
  assert.match(sendHandler, /executionRunner\.run\(proposalPrompt\(query\), modelRoute\.model, modelRoute\.apiKey/)
  assert.match(sendHandler, /runAgent\([\s\S]*executionRunner, undefined, modelRoute\)/)
  assert.match(runAgent, /const modelRoute = modelRouteOverride \|\| modelRegistry\.resolve\(conversation\?\.modelId\)/)
  assert.match(runAgent, /const \{ model, apiKey \} = modelRoute/)
  assert.match(runAgent, /reviewer\.run\(reviewPrompt, model, apiKey/)
  assert.match(runAgent, /executionRunner\.run\(retryPrompt, model, apiKey/)
  assert.doesNotMatch(main, /getSetting\('model'\)/)
  assert.doesNotMatch(main, /secrets\.get\('apiKey'\)/)
})

test('bootstrap returns only redacted model metadata and model removal refreshes conversations', () => {
  const main = source('desktop', 'main.cjs')
  const registry = source('desktop', 'services', 'model-registry.cjs')
  const bootstrap = main.slice(main.indexOf('function bootstrap()'), main.indexOf('function automationState()'))
  const modelIpc = main.slice(main.indexOf("ipcMain.handle('stable:model:save'"), main.indexOf("ipcMain.handle('stable:settings:globalInstructions'"))

  assert.match(bootstrap, /models: modelRegistry\.publicCatalog\(\)/)
  assert.doesNotMatch(bootstrap, /apiKey/)
  assert.match(registry, /hasApiKey:/)
  assert.match(registry, /modelSecretKey/)
  assert.doesNotMatch(registry, /items: catalog\.items\.map\([\s\S]*apiKey:/)
  assert.match(modelIpc, /publishAgentState\(store\.activeConversationId\(\)\)/)
})
