import { useEffect, useRef, useState } from 'react'
import type { DevReloadState } from './types'
import './styles/dev-update-notice.css'

export function DevUpdateNotice() {
  const [state, setState] = useState<DevReloadState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const latest = useRef<DevReloadState | null>(null)
  const eventSequence = useRef(0)
  const generation = useRef(0)
  const inFlight = useRef(false)

  function accept(next: DevReloadState) {
    if (latest.current && next.revision < latest.current.revision) return
    if (next.revision !== latest.current?.revision) setError('')
    latest.current = next
    setState(next)
  }

  useEffect(() => {
    const api = window.stable?.development
    if (!api) return
    const mounted = ++generation.current
    const unsubscribe = api.onState(next => {
      if (generation.current !== mounted) return
      eventSequence.current++
      accept(next)
    })
    const observed = eventSequence.current
    void api.state().then(next => {
      if (generation.current === mounted && eventSequence.current === observed) accept(next)
    }).catch(() => { /* The subscription can still deliver subsequent changes. */ })
    return () => {
      generation.current++
      unsubscribe()
    }
  }, [])

  async function apply() {
    const api = window.stable?.development
    const current = latest.current
    if (!api || !current?.enabled || !current.action || current.applying || current.blocked || inFlight.current) return
    const mounted = generation.current
    const observed = eventSequence.current
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const next = await api.apply(current.revision)
      // Live events may describe a newer edit or an operation which has already
      // finished; the reply to this older click must not roll either one back.
      if (generation.current === mounted && eventSequence.current === observed) accept(next)
    } catch (reason) {
      if (generation.current === mounted && latest.current?.revision === current.revision) {
        setError(reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '更新未完成，请重试。')
        accept({ ...latest.current, applying: false })
      }
    } finally {
      if (generation.current === mounted) {
        inFlight.current = false
        setBusy(false)
      }
    }
  }

  if (!state?.enabled || !state.action || state.action === 'reload' && !state.message && !error) return null
  const restarting = state.action === 'restart'
  const applying = busy || state.applying
  const message = error || state.message
  return <section className="dev-update-notice" role="status" aria-live="polite" aria-atomic="true" aria-label="开发更新">
    <div>
      <p>{restarting ? '源码有更新' : '界面有更新'}</p>
      {message && <small>{message}</small>}
    </div>
    <button type="button" disabled={applying || state.blocked} onClick={() => void apply()}>
      {applying ? restarting ? '重启中…' : '刷新中…' : restarting ? '重启应用' : '刷新界面'}
    </button>
  </section>
}
