'use strict'
const path = require('node:path')
const { createRequire } = require('node:module')
const { existsSync } = require('node:fs')

function verifyBuiltinTools(context) {
  const root = context?.appDir || path.resolve(__dirname, '..')
  const vendor = path.join(root, 'vendor', 'agent-tools')
  try {
    const load = createRequire(path.join(vendor, 'package.json'))
    if (load('exceljs/package.json').version !== '4.4.0') throw new Error('ExcelJS version mismatch')
    if (typeof load('exceljs').Workbook !== 'function') throw new Error('Workbook unavailable')
    if (!existsSync(path.join(vendor, 'node_modules', 'exceljs', 'LICENSE'))) throw new Error('ExcelJS license missing')
    console.log('Stable built-in tools: ExcelJS 4.4.0 verified; browser uses bundled Electron.')
  } catch (error) { throw new Error(`内置工具依赖不完整，请在分支目录运行 npm run tools:install。${error.message}`) }
}
module.exports = verifyBuiltinTools
if (require.main === module) verifyBuiltinTools()
