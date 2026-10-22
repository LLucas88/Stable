'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { isBrowserScreenshotCommand, HTML_PREVIEW_GUIDANCE } = require('../desktop/services/browser-command-route.cjs')
test('direct Chrome screenshot attempts route to the shared browser, including all failed retry variants', () => {
  for (const flags of ['', '--user-data-dir="D:\\workspace\\profile"', '--no-sandbox --single-process --disable-crash-reporter']) {
    assert(isBrowserScreenshotCommand(`$tmp='D:\\workspace'\n& 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' --headless=new ${flags} --screenshot="$tmp\\shot.png" file:///D:/workspace/report.html 2>&1`))
  }
  assert(isBrowserScreenshotCommand('chromium --headless --screenshot=/tmp/a.png file:///workspace/a.html'))
  for (const command of ['Get-Content report.html', 'python check.py', 'node build.cjs', 'chrome --version', 'Write-Output "chrome --headless --screenshot"', 'echo "chromium --headless --screenshot"']) assert.equal(isBrowserScreenshotCommand(command), false, command)
  assert.match(HTML_PREVIEW_GUIDANCE, /无需立即重复 read/)
  assert.match(HTML_PREVIEW_GUIDANCE, /resize\(width,height\)/)
  assert.match(HTML_PREVIEW_GUIDANCE, /仅打开网页或检查源码不等于视觉验证通过/)
})
