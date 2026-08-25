'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { renderReportHtml } = require('../desktop/services/reports.cjs')

test('report renderer creates standalone escaped HTML with manual table and icon', () => {
  const html = renderReportHtml({
    name: '会员周报',
    mode: 'builder',
    components: [
      { id: 'title', type: 'text', variant: 'title', content: '会员周报 <script>alert(1)</script>' },
      { id: 'table', type: 'table', rows: [['指标', '数值'], ['复购率', '32%']] },
      { id: 'icon', type: 'icon', icon: 'check', title: '已核对', caption: '仅使用已确认数据' },
    ],
  })
  assert.match(html, /^<!doctype html>/)
  assert.match(html, /会员周报 &lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>alert/)
  assert.match(html, /<th>指标<\/th>/)
  assert.match(html, /<td>32%<\/td>/)
  assert.match(html, /report-icon-block/)
  assert.match(html, /<meta name="viewport"/)
})

test('source reports are preserved exactly', () => {
  const source = '<!doctype html><html><body><h1>原始报告</h1></body></html>'
  assert.equal(renderReportHtml({ mode: 'source', html: source }), source)
})

test('studio reports preserve the generated standalone HTML', () => {
  const source = '<!doctype html><title>Stable Studio</title><main>Saved project</main>'
  assert.equal(renderReportHtml({ mode: 'studio', html: source }), source)
})
