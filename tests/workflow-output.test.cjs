'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { existsSync, mkdtempSync, readFileSync, rmSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const JSZip = require('jszip')
const XLSX = require('xlsx')
const { normalizeOutputFormat, writeWorkflowOutput } = require('../desktop/services/workflow-output.cjs')

test('workflow outputs create real Markdown, HTML, Excel and PowerPoint files', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-workflow-output-'))
  const outputDirectory = path.join(root, 'missing', 'outputs')
  const content = '# 会员经营结论\n\n复购率提升 3%，下一步验证第二单转化。'
  try {
    const markdown = await writeWorkflowOutput({ directory: outputDirectory, name: '周报.md', format: 'markdown', content })
    const html = await writeWorkflowOutput({ directory: outputDirectory, name: '周报', format: 'html', content })
    const excel = await writeWorkflowOutput({ directory: outputDirectory, name: '周报', format: 'xlsx', content })
    const powerpoint = await writeWorkflowOutput({ directory: outputDirectory, name: '周报', format: 'pptx', content })

    assert.equal(path.extname(markdown.path), '.md')
    assert.equal(readFileSync(markdown.path, 'utf8'), content)
    assert.match(readFileSync(html.path, 'utf8'), /<!doctype html>/)
    assert.match(readFileSync(html.path, 'utf8'), /复购率提升 3%/)

    const workbook = XLSX.readFile(excel.path)
    assert.equal(workbook.SheetNames[0], '输出')
    assert.match(XLSX.utils.sheet_to_csv(workbook.Sheets['输出']), /第二单转化/)

    const pptx = await JSZip.loadAsync(readFileSync(powerpoint.path))
    assert.ok(pptx.file('ppt/presentation.xml'))
    assert.ok(pptx.file('ppt/slideMasters/slideMaster1.xml'))
    assert.ok(pptx.file('ppt/slides/slide1.xml'))
    assert.match(await pptx.file('ppt/slides/slide1.xml').async('string'), /复购率提升 3%/)
    assert.ok([markdown.path, html.path, excel.path, powerpoint.path].every(existsSync))
    assert.equal(normalizeOutputFormat('unknown'), 'markdown')

    const scriptArtifact = path.join(root, '脚本生成结果.xlsx')
    XLSX.writeFile(workbook, scriptArtifact)
    const copied = await writeWorkflowOutput({ directory: outputDirectory, name: '工作流汇总', format: 'xlsx', content: `脚本日志\n处理完成：${scriptArtifact}\nProgram finished.` })
    assert.equal(copied.sourcePath, scriptArtifact)
    assert.deepEqual(readFileSync(copied.path), readFileSync(scriptArtifact))
  } finally { rmSync(root, { recursive: true, force: true }) }
})
