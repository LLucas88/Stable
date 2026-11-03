import type { DesignRequest } from '../types'
export type DesignPreferenceResult = { design: DesignRequest; revision: number; conflict: boolean }
type Pending = { design: DesignRequest; revision: number }
export class DesignPreferenceWriter {
  pending: Record<string, Pending> = {}
  values: Record<string, DesignRequest> = {}
  errors: Record<string, string> = {}
  private revisions: Record<string, number> = {}
  private running = new Map<string, Promise<void>>()
  constructor(private write: (id: string, value: DesignRequest, revision: number) => Promise<DesignPreferenceResult>, private changed: () => void, private storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const saved = JSON.parse(storage?.getItem('stable.design-preferences.pending.v1') || '{}')
      for (const [id, entry] of Object.entries(saved || {})) {
        const p = entry as Pending
        if (p?.design && typeof p.design === 'object' && Number.isSafeInteger(p.revision) && p.revision >= 0) {
          this.pending[id] = p; this.values[id] = p.design; this.revisions[id] = p.revision
        }
      }
    } catch { /* Invalid recovery data must not prevent opening the app. */ }
  }
  private journal() {
    try { this.storage?.setItem('stable.design-preferences.pending.v1', JSON.stringify(this.pending)) }
    catch { /* IPC remains the authoritative save; errors below stay visible. */ }
    this.changed()
  }
  save(id: string, value: DesignRequest, revision: number) {
    const design = structuredClone(value)
    this.values[id] = design
    this.pending[id] = { design, revision: this.revisions[id] ?? revision }
    delete this.errors[id]; this.journal(); void this.drain(id)
  }
  retry(id: string) { delete this.errors[id]; void this.drain(id) }
  observe(id: string, design: DesignRequest | undefined, revision: number) {
    if (design && !this.pending[id] && revision > (this.revisions[id] ?? -1)) {
      this.revisions[id] = revision; this.values[id] = structuredClone(design); this.changed()
    }
  }
  restore(ids: string[]) { for (const id of ids) if (this.pending[id] && !this.errors[id]) void this.drain(id) }
  async flush() { await Promise.all([...this.running.values()]); return !Object.keys(this.pending).length }
  private drain(id: string): Promise<void> {
    const active = this.running.get(id); if (active) return active
    const run = Promise.resolve().then(async () => {
      while (this.pending[id] && !this.errors[id]) {
        const current = this.pending[id]
        try {
          const result = await this.write(id, current.design, current.revision)
          if (!Number.isSafeInteger(result.revision)) throw Error('参数保存未收到有效确认，请重试。')
          this.revisions[id] = result.revision
          if (result.conflict) {
            this.pending[id].revision = result.revision
            throw Error('另一窗口已修改参数。本窗口修改已保留，重试将保存当前选择。')
          }
          if (this.pending[id] === current) delete this.pending[id]
          else this.pending[id].revision = result.revision
        } catch (error) { this.errors[id] = error instanceof Error ? error.message : '参数保存失败，请重试。' }
        this.journal()
      }
    }).finally(() => this.running.delete(id))
    this.running.set(id, run); return run
  }
}
