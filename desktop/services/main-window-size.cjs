'use strict'

function defaultMainWindowSize({ scaleFactor, workArea }) {
  // Product defaults are physical pixels, while Electron uses DIP.
  const width = Math.min(Math.round(1520 / scaleFactor), workArea.width)
  const height = Math.min(Math.round(1063 / scaleFactor), workArea.height)
  return { width, height, minWidth: Math.min(1180, width), minHeight: Math.min(720, height) }
}

function applyDefaultMainWindowSize(window, display) {
  const { width, height, minWidth, minHeight } = defaultMainWindowSize(display)
  const { workArea } = display
  window.setMinimumSize(minWidth, minHeight)

  const current = window.getBounds()
  const x = Math.min(Math.max(current.x, workArea.x), workArea.x + workArea.width - width)
  const y = Math.min(Math.max(current.y, workArea.y), workArea.y + workArea.height - height)
  if (current.x === x && current.y === y && current.width === width && current.height === height) return

  // Fractional Windows DPI can add border rounding when setting native bounds.
  let requestedWidth = width, requestedHeight = height
  for (let attempt = 0; attempt < 4; attempt++) {
    window.setBounds({ x, y, width: requestedWidth, height: requestedHeight })
    const actual = window.getBounds()
    if (actual.width === width && actual.height === height) break
    requestedWidth += width - actual.width
    requestedHeight += height - actual.height
  }
}

module.exports = { defaultMainWindowSize, applyDefaultMainWindowSize }
