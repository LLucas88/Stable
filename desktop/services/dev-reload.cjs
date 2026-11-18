'use strict'
// Only the development launcher can send these messages over its private child IPC.
function createDevReload({ prepare, reload, restart, send, confirmRestart = async () => true, onState = () => {}, intervalMs = 1500 }) {
  let pending = null, active = false, disposed = false, revision = 0, authorized = null, message = ''
  const state = () => ({ enabled: !disposed, revision, action: pending?.action || null, applying: active, blocked: pending?.blocked === true, message })
  const publish = () => { try { onState(state()) } catch { /* A notice renderer cannot authorize an update. */ } }
  const notice = action => action === 'restart' ? '主进程代码已更新，点击重启应用后生效。' : ''
  const current = request => !disposed && pending === request && !request.blocked && (request.action !== 'restart' || authorized === request.id)
  async function attempt() {
    if (active || !pending || pending.blocked || disposed || pending.action === 'restart' && authorized !== pending.id) return state()
    const request = pending
    active = true; message = request.action === 'restart' ? '正在检查重启条件…' : ''; publish()
    try {
      await prepare()
      if (!current(request)) return state()
      if (request.action === 'restart') {
        if (!await confirmRestart(request.id)) throw Error('启动器未确认接管重启，保留当前应用。')
        await prepare()
        if (!current(request)) {
          await send({ type: 'stable:dev:waiting', id: request.id, message: '代码再次变更，已取消旧的重启请求，请重新确认。' })
          return state()
        }
      }
      if (await send({ type: 'stable:dev:applying', id: request.id, action: request.action }) === false) throw Error('开发通信已断开，保留当前应用。')
      if (!current(request)) {
        await send({ type: 'stable:dev:waiting', id: request.id, message: '代码再次变更，已取消旧的更新请求。' })
        return state()
      }
      // IPC can wait while a new task starts or a draft becomes dirty. Recheck
      // readiness after that wait, then commit without another awaited send.
      await prepare()
      if (!current(request)) {
        await send({ type: 'stable:dev:waiting', id: request.id, message: '代码再次变更，已取消旧的更新请求。' })
        return state()
      }
      pending = null; authorized = null
      if (request.action === 'restart') { message = '正在重启…'; publish(); restart() }
      else { await reload(); if (!pending) message = '' }
      await send({ type: 'stable:dev:applied', id: request.id, action: request.action })
    } catch (error) {
      if (!pending && !disposed) pending = request
      if (!disposed && pending === request) message = String(error.message || error) + (request.action === 'restart' ? ' 请稍后再次点击重启应用。' : '')
      await send({ type: 'stable:dev:waiting', id: request.id, message: String(error.message || error) })
    } finally {
      // A failed readiness check or a newer revision consumes the click. A
      // timer must never reuse it to restart later without another confirmation.
      if (authorized === request.id) authorized = null
      active = false; publish()
    }
    return state()
  }
  function receive(incoming) {
    if (disposed || incoming?.type !== 'stable:dev:change' || !Number.isSafeInteger(incoming.id) || incoming.id <= revision || !['reload', 'restart'].includes(incoming.action)) return
    revision = incoming.id; authorized = null
    pending = { id: revision, action: pending?.action === 'restart' ? 'restart' : incoming.action, blocked: incoming.blocked === true }
    message = typeof incoming.message === 'string' && incoming.message ? incoming.message : notice(pending.action); publish()
    if (pending.action === 'reload') void attempt()
  }
  async function apply(expectedRevision) {
    if (disposed || !pending || expectedRevision !== revision) throw Object.assign(new Error('代码已再次更新，请确认最新变更后重试。'), { code: 'DEV_RELOAD_STALE' })
    if (pending.blocked) throw Object.assign(new Error(message || '源码或构建尚未通过检查，保留当前应用。'), { code: 'DEV_RELOAD_BLOCKED' })
    if (active) throw Object.assign(new Error('正在检查更新条件，请稍后重试。'), { code: 'DEV_RELOAD_BUSY' })
    authorized = expectedRevision
    await attempt()
    return state()
  }
  const timer = setInterval(() => void attempt(), intervalMs); timer.unref?.()
  return { receive, attempt, apply, state, dispose() { disposed = true; authorized = null; pending = null; message = ''; clearInterval(timer); publish() } }
}
module.exports={createDevReload}
