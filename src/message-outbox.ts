export interface OutboxEntry<T> { id: string; payload: T; status: 'queued' | 'steering'; error?: string }
export interface OutboxResult { accepted: boolean; continue: boolean; error?: string }

// The composer owns this session-only outbox; switching conversations never changes its owner.
export class MessageOutbox<T> {
  private states = new Map<string, { items: OutboxEntry<T>[]; active?: OutboxEntry<T>; paused: boolean; steering: number }>()
  private callbacks: {
    run: (conversationId: string, entry: OutboxEntry<T>) => Promise<OutboxResult>
    steer: (conversationId: string, entry: OutboxEntry<T>) => Promise<void>
    changed: () => void
  }
  constructor(callbacks: MessageOutbox<T>['callbacks']) { this.callbacks = callbacks }
  private state(id: string) {
    if (!this.states.has(id)) this.states.set(id, { items: [], paused: false, steering: 0 })
    return this.states.get(id)!
  }
  snapshot(id: string) {
    const state = this.state(id)
    return { items: [...state.items], running: Boolean(state.active), paused: state.paused }
  }
  enqueue(id: string, payload: T) {
    const state = this.state(id)
    if (state.items.length >= 20) throw new Error('每个对话最多排队 20 条消息，请先处理现有队列。')
    const entry: OutboxEntry<T> = { id: crypto.randomUUID(), payload, status: 'queued' }
    state.items.push(entry)
    this.callbacks.changed()
    void this.drain(id)
    return entry.id
  }
  edit(id: string, entryId: string, payload: T) {
    const entry = this.state(id).items.find((item) => item.id === entryId)
    if (!entry || entry.status !== 'queued') return false
    entry.id = crypto.randomUUID(); entry.payload = payload; entry.error = undefined
    this.callbacks.changed()
    return true
  }
  remove(id: string, entryId: string) {
    const state = this.state(id)
    const index = state.items.findIndex((item) => item.id === entryId && item.status === 'queued')
    if (index < 0) return false
    state.items.splice(index, 1)
    this.callbacks.changed()
    return true
  }
  pause(id: string) { this.state(id).paused = true; this.callbacks.changed() }
  resume(id: string) { this.state(id).paused = false; this.callbacks.changed(); void this.drain(id) }
  async steer(id: string, entryId: string) {
    const state = this.state(id)
    const entry = state.items.find((item) => item.id === entryId)
    if (!entry || entry.status !== 'queued' || state.steering) return
    if (!state.active) {
      state.items = [entry, ...state.items.filter((item) => item !== entry)]
      this.resume(id)
      return
    }
    state.steering += 1; entry.status = 'steering'; entry.error = undefined
    this.callbacks.changed()
    try {
      await this.callbacks.steer(id, entry)
      state.items = state.items.filter((item) => item !== entry)
    } catch (error) {
      entry.status = 'queued'
      entry.error = error instanceof Error ? error.message : String(error)
      state.paused = true
    } finally {
      state.steering -= 1
      this.callbacks.changed()
      void this.drain(id)
    }
  }
  private async drain(id: string) {
    const state = this.state(id)
    if (state.active || state.paused || state.steering || !state.items.length) return
    const entry = state.items.shift()!
    state.active = entry
    this.callbacks.changed()
    let result: OutboxResult
    try { result = await this.callbacks.run(id, entry) }
    catch (error) { result = { accepted: false, continue: false, error: String(error) } }
    if (!result.accepted) { entry.error = result.error || '消息尚未发送，请检查后重试。'; state.items.unshift(entry) }
    if (!result.continue || !result.accepted) state.paused = true
    state.active = undefined
    this.callbacks.changed()
    void this.drain(id)
  }
}
