import { useEffect } from 'react'

// Keep the scrollbar gutter stable; reveal only the thumb during scrolling.
export function useTransientScrollbar(element: HTMLElement | null) {
  useEffect(() => {
    if (!element) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onScroll = () => {
      element.dataset.scrolling = 'true'
      clearTimeout(timer)
      timer = setTimeout(() => { delete element.dataset.scrolling }, 1000)
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      element.removeEventListener('scroll', onScroll)
      clearTimeout(timer)
      delete element.dataset.scrolling
    }
  }, [element])
}
