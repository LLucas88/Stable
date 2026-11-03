'use strict'
const { localHtmlSource } = require('./local-html-preview.cjs')
const { resolveWorkspaceEntry } = require('./preview.cjs')

const OFFLINE_BROWSER_MESSAGE = '当前任务禁止联网；浏览器仅允许预览本任务工作区的本地 HTML，不能访问远程页面或资源。'

// Trust only URLs minted by LocalHtmlPreview, never an arbitrary localhost URL.
// Keep the restriction on the tab after an operation, including delayed requests.
function previewNetworkScope(value, workspace, previous) {
  let source = localHtmlSource(value)
  let prefix
  if (source) {
    const url = new URL(value)
    prefix = `${url.origin}/${url.pathname.split('/')[1]}/`
  } else if (previous && allowsPreviewRequest(previous, { url: value, resourceType: 'mainFrame' })) {
    source = previous.source; prefix = previous.prefix
  }
  if (!source || !workspace) throw Error(OFFLINE_BROWSER_MESSAGE)
  resolveWorkspaceEntry(source, workspace, { fileOnly: true })
  return { source, prefix }
}

function allowsPreviewRequest(scope, { url, method = 'GET', resourceType }) {
  if (!scope || !['GET', 'HEAD'].includes(method)) return false
  if (['image', 'font', 'media'].includes(resourceType) && /^(data|blob):/i.test(url)) return true
  try {
    const target = new URL(url)
    return !target.username && !target.password && target.href.startsWith(scope.prefix)
  } catch { return false }
}

module.exports = { previewNetworkScope, allowsPreviewRequest, OFFLINE_BROWSER_MESSAGE }
