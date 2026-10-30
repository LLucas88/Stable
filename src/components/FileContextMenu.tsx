import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { FileText, AppWindow, ExternalLink, Download, Copy, FolderOpen, Clipboard } from 'lucide-react'

type Action = 'openWith' | 'browser' | 'saveAs' | 'copyPath' | 'copyContent' | 'reveal'
export function useFileContextMenu({ path, name, onOpen, disabled = false }: { path: string; name: string; onOpen: () => void; disabled?: boolean }) {
  const [position, setPosition] = useState<{ x: number; y: number }>()
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const close = () => { setPosition(undefined); trigger.current?.focus() }
  useEffect(() => { setPosition(undefined); setError('') }, [path, disabled])
  useEffect(() => {
    if (!position) return
    const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setPosition(undefined) }
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close() } }
    const resize = () => setPosition(undefined)
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape); window.addEventListener('resize', resize)
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('resize', resize) }
  }, [Boolean(position)])
  useLayoutEffect(() => {
    if (!position || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const x = Math.max(8, Math.min(position.x, innerWidth - rect.width - 8)), y = Math.max(8, Math.min(position.y, innerHeight - rect.height - 8))
    if (x !== position.x || y !== position.y) setPosition({ x, y })
  }, [position])
  function open(event: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    event.preventDefault(); event.stopPropagation(); setError(''); trigger.current = event.currentTarget
    const rect = event.currentTarget.getBoundingClientRect()
    setPosition('clientX' in event && event.clientX ? { x: event.clientX, y: event.clientY } : { x: rect.left, y: rect.bottom })
  }
  async function act(action?: Action) {
    close(); setError('')
    try { if (action) await window.stable.system.fileAction(path, action); else onOpen() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const extension = path.split('.').pop()?.toLowerCase() || ''
  const items = [
    { label: '打开文件', Icon: FileText },
    { label: '打开方式…', Icon: AppWindow, action: 'openWith' as Action },
    { label: '在外部浏览器中打开', Icon: ExternalLink, action: 'browser' as Action, disabled: !/^(html?|pdf|svg|png|jpe?g|gif|webp|txt)$/.test(extension) },
    { label: '另存为…', Icon: Download, action: 'saveAs' as Action },
    { label: '复制路径', Icon: Copy, action: 'copyPath' as Action },
    { label: '复制文件内容', Icon: Clipboard, action: 'copyContent' as Action, disabled: !/^(txt|md|markdown|mdx|html?|css|jsx?|tsx?|cjs|mjs|jsonl?|ya?ml|toml|csv|tsv|xml|svg|py|sh|sql|log|ini)$/.test(extension) },
    { label: '在资源管理器中打开', Icon: FolderOpen, action: 'reveal' as Action },
  ]
  return {
    handlers: { onContextMenu: open, onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => { if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') open(event) }, 'aria-haspopup': 'menu' as const, 'aria-expanded': Boolean(position) },
    menu: position && createPortal(<div className="conversation-file-menu file-actions-menu" role="menu" aria-label={`${name} 文件操作`} ref={menuRef} style={{ left: position.x, top: position.y }} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      if (event.key === 'Tab') { setPosition(undefined); return }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
      buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus()
    }}>{items.map(({ label, Icon, action, disabled }, index) => <button type="button" role="menuitem" tabIndex={-1} disabled={disabled} data-divider={index === 3 || undefined} key={label} onClick={() => void act(action)}><Icon size={15} aria-hidden="true"/><span>{label}</span></button>)}</div>, document.body),
    error: error && <span className="conversation-file-error" role="alert">{error}</span>,
  }
}
