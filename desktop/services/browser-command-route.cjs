'use strict'

const HTML_PREVIEW_GUIDANCE = 'HTML 截图和视觉验证使用 stable_browser：先 open（url 为工作区 HTML 的 Windows 绝对路径），返回值已含正文和控件，无需立即重复 read。用返回的 tabId 调用 screenshot；检查手机和桌面布局时直接 resize(width,height)，后续点击、滚动和截图保持此视口，不要创建临时 iframe 包装页模拟尺寸。只需单次检查时 audit/screenshot 可传 width/height，完成后恢复原尺寸。audit 是只读布局检查，返回当前视口、弹层边界/越界、隐藏标题及其样式、零尺寸图表和横向溢出；不需要控制台诊断权限，也不执行任意脚本。不以 audit 无异常代替截图和实际交互验收。先按代表性视口和关键交互检查，修改后只复查受影响部分；页面状态未变时不重复截图或全页 audit。操作后的精简快照仍含最新控件 ref；只有需要完整正文或表格时再 read 或 detail=full。读取含内嵌图片的大 HTML 时，先检查文件大小，再用脚本只提取相关 CSS/JS 和图片尺寸，不把 base64 全文输出到上下文，不复制整份 HTML 来阅读源码。跨轮本地预览 URL 可能过期，继续验收时重新 open 原 HTML 的绝对路径，使用新 tabId 和最新快照的 ref。wait 的 value 是等待出现的页面文字，不是等待毫秒数；不要用 value="1500" 等方式等待动画。不要通过 Bash 启动 Chrome/Edge/Chromium 截图，也不要改用 --no-sandbox 或反复尝试用户目录参数。浏览器工具关闭、被用户接管或截图失败时说明尚未完成视觉验证；仅打开网页或检查源码不等于视觉验证通过。'

// Route recognizable direct screenshot launches only, not arbitrary shell text
// or browser mentions in documentation. This is tool guidance, not a sandbox.
function isBrowserScreenshotCommand(command) {
  return String(command).split(/\r?\n/).some(line => {
    const launch = line.match(/^\s*(?:&\s*)?(?:"[^"\r\n]*(?:chrome|chromium|msedge)(?:\.exe)?"|'[^'\r\n]*(?:chrome|chromium|msedge)(?:\.exe)?'|(?:[\w./:\\-]*[\\/])?(?:google-chrome(?:-stable)?|chrome|chromium(?:-browser)?|msedge)(?:\.exe)?)(?=\s|$)(.*)$/i)
    return Boolean(launch && /--headless(?:=\S+)?(?:\s|$)/i.test(launch[1]) && /--screenshot(?:=|\s|$)/i.test(launch[1]))
  })
}

module.exports = { HTML_PREVIEW_GUIDANCE: HTML_PREVIEW_GUIDANCE + ' 每张截图应回答一个尚未确认的视觉问题；相同页面、视口和滚动位置且无修改或交互变化时复用已有截图。先定位目标区域，再滚动到位拍摄，不在每次 read、scroll、click 后机械截图；需比较修改前后时保留两次证据。工具结果中的 contextReferences 或 identical 提示仅表示与本次上下文内指定结果完全一致，不代表页面整体或操作状态未变化，控件使用当前回包的 ref。', isBrowserScreenshotCommand }
