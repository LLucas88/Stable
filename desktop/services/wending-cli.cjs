'use strict'

const { spawn } = require('node:child_process')
const { existsSync, readFileSync, mkdirSync, unlinkSync } = require('node:fs')
const { createHash } = require('node:crypto')
const path = require('node:path')
const { WendingLoginBridge } = require('./wending-login.cjs')

const WENDING_CLI_ID = 'wending-cli'
const WENDING_CLI_VERSION = '0.9.0.dev9'
const WENDING_CLI_PROMPT = '调用问鼎cli：我需要做...'

function wendingCliRoot({ appPath, packaged, resourcesPath }) {
  return packaged
    ? path.join(resourcesPath, 'wending-cli')
    : path.join(appPath, 'vendor', 'wending-cli')
}

function wendingCliFiles(root) {
  return {
    command: path.join(root, 'crm-brand-cli.cmd'),
    python: path.join(root, 'python', 'python.exe'),
    brand: path.join(root, 'python', 'Lib', 'site-packages', 'crm_cli', 'cli.py'),
    base: path.join(root, 'python', 'Lib', 'site-packages', 'crm_base_cli', 'cli.py'),
    click: path.join(root, 'python', 'Lib', 'site-packages', 'click', '__init__.py'),
    login: path.join(root, 'stable-login.py'),
    guide: path.join(root, 'login-guide.md'),
    scope: path.join(root, 'python', 'Lib', 'site-packages', 'crm_base_cli', 'stable_scope.py'),
    response: path.join(root, 'python', 'Lib', 'site-packages', 'crm_base_cli', 'stable_response.py'),
  }
}

function createWendingEnvironment(baseEnvironment, root) {
  const environment = { ...(baseEnvironment || {}) }
  const pathKey = Object.keys(environment).find((key) => key.toUpperCase() === 'PATH') || 'PATH'
  const currentPath = String(environment[pathKey] || '')
  environment[pathKey] = [root, currentPath].filter(Boolean).join(path.delimiter)
  environment.PYTHONUTF8 = '1'
  environment.PYTHONIOENCODING = 'utf-8'
  environment.STABLE_WENDING_CLI_HOME = root
  return environment
}

function cleanOutput(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
}

function isWendingCliPrompt(value, history = []) {
  const mention = /问鼎\s*cli|crm-brand-cli/i
  return mention.test(String(value || '')) || history.some((item) => item.role === 'user' && mention.test(String(item.content || '')))
}

function wendingCliAgentInstruction() {
  return [
    '## Stable 内置问鼎 CLI',
    '- 本机已内置 `crm-brand-cli`，直接在当前 Stable 工作区执行；不要安装、升级或下载任何 CLI 包。',
    '- 直接调用内置 CLI；不要在工作区复制或生成 crm-brand-cli.py 包装脚本，同名脚本不具有内置 CLI 的可信身份。',
    '- 需要结构化结果时优先使用 `crm-brand-cli --json ...`；需要确认能力时先运行 `crm-brand-cli --help`。',
    '- 登录只在「MCP & CLI → 使用」的专用表单完成。不要在聊天中索取手机号或验证码，不要执行 third login 的发码、验证、授权或登出命令。',
    '- 不得输出登录令牌或 `.crm-cli/config.json` 的内容。',
    '- `FAIL_BIZ_04` / “当前品牌无权访问该数据集”是平台数据权限问题，不是未安装或空数据。一次确认后停止重复请求该数据集，说明所需权限并请用户联系管理员。',
    '- 用户指定通过 CLI 获取实时数据时，不得擅自用本地历史快照替代；需要变更数据来源、日期口径或交付内容，先让用户确认。',
  ].join('\n')
}

class WendingCliService {
  constructor(options) {
    this.options = options
    this.conversations = new Map()
    this.login = new WendingLoginBridge({ ...options, root: () => this.root(), environment: () => this.environment() })
  }

  root() {
    return wendingCliRoot(this.options)
  }

  forConversation(id) {
    if (!id) return this
    if (!this.conversations.has(id)) {
      const configDirectory = path.join(this.options.userData || path.dirname(this.options.workspace), 'wending', 'conversations', createHash('sha256').update(String(id)).digest('hex'))
      mkdirSync(configDirectory, { recursive: true })
      this.conversations.set(id, new WendingCliService({ ...this.options, configDirectory }))
    }
    return this.conversations.get(id)
  }

  binding() {
    if (!this.options.configDirectory) return this.login.snapshot()
    try {
      const cfg = JSON.parse(readFileSync(path.join(this.options.configDirectory, 'config.json'), 'utf8'))
      const decode = (key) => typeof cfg[key] === 'string' ? Buffer.from(cfg[key], 'base64').toString('utf8') : ''
      const channel = decode('third_login_channel') === '1' ? '1' : '0'
      return { phase: 'unknown', channel, brandLabel: decode('stable_brand_label').slice(0, 200), detail: '此任务的独立登录配置已保存，使用时核验服务端品牌。' }
    } catch { return this.login.snapshot() }
  }

  dispose() {
    this.login.dispose()
    for (const cli of this.conversations.values()) cli.dispose()
  }

  removeConversation(id) {
    const cli = this.forConversation(id)
    cli.dispose()
    const file = path.join(cli.options.configDirectory, 'config.json')
    if (existsSync(file)) unlinkSync(file)
    this.conversations.delete(id)
  }

  status() {
    if (process.platform !== 'win32') {
      return { id: WENDING_CLI_ID, status: 'unavailable', version: WENDING_CLI_VERSION, detail: '问鼎 CLI 当前仅支持 Windows。' }
    }
    const files = wendingCliFiles(this.root())
    const missing = Object.entries(files).filter(([, file]) => !existsSync(file)).map(([name]) => name)
    if (missing.length) {
      return { id: WENDING_CLI_ID, status: 'unavailable', version: WENDING_CLI_VERSION, detail: `内置资源不完整：${missing.join('、')}` }
    }
    return { id: WENDING_CLI_ID, status: 'bundled', version: WENDING_CLI_VERSION, detail: '运行环境与服务包已内置，使用前将执行版本自检。' }
  }

  environment(baseEnvironment = process.env) {
    const environment = createWendingEnvironment(baseEnvironment, this.root())
    delete environment.WENDING_CONFIG_DIR
    if (this.options.configDirectory) environment.WENDING_CONFIG_DIR = this.options.configDirectory
    return environment
  }

  agentInstruction() {
    const state = this.login.snapshot()
    const summary = state.phase === 'ready' ? '已核验登录与品牌；不代表拥有所有数据集权限。' : '登录状态尚未完成核验；需要登录时引导用户打开专用表单。'
    const binding = this.binding()
    const scope = this.options.configDirectory ? `\n- 此任务使用独立问鼎登录配置；仅在任务顶部「问鼎 CLI」表单登录。绑定品牌：${binding.brandLabel || '尚未绑定'}。不得沿用历史消息中的品牌假设或其他任务的登录配置。不得覆盖 WENDING_CONFIG_DIR，不得读取、复制或切换其他任务的凭据。` : ''
    return `${wendingCliAgentInstruction()}\n- 登录状态（脱敏）：${summary}\n\n${readFileSync(wendingCliFiles(this.root()).guide, 'utf8')}${scope}`
  }

  async prepare() {
    const generation = this.login.generation
    const checked = await this.verify()
    return { ...checked, login: checked.status === 'ready' && generation === this.login.generation ? await this.login.request('check') : this.login.snapshot() }
  }

  async verify() {
    const current = this.status()
    if (current.status === 'unavailable') return current
    const files = wendingCliFiles(this.root())
    const environment = this.environment()
    return await new Promise((resolve) => {
      let stdout = ''
      let stderr = ''
      let settled = false
      let timer
      const finish = (value) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        resolve(value)
      }
      let child
      try {
        child = (this.options.spawn || spawn)(files.python, ['-X', 'utf8', '-m', 'crm_cli.cli', '--version'], {
          cwd: this.options.workspace,
          env: environment,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      } catch (error) {
        finish({ ...current, status: 'unavailable', detail: `无法启动内置服务：${cleanOutput(error?.message || error)}` })
        return
      }
      timer = setTimeout(() => {
        try { child.kill() } catch {}
        finish({ ...current, status: 'unavailable', detail: '内置服务版本检查超时。' })
      }, 15_000)
      child.stdout?.on('data', (chunk) => { stdout = (stdout + chunk.toString('utf8')).slice(-16_000) })
      child.stderr?.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(-16_000) })
      child.once('error', (error) => finish({ ...current, status: 'unavailable', detail: `无法启动内置服务：${cleanOutput(error?.message || error)}` }))
      child.once('close', (code) => {
        const output = cleanOutput(`${stdout}\n${stderr}`)
        if (code === 0 && output.includes(WENDING_CLI_VERSION)) {
          finish({ ...current, status: 'ready', detail: `问鼎 CLI ${WENDING_CLI_VERSION} 可运行；登录态需单独检查。` })
        } else {
          finish({ ...current, status: 'unavailable', detail: output || `版本检查失败（退出码 ${code}）。` })
        }
      })
    })
  }
}

module.exports = {
  WENDING_CLI_ID,
  WENDING_CLI_PROMPT,
  WENDING_CLI_VERSION,
  WendingCliService,
  createWendingEnvironment,
  isWendingCliPrompt,
  wendingCliAgentInstruction,
  wendingCliFiles,
  wendingCliRoot,
}
