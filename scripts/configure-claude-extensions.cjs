'use strict'

// Configuration/validation only. Never starts processes or contacts servers.
const fs = require('node:fs')
const path = require('node:path')
const { loadClaudeExtensions, configurationPath } = require('../desktop/services/claude-extensions.cjs')
const args = process.argv.slice(2)
const command = args[0]
if (!['--init', '--validate'].includes(command) || args.length > 2) {
  console.error('Usage: node scripts/configure-claude-extensions.cjs --init|--validate [userData directory]')
  process.exitCode = 1
} else {
  try {
    const userData = args[1] ? path.resolve(args[1]) : path.join(process.env.APPDATA, 'stable-desktop')
    const file = configurationPath(userData)
    if (command === '--init') {
      const root = path.dirname(file)
      fs.mkdirSync(root, { recursive: true })
      const info = fs.lstatSync(root)
      if (!info.isDirectory() || info.isSymbolicLink() || fs.realpathSync(root).toLowerCase() !== path.resolve(root).toLowerCase()) throw Error('配置目录不能使用链接。')
      try { fs.writeFileSync(file, JSON.stringify({ version: 1, enabled: false, mcpServers: {}, plugins: [] }, null, 2) + '\n', { flag: 'wx', mode: 0o600 }) }
      catch (error) { if (error.code !== 'EEXIST') throw error }
    }
    const result = loadClaudeExtensions(userData)
    console.log(JSON.stringify({ file, valid: true, enabled: result.enabled, mcpServers: Object.keys(result.servers), skills: result.skills.length, runtimeLoading: false }, null, 2))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
