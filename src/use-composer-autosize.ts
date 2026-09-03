import { useLayoutEffect, type RefObject } from 'react'

function resizeComposer(element: HTMLTextAreaElement, followTypedEnd = false) {
  if (!element.getClientRects().length) return
  const style = getComputedStyle(element)
  const baseHeight = parseFloat(style.minHeight)
  const maxHeight = parseFloat(style.maxHeight)
  const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
  const lineHeight = parseFloat(style.lineHeight)
  const scrollTop = element.scrollTop
  // Reset to the baseline to measure shrinking text too. A stable scrollbar
  // gutter keeps soft-wrap measurements identical before and after expansion.
  element.style.height = `${baseHeight}px`
  const contentHeight = element.scrollHeight
  const exceedsFourLines = contentHeight - padding > 4 * lineHeight + 1
  element.style.height = `${exceedsFourLines ? Math.min(maxHeight, Math.max(baseHeight, contentHeight)) : baseHeight}px`
  const typingAtEnd = followTypedEnd && document.activeElement === element
    && element.selectionStart === element.selectionEnd && element.selectionEnd === element.value.length
  element.scrollTop = typingAtEnd ? element.scrollHeight : scrollTop
}

export function useComposerAutosize(ref: RefObject<HTMLTextAreaElement>, value: string, active: boolean) {
  useLayoutEffect(() => {
    if (active && ref.current) resizeComposer(ref.current, true)
  }, [ref, value, active])

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || !active) return
    const resize = () => resizeComposer(element)
    let width = element.getBoundingClientRect().width
    const observer = new ResizeObserver(() => {
      const nextWidth = element.getBoundingClientRect().width
      if (nextWidth === width) return // Height changes must not create a resize loop.
      width = nextWidth
      resize()
    })
    observer.observe(element)
    window.addEventListener('resize', resize)
    document.fonts.addEventListener('loadingdone', resize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      document.fonts.removeEventListener('loadingdone', resize)
    }
  }, [ref, active])
}
