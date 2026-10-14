'use strict'

const HTML_PREVIEW_GUIDANCE = 'HTML 截图和视觉验证使用 stable_browser：先 open（url 为工作区 HTML 的 Windows 绝对路径），再用返回的 tabId 调用 read 和 screenshot。audit 是只读布局检查，返回当前视口、弹层边界/越界、隐藏标题及其样式、零尺寸图表和横向溢出；不需要控制台诊断权限，也不执行任意脚本。不以 audit 无异常代替截图和实际交互验收。跨轮本地预览 URL 可能过期，继续验收时重新 open 原 HTML 的绝对路径，使用新 tabId 和最新 read 的 ref。wait 的 value 是等待出现的页面文字，不是等待毫秒数；不要用 value="1500" 等方式等待动画。不要通过 Bash 启动 Chrome/Edge/Chromium 截图，也不要改用 --no-sandbox 或反复尝试用户目录参数。浏览器工具关闭、被用户接管或截图失败时说明尚未完成视觉验证；仅打开网页或检查源码不等于视觉验证通过。'

// Route recognizable direct screenshot launches only, not arbitrary shell text
// or browser mentions in documentation. This is tool guidance, not a sandbox.
function isBrowserScreenshotCommand(command) {
  return String(command).split(/\r?\n/).some(line => {
    const launch = line.match(/^\s*(?:&\s*)?(?:"[^"\r\n]*(?:chrome|chromium|msedge)(?:\.exe)?"|'[^'\r\n]*(?:chrome|chromium|msedge)(?:\.exe)?'|(?:[\w./:\\-]*[\\/])?(?:google-chrome(?:-stable)?|chrome|chromium(?:-browser)?|msedge)(?:\.exe)?)(?=\s|$)(.*)$/i)
    return Boolean(launch && /--headless(?:=\S+)?(?:\s|$)/i.test(launch[1]) && /--screenshot(?:=|\s|$)/i.test(launch[1]))
  })
}

module.exports = { HTML_PREVIEW_GUIDANCE, isBrowserScreenshotCommand }
